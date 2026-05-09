import { useEffect, useMemo, useState } from 'react';
import { MarketRegime, Signal, TradeSummary, ConnectionStatus } from './types';

const regimeLabels: Record<MarketRegime, string> = {
  trending: 'Trending',
  sideways: 'Sideways',
  panicSell: 'Panic Sell',
  mixed: 'Mixed',
};

function App() {
  const [status, setStatus] = useState('Offline');
  const [regime, setRegime] = useState<MarketRegime>('mixed');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<TradeSummary[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [probabilityThreshold, setProbabilityThreshold] = useState(0.65);
  const [replayResults, setReplayResults] = useState<any[]>([]);
  const [isReplayRunning, setIsReplayRunning] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('Never');
  const [isMarketOpen, setIsMarketOpen] = useState(true);
  const [replaySymbol, setReplaySymbol] = useState('');
  const [replayAmount, setReplayAmount] = useState(10000);
  const [strategyConfig, setStrategyConfig] = useState<any>({});
  const [connection, setConnection] = useState<ConnectionStatus>({ connected: false });
  const [connectionChecking, setConnectionChecking] = useState(true);
  const [dataSource, setDataSource] = useState<'live' | 'simulated'>('simulated');
  const [watchlist, setWatchlist] = useState<string[]>(['TATAGOLD', 'GOLDBEES', 'COALINDIA', 'BHARTIARTL', 'BHEL']);
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState('');
  const [isWatchlistEditing, setIsWatchlistEditing] = useState(false);

  const checkConnection = async () => {
    setConnectionChecking(true);
    try {
      const res = await fetch('/api/connection');
      const data: ConnectionStatus = await res.json();
      setConnection(data);
      setDataSource(data.connected ? 'live' : 'simulated');
    } catch {
      setConnection({ connected: false, error: 'Server unreachable' });
      setDataSource('simulated');
    } finally {
      setConnectionChecking(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setStrategyConfig(data);
    } catch (error) {
      console.error('Failed to fetch config', error);
    }
  };

  const updateConfig = async (key: string, value: any) => {
    try {
      const newConfig = { ...strategyConfig, [key]: value };
      setStrategyConfig(newConfig);
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
    } catch (error) {
      console.error('Failed to update config', error);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setWatchlist(data);
      }
    } catch (error) {
      console.error('Failed to fetch watchlist', error);
    }
  };

  const addToWatchlist = async () => {
    if (!newWatchlistSymbol.trim()) return;
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newWatchlistSymbol.trim().toUpperCase() })
      });
      const data = await res.json();
      if (data.success) {
        setWatchlist(data.watchlist);
        setNewWatchlistSymbol('');
      }
    } catch (error) {
      console.error('Failed to add to watchlist', error);
    }
  };

  const removeFromWatchlist = async (symbol: string) => {
    try {
      const res = await fetch(`/api/watchlist/${symbol}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setWatchlist(data.watchlist);
      }
    } catch (error) {
      console.error('Failed to remove from watchlist', error);
    }
  };

  const refreshDashboard = async () => {
    try {
      const statusResponse = await fetch('/api/status');
      if (!statusResponse.ok) throw new Error('Status fetch failed');
      const statusData = await statusResponse.json();
      setStatus(statusData.status);
      setRegime(statusData.marketRegime);

      const dashboardResponse = await fetch('/api/dashboard');
      if (!dashboardResponse.ok) throw new Error('Dashboard fetch failed');
      const dashboardData = await dashboardResponse.json();
      setRegime(dashboardData.marketRegime);
      setSignals(dashboardData.signals);
      setTrades(dashboardData.trades);
      setLogs(dashboardData.logs);
      if (dashboardData.isMarketOpen !== undefined) {
        setIsMarketOpen(dashboardData.isMarketOpen);
      }
      setApiError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      setApiError((error as Error).message);
      setStatus('Offline');
    }
  };

  useEffect(() => {
    checkConnection();
    fetchConfig();
    fetchWatchlist();
    refreshDashboard();
    const interval = window.setInterval(refreshDashboard, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const startBot = async () => {
    try {
      const response = await fetch('/api/start');
      if (!response.ok) throw new Error('Start request failed');
      setStatus('Running');
    } catch (error) {
      setApiError((error as Error).message);
    }
  };

  const stopBot = async () => {
    try {
      await fetch('/api/stop');
      setStatus('Stopped');
    } catch (error) {
      console.error('Failed to stop bot:', error);
    }
  };

  const runReplayTest = async () => {
    setIsReplayRunning(true);
    try {
      const body: any = { amount: replayAmount };
      if (replaySymbol.trim()) {
        body.symbol = replaySymbol.trim().toUpperCase();
      }
      const response = await fetch('/api/replay-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (data.success) {
        setReplayResults(data.results);
      } else {
        setApiError(data.error);
      }
    } catch (error) {
      console.error('Replay test failed:', error);
      setApiError((error as Error).message);
    } finally {
      setIsReplayRunning(false);
    }
  };

  const goodSignals = useMemo(
    () => signals.filter((signal) => signal.probability >= probabilityThreshold),
    [signals, probabilityThreshold],
  );

  return (
    <div className="app-shell">
      {apiError && (
        <div className="error-banner">
          <strong>API Error:</strong> {apiError}
        </div>
      )}
      <header className="topbar">
        <div>
          <h1>Dhan Scalping AI Bot</h1>
          <p>Clean strategy dashboard for momentum, panic recovery, breakout, and box trading.</p>
          {!isMarketOpen && (
            <div style={{ color: 'var(--danger)', marginTop: '8px', fontWeight: 'bold' }}>
              ⚠️ Market is currently closed. Only replay / paper trading is available.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div className="status-pill">Server: {status}</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: connection.connected
                ? 'rgba(46, 204, 113, 0.15)'
                : 'rgba(231, 76, 60, 0.15)',
              color: connection.connected ? '#2ecc71' : '#e74c3c',
              border: `1px solid ${connection.connected ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`,
              cursor: 'pointer',
            }}
            onClick={checkConnection}
            title={connection.error || 'Click to re-check connection'}
          >
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connectionChecking
                ? '#f39c12'
                : connection.connected ? '#2ecc71' : '#e74c3c',
              display: 'inline-block',
              animation: connectionChecking ? 'pulse 1s infinite' : 'none',
            }} />
            {connectionChecking
              ? 'Checking...'
              : connection.connected
                ? `Dhan: Connected (${connection.clientName})`
                : 'Dhan: Disconnected'
            }
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: dataSource === 'live' ? '#2ecc71' : '#f39c12',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            {connection.balance !== undefined && dataSource === 'live' && (
              <span style={{ color: '#e8f1ff', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '8px' }}>
                Balance: ₹{connection.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            )}
            <span>
              Data: {dataSource === 'live' ? '📡 Live from Dhan API' : '🔄 Simulated (demo mode)'}
            </span>
          </div>
        </div>
      </header>

      <section className="grid-two">
        <div className="card">
          <div className="section-label">Live Market Snapshot</div>
          <div className="summary-grid">
            <div className="summary-card">
              <span>Market Regime</span>
              <strong>{isMarketOpen ? regimeLabels[regime] : '-'}</strong>
            </div>
            <div className="summary-card">
              <span>Active Signals</span>
              <strong>{goodSignals.length}</strong>
            </div>
            <div className="summary-card">
              <span>Open Trades</span>
              <strong>{trades.filter((trade) => trade.status === 'open').length}</strong>
            </div>
            <div className="summary-card">
              <span>Last Update</span>
              <strong>{lastUpdated}</strong>
            </div>
          </div>

          <div className="watchlist-card">
            <div className="watchlist-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Watchlist
              <button 
                onClick={() => setIsWatchlistEditing(!isWatchlistEditing)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0, opacity: 0.7 }}
                title="Edit Watchlist"
              >
                ✏️
              </button>
            </div>
            <div className="watchlist-grid" style={{ marginBottom: isWatchlistEditing ? '12px' : '0' }}>
              {watchlist.map((symbol) => (
                <span key={symbol} className="watchlist-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {symbol}
                  {isWatchlistEditing && (
                    <button 
                      onClick={() => removeFromWatchlist(symbol)}
                      style={{ background: 'transparent', border: 'none', color: '#ff6f6f', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: 1 }}
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            {isWatchlistEditing && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input 
                  type="text" 
                  placeholder="Add Symbol..." 
                  value={newWatchlistSymbol}
                  onChange={(e) => setNewWatchlistSymbol(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addToWatchlist()}
                  style={{ flex: 1, padding: '6px 12px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                />
                <button 
                  onClick={addToWatchlist}
                  style={{ padding: '6px 12px', borderRadius: '14px', border: 'none', background: 'rgba(69, 142, 255, 0.2)', color: '#458eff', cursor: 'pointer', fontWeight: 600 }}
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-label">Bot Control Center</div>
          <div className="button-row">
            <button className="action-button" onClick={refreshDashboard}>
              Refresh
            </button>
            <button className="action-button" onClick={startBot} disabled={status === 'Running' || !isMarketOpen}>
              Start
            </button>
            <button className="action-button danger" onClick={stopBot} disabled={status === 'Stopped' || status === 'Offline'}>
              Stop
            </button>
          </div>

          <div className="control-panel">
            <label>Confidence threshold</label>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={probabilityThreshold}
              onChange={(e) => setProbabilityThreshold(parseFloat(e.target.value))}
            />
            <div className="range-labels">
              <span>30%</span>
              <span>{Math.round(probabilityThreshold * 100)}%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="control-panel" style={{ marginTop: '16px' }}>
            <label style={{ marginBottom: '8px', display: 'block', fontWeight: 'bold' }}>Active Strategies</label>
            {Object.keys(strategyConfig).map((key) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '4px' }}>
                <input 
                  type="checkbox" 
                  checked={strategyConfig[key]} 
                  onChange={(e) => updateConfig(key, e.target.checked)}
                />
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
            ))}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="Symbol (e.g. TATAGOLD)" 
              value={replaySymbol}
              onChange={(e) => setReplaySymbol(e.target.value)}
              style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <input 
              type="number" 
              placeholder="Amount" 
              value={replayAmount}
              onChange={(e) => setReplayAmount(Number(e.target.value))}
              style={{ width: '100px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <button className="replay-button" onClick={runReplayTest} disabled={isReplayRunning} style={{ flex: '1 1 100%' }}>
              {isReplayRunning ? 'Running Replay Test...' : 'Run Replay Test'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid-three">
        <div className="card wide-card">
          <h2>Live Trade Log</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>PnL</th>
                  <th>Strategy</th>
                </tr>
              </thead>
              <tbody>
                {trades.length ? (
                  trades.map((trade) => (
                    <tr key={trade.id}>
                      <td>{trade.symbol}</td>
                      <td>{trade.direction}</td>
                      <td>{trade.status}</td>
                      <td className={trade.pnl >= 0 ? 'positive' : 'negative'}>{trade.pnl.toFixed(2)}</td>
                      <td>{trade.strategy}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      No active trades yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Top Signals</h2>
          <div className="signal-list">
            {goodSignals.length ? (
              goodSignals.slice(0, 6).map((signal) => (
                <div key={signal.id} className="signal-chip">
                  <div>
                    <strong>{signal.symbol}</strong>
                    <p>{signal.strategy}</p>
                  </div>
                  <span>{Math.round(signal.probability * 100)}%</span>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--muted)' }}>No strong signals found yet.</p>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Alerts & Analytics</h2>
          <div className="log-box">
            {logs.slice(-8).map((line, index) => (
              <div key={`${line}-${index}`} className="log-line">
                {line}
              </div>
            ))}
          </div>
        </div>
      </section>

      {replayResults.length > 0 && (
        <section className="grid-three">
          <div className="card wide-card">
            <h2>Replay Test Results (500+ trades)</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Total Trades</th>
                    <th>Win Rate</th>
                    <th>Total PnL</th>
                    <th>Avg Win</th>
                    <th>Avg Loss</th>
                    <th>Profit Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {replayResults.map((result) => (
                    <tr key={result.symbol}>
                      <td>{result.symbol}</td>
                      <td>{result.stats.totalTrades}</td>
                      <td>{result.stats.winRate.toFixed(1)}%</td>
                      <td style={{ color: result.stats.totalPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {result.stats.totalPnL.toFixed(2)}
                      </td>
                      <td style={{ color: 'var(--success)' }}>{result.stats.avgWin.toFixed(2)}</td>
                      <td style={{ color: 'var(--danger)' }}>{result.stats.avgLoss.toFixed(2)}</td>
                      <td>{result.stats.profitFactor.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Test Summary</h2>
            <div style={{ marginBottom: '16px' }}>
              <strong>Total Symbols:</strong> {replayResults.length}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <strong>Total Trades:</strong> {replayResults.reduce((sum, r) => sum + r.stats.totalTrades, 0)}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <strong>Avg Win Rate:</strong> {(replayResults.reduce((sum, r) => sum + r.stats.winRate, 0) / replayResults.length).toFixed(1)}%
            </div>
            <div>
              <strong>Total PnL:</strong>
              <span style={{ color: replayResults.reduce((sum, r) => sum + r.stats.totalPnL, 0) >= 0 ? 'var(--success)' : 'var(--danger)', marginLeft: '8px' }}>
                {replayResults.reduce((sum, r) => sum + r.stats.totalPnL, 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Test Conditions</h2>
            <ul style={{ fontSize: '0.9rem' }}>
              <li>500+ trades minimum per symbol</li>
              <li>1-minute timeframe</li>
              <li>Trend + sideways + crash conditions</li>
              <li>Probability threshold: 65%</li>
              <li>Risk management active</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
