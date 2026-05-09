# Dhan Scalping Trading Bot

A clean UI/UX trading bot architecture for Dhan.tv built around systematic scalping, recovery, breakout, and risk management strategies.

## Overview

- Implements a master bot architecture inspired by Dhan API v2.
- Includes market regime detection, strategy scanning, risk management, replay engine, and analytics.
- Clean React + Vite frontend with a simple dashboard.
- Express backend with placeholder integrations for Dhan API and historical replay.

## Features

- EMA + VWAP momentum scalps
- Panic sell avoidance and recovery scalps
- Failed breakdown / trapped sellers logic
- Resistance breakout absorption and multi-day box strategy
- RSI exhaustion and sideways chop filters
- Live scanning, trade management, and analytics
- **Replay testing with specific stocks and amounts** or 500+ trades across different conditions
- **Market Hours Detection**: The bot intelligently blocks live trading outside Indian market hours (9:15 AM - 3:30 PM IST).
- **Extensible Architecture**: Easily add more custom strategies via `addCustomStrategy()`.

## Recommended First Test

Test on these instruments:
- **Tata Gold ETF** (TATAGOLD)
- **GOLDBEES**
- **Coal India** (COALINDIA)
- **BHARTIARTL**
- **BHEL**

Timeframes: 1-minute, 5-minute

**Replay Testing**: Use Dhan.tv replay feature for paper trading with historical data (500+ trades minimum, different market conditions: trend + sideways + crash).

## Setup

1. Install dependencies:

```bash
cd /home/kali/Desktop/Scalpar Trading
npm install
```

2. Add your Dhan API credentials to `.env`:

```bash
DHAN_CLIENT_ID=your_client_id_here
DHAN_ACCESS_TOKEN=your_access_token_here
```

3. Start development server:

```bash
npm run dev
```

4. In a second terminal, start the API server:

```bash
npm run server
```

5. Open the UI in your browser:
- `http://localhost:5173`

## Testing the Bot

1. **Replay Testing**: Enter a specific stock symbol and an investment amount in the dashboard, or run a full comprehensive test (500+ trades).
2. **Live Trading**: Use "Start Bot" to begin live scanning (requires Dhan API integration and market to be open).
3. **Monitor**: Watch the dashboard for signals, trades, and analytics

## Notes

- `server/dhanApi.ts` includes placeholder methods for Dhan v2 endpoints. Replace these with your authenticated Dhan account integration.
- The bot uses simulated order execution and replay logic for testing before live execution.
