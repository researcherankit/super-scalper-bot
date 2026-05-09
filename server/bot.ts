import { Candle, IndicatorSnapshot, MarketRegime, Signal, TradeDirection, TradeStatus, TradeSummary } from './types';
import { DhanClient } from './dhanApi';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  let emaValue = values[0];
  for (let i = 1; i < values.length; i += 1) {
    emaValue = values[i] * k + emaValue * (1 - k);
  }
  return emaValue;
}

function rsi(values: number[], period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 1;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function vwap(candles: Candle[]) {
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const candle of candles) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typical * candle.volume;
    cumulativeVolume += candle.volume;
  }
  return cumulativeVolume ? cumulativePV / cumulativeVolume : candles[candles.length - 1].close;
}

function averageRange(candles: Candle[]) {
  if (!candles.length) return 0;
  return candles.reduce((acc, c) => acc + (c.high - c.low), 0) / candles.length;
}

function averageVolume(candles: Candle[]) {
  if (!candles.length) return 0;
  return candles.reduce((acc, c) => acc + c.volume, 0) / candles.length;
}

function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export class StrategyEngine {
  private customStrategies: Array<(symbol: string, candles: Candle[], indicators: IndicatorSnapshot) => Signal | null> = [];
  public config: any = {
    emaVwapLong: true,
    emaVwapShort: true,
    recovery: true,
    breakout: true,
    panicSell: true,
  };

  evaluate(symbol: string, candles: Candle[], indicators: IndicatorSnapshot): Signal[] {
    const latest = candles[candles.length - 1];
    const previous = candles[candles.length - 2] || latest;
    const signals: Signal[] = [];
    const volumeUp = latest.volume > indicators.volumeAvg * 1.1;
    const priceAboveEma = latest.close > indicators.ema9;
    const priceAboveVwap = latest.close > indicators.vwap;
    const priceBelowEma = latest.close < indicators.ema9;
    const priceBelowVwap = latest.close < indicators.vwap;

    const breakoutHigh = latest.close > previous.high && volumeUp;
    const breakdownLow = latest.close < previous.low && volumeUp;
    const strongGreen = latest.close > latest.open && latest.close - latest.open > (averageRange(candles) * 0.6);
    const strongRed = latest.open > latest.close && latest.open - latest.close > (averageRange(candles) * 0.6);

    const baseProbability = 0.45 + Math.min(0.25, (indicators.rsi - 50) / 100);

    if (this.config.emaVwapLong && priceAboveEma && priceAboveVwap && indicators.rsi > 50 && breakoutHigh) {
      signals.push({
        id: generateId('EMA'),
        symbol,
        strategy: 'EMA + VWAP Momentum Scalping',
        direction: 'long',
        probability: clamp(baseProbability + 0.18, 0, 1),
        entry: latest.close,
        stopLoss: previous.low,
        target: latest.close + (latest.close - previous.low) * 1.8,
      });
    }

    if (this.config.emaVwapShort && priceBelowEma && priceBelowVwap && indicators.rsi < 45 && breakdownLow) {
      signals.push({
        id: generateId('EMA'),
        symbol,
        strategy: 'EMA + VWAP Momentum Short',
        direction: 'short',
        probability: clamp(baseProbability + 0.16, 0, 1),
        entry: latest.close,
        stopLoss: previous.high,
        target: latest.close - (previous.high - latest.close) * 1.8,
      });
    }

    if (this.config.recovery && strongGreen && indicators.rsi > 50 && latest.close > indicators.ema9 && latest.close > indicators.vwap) {
      signals.push({
        id: generateId('Recovery'),
        symbol,
        strategy: 'Bullish Recovery Scalping',
        direction: 'long',
        probability: clamp(baseProbability + 0.2, 0, 1),
        entry: latest.close,
        stopLoss: Math.min(previous.low, latest.low),
        target: latest.close + (latest.close - previous.low) * 2,
      });
    }

    if (this.config.breakout && latest.close > previous.high && strongGreen && latest.volume > indicators.volumeAvg * 1.5) {
      signals.push({
        id: generateId('Breakout'),
        symbol,
        strategy: 'Resistance Breakout Absorption',
        direction: 'long',
        probability: clamp(baseProbability + 0.22, 0, 1),
        entry: latest.close,
        stopLoss: previous.low,
        target: latest.close + (latest.close - previous.low) * 1.7,
      });
    }

    if (this.config.panicSell && strongRed && latest.volume > indicators.volumeAvg * 2 && indicators.rsi < 35) {
      signals.push({
        id: generateId('Avoid'),
        symbol,
        strategy: 'Panic Sell Avoidance',
        direction: 'long',
        probability: 0.05,
        entry: latest.close,
        stopLoss: latest.high,
        target: latest.close,
      });
    }

    // Feature: Add more strategies later
    for (const strategyFn of this.customStrategies) {
      const customSignal = strategyFn(symbol, candles, indicators);
      if (customSignal) {
        signals.push(customSignal);
      }
    }

    return signals;
  }

  addCustomStrategy(strategyFn: (symbol: string, candles: Candle[], indicators: IndicatorSnapshot) => Signal | null) {
    this.customStrategies.push(strategyFn);
  }
}

