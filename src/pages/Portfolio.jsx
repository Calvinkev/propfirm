import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './Portfolio.css';

const PRICE_MAP = {
  USDT: 1, BTC: 67500, ETH: 3500, SOL: 155, BNB: 580,
  XRP: 0.55, DOGE: 0.12, ADA: 0.45,
};

export default function Portfolio() {
  const { token } = useAuth();
  const [balances, setBalances]   = useState([]);
  const [earnPos, setEarnPos]     = useState([]);
  const [overview, setOverview]   = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [balRes, earnRes, ovRes] = await Promise.all([
          api.getWalletBalances(token),
          api.getEarnPositions(token),
          api.getDashboardOverview(token).catch(() => ({ overview: null })),
        ]);
        if (balRes.balances) setBalances(balRes.balances);
        if (earnRes.positions) setEarnPos(earnRes.positions);
        if (ovRes.overview) setOverview(ovRes.overview);
      } catch (err) {
        console.error('Portfolio load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const spotUSDT = balances.reduce((s, b) => {
    const price = PRICE_MAP[b.asset] || 1;
    return s + (parseFloat(b.free) + parseFloat(b.locked)) * price;
  }, 0);

  const earnUSDT = earnPos
    .filter(p => p.status === 'active')
    .reduce((s, p) => {
      const price = PRICE_MAP[p.asset] || 1;
      return s + parseFloat(p.amount) * price;
    }, 0);

  const totalUSDT = spotUSDT + earnUSDT;

  const allocations = balances
    .map(b => {
      const price = PRICE_MAP[b.asset] || 1;
      const usd = (parseFloat(b.free) + parseFloat(b.locked)) * price;
      return { asset: b.asset, usd, pct: totalUSDT > 0 ? (usd / totalUSDT) * 100 : 0 };
    })
    .filter(a => a.usd > 0)
    .sort((a, b) => b.usd - a.usd);

  const COLORS = ['#F0B90B','#0ECB81','#F6465D','#2B8AFC','#9B59B6','#E67E22','#1ABC9C','#E91E63'];

  if (loading) return <div className="portfolio-page"><div className="pf-loading">Loading portfolio...</div></div>;

  return (
    <div className="portfolio-page">
      <div className="pf-container">
        <div className="pf-header">
          <h1>Portfolio Overview</h1>
          <p>Your complete asset allocation across all wallets</p>
        </div>

        {/* Total Balance Banner */}
        <div className="pf-banner">
          <div className="pf-banner-left">
            <span className="pf-banner-label">Total Estimated Balance</span>
            <div className="pf-banner-value">
              ${totalUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="pf-banner-denom"> USDT</span>
            </div>
          </div>
          <div className="pf-banner-right">
            <div className="pf-wallet-split">
              <div className="pf-split-item">
                <span className="pf-split-label">Spot Wallet</span>
                <span className="pf-split-val">${spotUSDT.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="pf-split-divider" />
              <div className="pf-split-item">
                <span className="pf-split-label">Earn Wallet</span>
                <span className="pf-split-val">${earnUSDT.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pf-grid">
          {/* Allocation chart */}
          <div className="pf-card">
            <h2>Asset Allocation</h2>
            <div className="alloc-list">
              {allocations.map((a, i) => (
                <div key={a.asset} className="alloc-row">
                  <div className="alloc-left">
                    <span className="alloc-dot" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="alloc-asset">{a.asset}</span>
                  </div>
                  <div className="alloc-bar-wrap">
                    <div className="alloc-bar">
                      <div className="alloc-fill" style={{ width: `${a.pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="alloc-pct">{a.pct.toFixed(1)}%</span>
                  </div>
                  <span className="alloc-usd">${a.usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
              {allocations.length === 0 && <div className="pf-empty">No assets in wallet</div>}
            </div>
          </div>

          {/* Spot balances */}
          <div className="pf-card">
            <div className="pf-card-head">
              <h2>Spot Wallet</h2>
              <Link to="/wallet" className="pf-link">Manage →</Link>
            </div>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Available</th>
                  <th>Locked</th>
                  <th>USD Value</th>
                </tr>
              </thead>
              <tbody>
                {balances.filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0).map(b => {
                  const usd = (parseFloat(b.free) + parseFloat(b.locked)) * (PRICE_MAP[b.asset] || 1);
                  return (
                    <tr key={b.asset}>
                      <td><b>{b.asset}</b></td>
                      <td className="mono">{parseFloat(b.free).toFixed(6)}</td>
                      <td className="mono">{parseFloat(b.locked).toFixed(6)}</td>
                      <td className="mono">${usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Earn positions */}
          <div className="pf-card">
            <div className="pf-card-head">
              <h2>Earn Positions</h2>
              <Link to="/earn" className="pf-link">View Earn →</Link>
            </div>
            {earnPos.filter(p => p.status === 'active').length === 0 ? (
              <div className="pf-empty">
                <p>No active earn positions.</p>
                <Link to="/earn" className="pf-earn-cta">Start Earning →</Link>
              </div>
            ) : (
              <table className="pf-table">
                <thead>
                  <tr><th>Asset</th><th>Type</th><th>APY</th><th>Amount</th><th>Interest</th></tr>
                </thead>
                <tbody>
                  {earnPos.filter(p => p.status === 'active').map(p => (
                    <tr key={p.id}>
                      <td><b>{p.asset}</b></td>
                      <td><span className={`earn-type ${p.type}`}>{p.type}</span></td>
                      <td className="mono pos">{p.apy}%</td>
                      <td className="mono">{parseFloat(p.amount).toFixed(6)}</td>
                      <td className="mono pos">+{parseFloat(p.accrued_interest).toFixed(8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Quick stats */}
          <div className="pf-card pf-stats-card">
            <h2>Account Stats</h2>
            <div className="pf-stats-grid">
              <div className="pf-stat">
                <span className="pf-stat-label">Total Trades</span>
                <span className="pf-stat-val">{overview?.totalTrades ?? '—'}</span>
              </div>
              <div className="pf-stat">
                <span className="pf-stat-label">Total P&L</span>
                <span className={`pf-stat-val ${parseFloat(overview?.totalPnL) >= 0 ? 'pos' : 'neg'}`}>
                  ${parseFloat(overview?.totalPnL || 0).toFixed(2)}
                </span>
              </div>
              <div className="pf-stat">
                <span className="pf-stat-label">Active Accounts</span>
                <span className="pf-stat-val">{overview?.activeAccounts ?? '—'}</span>
              </div>
              <div className="pf-stat">
                <span className="pf-stat-label">Pass Rate</span>
                <span className="pf-stat-val pos">{overview?.challengePassRate ?? '—'}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
