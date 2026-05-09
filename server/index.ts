import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { TradingBot, ReplayEngine } from './bot';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : Number(process.env.SERVER_PORT || 4005);
const clientId = process.env.DHAN_CLIENT_ID || 'demo-client-id';
const accessToken = process.env.DHAN_ACCESS_TOKEN || 'demo-access-token';
const bot = new TradingBot(clientId, accessToken);

function isMarketOpen(): boolean {
  // Use Indian Standard Time (IST)
  const now = new Date();
  const options = { timeZone: 'Asia/Kolkata', hour12: false };
  const formatter = new Intl.DateTimeFormat('en-US', { ...options, weekday: 'short', hour: 'numeric', minute: 'numeric' });
  const parts = formatter.formatToParts(now);
  
  const day = parts.find(p => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const time = hour * 100 + minute; // e.g. 9:15 -> 915

  if (day === 'Sat' || day === 'Sun') return false;

  return time >= 915 && time <= 1530;
}

app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

app.get('/api/status', (req, res) => {
  res.json({
    status: bot.interval ? 'Running' : 'Stopped',
    marketRegime: bot.marketRegime,
    isMarketOpen: isMarketOpen(),
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    marketRegime: bot.marketRegime,
    signals: bot.signals,
    trades: bot.tradeManager.trades,
    logs: bot.logs,
    isMarketOpen: isMarketOpen(),
  });
});

app.get('/api/config', (req, res) => {
  res.json(bot.strategyEngine.config);
});

app.post('/api/config', (req, res) => {
  bot.strategyEngine.config = { ...bot.strategyEngine.config, ...req.body };
  res.json({ success: true, config: bot.strategyEngine.config });
});

app.get('/api/connection', async (req, res) => {
  try {
    const result = await bot.dhanClient.verifyConnection();
    res.json(result);
  } catch (error) {
    res.json({ connected: false, error: (error as Error).message });
  }
});

app.get('/api/watchlist', (req, res) => {
  res.json(bot.watchlist);
});

app.post('/api/watchlist', (req, res) => {
  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Symbol is required' });
  if (!bot.watchlist.includes(symbol.toUpperCase())) {
    bot.watchlist.push(symbol.toUpperCase());
  }
  res.json({ success: true, watchlist: bot.watchlist });
});

app.delete('/api/watchlist/:symbol', (req, res) => {
  const { symbol } = req.params;
  bot.watchlist = bot.watchlist.filter(s => s !== symbol.toUpperCase());
  res.json({ success: true, watchlist: bot.watchlist });
});

app.get('/api/start', async (req, res) => {
  try {
    if (!isMarketOpen()) {
      return res.status(400).json({ success: false, error: 'Market is currently closed. Live trading not allowed.' });
    }
    await bot.dhanClient.loadScripMaster();
    await bot.start();
    res.json({ success: true, message: 'Trading bot started.' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/stop', (req, res) => {
  bot.stop();
  res.json({ success: true, message: 'Trading bot stopped.' });
});

app.post('/api/replay-test', async (req, res) => {
  try {
    const replayEngine = new ReplayEngine();
    let symbols: string[] = [];
    const amount = req.body.amount || 10000;
    
    await bot.dhanClient.loadScripMaster(); // Ensure mapping is loaded for correct security ID lookup

    if (req.body.symbol) {
      symbols = [req.body.symbol];
    } else {
      symbols = bot.watchlist;
    }

    const results = await replayEngine.runComprehensiveTest(symbols, bot.dhanClient, bot.strategyEngine, amount);

    res.json({
      success: true,
      message: 'Replay test completed',
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