export class MarketRegimeEngine {
  detect(candles: Candle[], indicators: IndicatorSnapshot): MarketRegime {
    const latest = candles[candles.length - 1];
    const previous = candles[candles.length - 2] || latest;
    const candleRange = latest.high - latest.low;
    const avgRange = averageRange(candles.slice(-10));
    const momentum = Math.abs(latest.close - previous.close) > avgRange * 0.8;
    const volumeSpike = latest.volume > averageVolume(candles.slice(-20)) * 1.8;
    const strongRed = latest.open > latest.close && latest.open - latest.close > avgRange * 0.6;

    if (momentum && volumeSpike) return 'trending';
    if (candleRange < avgRange * 0.6 && !momentum) return 'sideways';
    if (strongRed && volumeSpike && indicators.rsi < 40) return 'panicSell';
    return 'mixed';
  }
}


export class TradeManager {
  public trades: TradeSummary[] = [];
  public maxDailyLoss = 0.02;
  public dailyPnl = 0;
  public maxOpenPositions = 3;
  private initialCapital: number;

  constructor(initialCapital: number = 10000) {
    this.initialCapital = initialCapital;
  }

  canOpen() {
    const open = this.trades.filter((trade) => trade.status === 'open').length;
    return open < this.maxOpenPositions && this.dailyPnl > -this.maxDailyLoss * this.initialCapital;
  }

  openTrade(signal: Signal, quantity?: number) {
    if (!this.canOpen()) return null;
    const trade: TradeSummary = {
      id: generateId('TRADE'),
      symbol: signal.symbol,
      strategy: signal.strategy,
      direction: signal.direction,
      status: 'open',
      entry: signal.entry,
      pnl: 0,
      quantity: quantity || 1,
    };
    this.trades.push(trade);
    return trade;
  }

  closeTrade(tradeId: string, exitPrice: number) {
    const trade = this.trades.find((item) => item.id === tradeId);
    if (!trade || trade.status !== 'open') return;
    trade.exit = exitPrice;
    trade.status = 'closed';
    const diff = trade.direction === 'long'
      ? exitPrice - trade.entry
      : trade.entry - exitPrice;
    trade.pnl = diff * (trade.quantity || 1);
    this.dailyPnl += trade.pnl;
  }
}

export class ReplayEngine {
  async simulate(symbol: string, candles: Candle[], strategy: StrategyEngine, tradeManager: TradeManager, amount: number = 10000) {
    const results: { trade: TradeSummary; entryCandle: Candle }[] = [];
    let tradeCount = 0;

    for (let i = 20; i < candles.length && tradeCount < 500; i += 1) {
      const window = candles.slice(Math.max(0, i - 60), i + 1);
      const indicators: IndicatorSnapshot = {
        ema9: ema(window.map((c) => c.close), 9),
        vwap: vwap(window),
        rsi: rsi(window.map((c) => c.close), 14),
        averageRange: averageRange(window),
        volumeAvg: averageVolume(window),
      };

      const signals = strategy.evaluate(symbol, window, indicators);
      if (signals.length && signals[0].probability >= 0.65) {
        const signal = signals[0];
        const quantity = Math.max(1, Math.floor(amount / signal.entry));
        const trade = tradeManager.openTrade(signal, quantity);
        if (trade) {
          // Simulate trade exit after some time
          const exitIndex = Math.min(i + Math.floor(Math.random() * 10) + 5, candles.length - 1);
          const exitPrice = candles[exitIndex].close;
          tradeManager.closeTrade(trade.id, exitPrice);
          results.push({ trade, entryCandle: window[window.length - 1] });
          tradeCount++;
        }
      }
    }

    return results;
  }

