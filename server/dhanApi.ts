import { Candle } from './types';

export interface DhanCredentials {
  clientId: string;
  accessToken: string;
}

// Dhan API uses securityId (numeric) not trading symbols.
// This maps common symbols to their Dhan security IDs for NSE_EQ.
// You can find full list at: https://dhanhq.co/docs/v2/instruments/
const SECURITY_ID_MAP: Record<string, string> = {
  'TATAGOLD': '149881',
  'GOLDBEES': '16600',
  'COALINDIA': '20374',
  'BHARTIARTL': '10604',
  'BHEL': '438',
  'RELIANCE': '2885',
  'HDFCBANK': '1333',
  'TCS': '11536',
  'INFY': '1594',
  'SBIN': '3045',
  'TATAMOTORS': '3456',
  'ITC': '1660',
  'WIPRO': '3787',
  'LT': '11483',
  'ICICIBANK': '4963',
};

export class DhanClient {
  private readonly baseUrl = 'https://api.dhan.co/v2';
  private readonly credentials: DhanCredentials;
  private dynamicSecurityIdMap: Record<string, string> = {};
  public scripMasterLoaded = false;

  constructor(credentials: DhanCredentials) {
    this.credentials = credentials;
  }

  private isConfigured(): boolean {
    return (
      this.credentials.accessToken !== 'demo-access-token' &&
      this.credentials.clientId !== 'demo-client-id' &&
      this.credentials.accessToken.length > 10 &&
      this.credentials.clientId.length > 3
    );
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'access-token': this.credentials.accessToken,
      'client-id': this.credentials.clientId,
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Dhan API Error: ${response.status} ${response.statusText} — ${body}`);
    }
    return response.json();
  }

  /**
   * Verify the connection to Dhan by fetching the user profile.
   * Returns true if connected, false otherwise.
   */
  async verifyConnection(): Promise<{ connected: boolean; clientName?: string; error?: string; balance?: number }> {
    if (!this.isConfigured()) {
      return { connected: false, error: 'Credentials not configured. Set DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN in .env' };
    }
    try {
      // Use the funds/fundlimit endpoint which is a lightweight call
      const data = await this.request('/fundlimit');
      const balance = data.availabelBalance ?? data.availableBalance ?? data.sodLimit ?? 0;
      return { connected: true, clientName: this.credentials.clientId, balance };
    } catch (err) {
      return { connected: false, error: (err as Error).message };
    }
  }

  /**
   * Loads the official Dhan Scrip Master to resolve any NSE Equity symbol.
   */
  async loadScripMaster() {
    if (this.scripMasterLoaded) return;
    try {
      const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv');
      const text = await res.text();
      const lines = text.split('\n');
      let count = 0;
      for (const line of lines) {
        if (!line || line.startsWith('SEM_')) continue;
        const parts = line.split(',');
        if (parts.length > 5 && parts[0] === 'NSE' && (parts[1] === 'E' || parts[1] === 'EQ')) {
          const securityId = parts[2];
          const symbol = parts[5];
          this.dynamicSecurityIdMap[symbol.toUpperCase()] = securityId;
          count++;
        }
      }
      this.scripMasterLoaded = true;
      console.log(`Loaded ${count} active symbols from Dhan Scrip Master`);
    } catch (e) {
      console.error('Failed to load Dhan Scrip Master', e);
    }
  }

  /**
   * Resolve a trading symbol to a Dhan securityId.
   */
  getSecurityId(symbol: string): string | undefined {
    return this.dynamicSecurityIdMap[symbol.toUpperCase()] || SECURITY_ID_MAP[symbol.toUpperCase()];
  }

  /**
   * Fetch real intraday historical candles from Dhan API.
   * Endpoint: POST /v2/charts/intraday
   * 
   * interval: "1" | "5" | "15" | "25" | "60"
   * limit: number of candles (used to calculate fromDate)
   */
  async fetchHistoricalCandles(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
    const securityId = this.getSecurityId(symbol);

    if (!this.isConfigured()) {
      return this.generateSimulatedCandles(symbol, limit);
    }
    
    if (!securityId) {
      throw new Error(`Invalid symbol: ${symbol}. Not found in Dhan NSE Equity database.`);
    }

    // Map interval string to Dhan format
    const dhanInterval = interval.replace('m', ''); // '1m' → '1', '5m' → '5'

    // Calculate date range — Dhan allows max 90 days for intraday
    const now = new Date();
    const fromDate = new Date(now);
    // For 1-min candles, 1000 candles ≈ ~3 trading days. Request 5 days to be safe.
    const daysBack = Math.min(90, Math.ceil(limit / 375) + 2); // 375 candles per trading day (1-min)
    fromDate.setDate(fromDate.getDate() - daysBack);

    const formatDateTime = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    };

    try {
      const body = {
        securityId,
        exchangeSegment: 'NSE_EQ',
        instrument: 'EQUITY',
        interval: dhanInterval,
        oi: false,
        fromDate: formatDateTime(fromDate),
        toDate: formatDateTime(now),
      };

      const data = await this.request('/charts/intraday', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // Dhan returns arrays: open[], high[], low[], close[], volume[], timestamp[]
      if (!data || !data.open || !data.open.length) {
        console.warn(`No candle data returned for ${symbol}, falling back to simulated data`);
        return this.generateSimulatedCandles(symbol, limit);
      }

      const candles: Candle[] = [];
      const count = Math.min(data.open.length, limit);
      const startIndex = Math.max(0, data.open.length - count);

      for (let i = startIndex; i < data.open.length; i++) {
        candles.push({
          time: data.timestamp[i] * 1000, // Dhan returns Unix seconds, we use milliseconds
          open: data.open[i],
          high: data.high[i],
          low: data.low[i],
          close: data.close[i],
          volume: data.volume[i],
        });
      }

      return candles;
    } catch (err) {
      console.warn(`Failed to fetch real data for ${symbol}: ${(err as Error).message}. Using simulated data.`);
      return this.generateSimulatedCandles(symbol, limit);
    }
  }

  /**
   * Fetch real daily historical candles from Dhan API.
   * Endpoint: POST /v2/charts/historical
   */
  async fetchDailyCandles(symbol: string, daysBack = 30): Promise<Candle[]> {
    const securityId = this.getSecurityId(symbol);
    
    if (!this.isConfigured()) {
      return this.generateSimulatedCandles(symbol, daysBack);
    }

    if (!securityId) {
      throw new Error(`Invalid symbol: ${symbol}. Not found in Dhan NSE Equity database.`);
    }

    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - daysBack);

    const formatDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    try {
      const body = {
        securityId,
        exchangeSegment: 'NSE_EQ',
        instrument: 'EQUITY',
        expiryCode: 0,
        oi: false,
        fromDate: formatDate(fromDate),
        toDate: formatDate(now),
      };

      const data = await this.request('/charts/historical', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!data || !data.open || !data.open.length) {
        return this.generateSimulatedCandles(symbol, daysBack);
      }

      const candles: Candle[] = [];
      for (let i = 0; i < data.open.length; i++) {
        candles.push({
          time: data.timestamp[i] * 1000,
          open: data.open[i],
          high: data.high[i],
          low: data.low[i],
          close: data.close[i],
          volume: data.volume[i],
        });
      }
      return candles;
    } catch (err) {
      console.warn(`Failed to fetch daily data for ${symbol}: ${(err as Error).message}`);
      return this.generateSimulatedCandles(symbol, daysBack);
    }
  }

  /**
   * Fallback: generate simulated candle data when Dhan is not connected.
   */
  private generateSimulatedCandles(symbol: string, limit: number): Candle[] {
    const basePrice = this.getBasePrice(symbol);
    const candles: Candle[] = [];
    const now = Date.now();

    for (let i = limit; i >= 1; i--) {
      const time = now - (i * 60 * 1000);
      const volatility = this.getVolatility(symbol);
      const trend = Math.sin(i / 20) * volatility;
      const noise = (Math.random() - 0.5) * volatility * 0.5;

      const close = basePrice + trend + noise;
      const range = volatility * (0.5 + Math.random() * 0.5);
      const high = close + range * Math.random();
      const low = close - range * Math.random();
      const open = low + (high - low) * Math.random();
      const volume = 1000 + Math.random() * 5000;

      candles.push({
        time,
        open: Math.max(0, open),
        high: Math.max(0, high),
        low: Math.max(0, low),
        close: Math.max(0, close),
        volume,
      });
    }

    return candles;
  }

  private getBasePrice(symbol: string): number {
    const prices: Record<string, number> = {
      'TATAGOLD': 65,
      'GOLDBEES': 58,
      'COALINDIA': 480,
      'BHARTIARTL': 1400,
      'BHEL': 280,
      'RELIANCE': 2900,
      'HDFCBANK': 1850,
      'TCS': 3800,
      'INFY': 1500,
      'SBIN': 780,
    };
    return prices[symbol] || 100;
  }

  private getVolatility(symbol: string): number {
    const volatilities: Record<string, number> = {
      'TATAGOLD': 2,
      'GOLDBEES': 1.5,
      'COALINDIA': 8,
      'BHARTIARTL': 25,
      'BHEL': 12,
      'RELIANCE': 30,
      'HDFCBANK': 20,
      'TCS': 40,
      'INFY': 20,
      'SBIN': 15,
    };
    return volatilities[symbol] || 5;
  }

  async fetchWatchlist() {
    return [
      { symbol: 'TATAGOLD', exchange: 'NSE', securityId: '149881' },
      { symbol: 'GOLDBEES', exchange: 'NSE', securityId: '16600' },
      { symbol: 'COALINDIA', exchange: 'NSE', securityId: '20374' },
      { symbol: 'BHARTIARTL', exchange: 'NSE', securityId: '10604' },
      { symbol: 'BHEL', exchange: 'NSE', securityId: '438' },
    ];
  }

  /**
   * Place a real order on Dhan.
   * Endpoint: POST /v2/orders
   */
  async placeOrder(params: {
    symbol: string;
    quantity: number;
    price: number;
    side: 'BUY' | 'SELL';
    orderType?: 'MARKET' | 'LIMIT';
    productType?: 'INTRADAY' | 'CNC';
  }) {
    const securityId = this.getSecurityId(params.symbol);
    if (!securityId) {
      throw new Error(`Unknown symbol: ${params.symbol}. Add it to SECURITY_ID_MAP in dhanApi.ts`);
    }
    if (!this.isConfigured()) {
      // Simulate if not connected
      return { orderId: `SIM-${Date.now()}`, orderStatus: 'SIMULATED' };
    }

    const body = {
      dhanClientId: this.credentials.clientId,
      transactionType: params.side,
      exchangeSegment: 'NSE_EQ',
      productType: params.productType || 'INTRADAY',
      orderType: params.orderType || 'MARKET',
      validity: 'DAY',
      securityId,
      quantity: String(params.quantity),
      price: params.orderType === 'LIMIT' ? String(params.price) : '',
      triggerPrice: '',
      afterMarketOrder: false,
      amoTime: '',
      boProfitValue: '',
      boStopLossValue: '',
    };

    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Get order book for the day.
   */
  async getOrderBook() {
    if (!this.isConfigured()) return [];
    return this.request('/orders');
  }
}
