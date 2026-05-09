export type MarketRegime = 'trending' | 'sideways' | 'panicSell' | 'mixed';

export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'open' | 'closed' | 'breakeven';

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

export interface DashboardPayload {
  marketRegime: MarketRegime;
  signals: Signal[];
  trades: TradeSummary[];
  logs: string[];
  isMarketOpen: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  clientName?: string;
  error?: string;
  balance?: number;
}