  async runComprehensiveTest(symbols: string[], dhanClient: DhanClient, strategy: StrategyEngine, amount: number = 10000) {
    const allResults: { symbol: string; trades: any[]; stats: any }[] = [];

    for (const symbol of symbols) {
      const tradeManager = new TradeManager(amount);
      const candles = await dhanClient.fetchHistoricalCandles(symbol, '1m', 1000); // More data for testing

      const trades = await this.simulate(symbol, candles, strategy, tradeManager, amount);

      const winningTrades = trades.filter(t => t.trade.pnl > 0);
      const losingTrades = trades.filter(t => t.trade.pnl < 0);

      const stats = {
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
        totalPnL: trades.reduce((sum, t) => sum + t.trade.pnl, 0),
        avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.trade.pnl, 0) / winningTrades.length : 0,
        avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.trade.pnl, 0) / losingTrades.length : 0,
        profitFactor: losingTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.trade.pnl, 0) / Math.abs(losingTrades.reduce((sum, t) => sum + t.trade.pnl, 0)) : 0,
      };

      allResults.push({ symbol, trades, stats });
    }

    return allResults;
  }
}

export class TradingBot {
  public marketRegime: MarketRegime = 'mixed';
  public signals: Signal[] = [];
  public logs: string[] = [];
  public tradeManager = new TradeManager();
  public dhanClient: DhanClient;
  public strategyEngine = new StrategyEngine();
  public watchlist: string[] = ['TATAGOLD', 'GOLDBEES', 'COALINDIA', 'BHARTIARTL', 'BHEL'];
  private regimeEngine = new MarketRegimeEngine();
  public interval: ReturnType<typeof setInterval> | null = null;

  constructor(clientId: string, accessToken: string) {
    this.dhanClient = new DhanClient({ clientId, accessToken });
  }

  appendLog(message: string) {
    this.logs.push(`${new Date().toLocaleTimeString()} - ${message}`);
    if (this.logs.length > 80) this.logs.shift();
  }

  async load() {
    const watchlistData = await this.dhanClient.fetchWatchlist();
    this.watchlist = watchlistData.map((item: any) => item.symbol);
    this.appendLog(`Loaded watchlist: ${this.watchlist.join(', ')}`);
  }

  async tick() {
    const symbol = this.watchlist[Math.floor(Math.random() * this.watchlist.length)];
    const candles = await this.dhanClient.fetchHistoricalCandles(symbol, '5m', 60);
    const latest = candles[candles.length - 1];
    const indicators: IndicatorSnapshot = {
      ema9: ema(candles.map((c) => c.close), 9),
      vwap: vwap(candles),
      rsi: rsi(candles.map((c) => c.close), 14),
      averageRange: averageRange(candles),
      volumeAvg: averageVolume(candles),
    };

    this.marketRegime = this.regimeEngine.detect(candles, indicators);
    const signals = this.strategyEngine.evaluate(symbol, candles, indicators);
    this.signals = signals.sort((a, b) => b.probability - a.probability).slice(0, 5);

    this.appendLog(`Scanned ${symbol}: regime=${this.marketRegime}, signals=${this.signals.length}`);

    for (const signal of this.signals) {
      if (signal.probability >= 0.65 && this.tradeManager.canOpen()) {
        const quantity = 1; // Real live trading quantity could be calculated based on capital
        const trade = this.tradeManager.openTrade(signal, quantity);
        if (trade) {
          this.appendLog(`Opened trade ${trade.id} ${signal.direction.toUpperCase()} ${signal.symbol} @ ${signal.entry} (${signal.strategy})`);
        }
      }
    }
  }

  async start() {
    await this.load();
    await this.tick();
    this.interval = setInterval(async () => {
      try {
        await this.tick();
      } catch (error) {
        this.appendLog(`Tick error: ${(error as Error).message}`);
      }
    }, 10000);
    this.appendLog('Bot started.');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.appendLog('Bot stopped.');
    }
  }
}
