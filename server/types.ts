export type MarketRegime = 'trending' | 'sideways' | 'panicSell' | 'mixed';
export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'open' | 'closed' | 'breakeven';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  id: string;
  symbol: string;
  strategy: string;
  direction: TradeDirection;
  probability: number;
  entry: number;
  stopLoss: number;
  target: number;
}

export interface TradeSummary {
  id: string;
  symbol: string;
  strategy: string;
  direction: TradeDirection;
  status: TradeStatus;
  entry: number;
  exit?: number;
  pnl: number;
  quantity?: number;
}

export interface IndicatorSnapshot {
  ema9: number;
  vwap: number;
  rsi: number;
  averageRange: number;
  volumeAvg: number;
}

export interface StrategyConfig {
  emaVwapLong?: boolean;
  emaVwapShort?: boolean;
  recovery?: boolean;
  breakout?: boolean;
  panicSell?: boolean;
  [key: string]: boolean | string | undefined;
}
