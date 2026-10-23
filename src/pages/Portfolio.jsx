import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import CryptoIcon from '../components/CryptoIcon';
import './Portfolio.css';

export default function Portfolio() {
  const { token } = useAuth();
  const [balances, setBalances]   = useState([]);
  const [earnPos, setEarnPos]     = useState([]);
  const [overview, setOverview]   = useState(null);
  const [liveMarkets, setLiveMarkets] = useState({});
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [balRes, earnRes, ovRes, mktRes] = await Promise.all([
          api.getWalletBalances(token),
          api.getEarnPositions(token),
          api.getDashboardOverview(token).catch(() => ({ overview: null })),
          api.getMarketOverview().catch(() => ({ markets: {} })),
        ]);
        if (balRes.balances) setBalances(balRes.balances);
        if (earnRes.positions) setEarnPos(earnRes.positions);
        if (ovRes.overview) setOverview(ovRes.overview);
        if (mktRes.markets) setLiveMarkets(mktRes.markets);
      } catch (err) {
        console.error('Portfolio load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // Resolve live price for an asset. USDT = 1 always.
  // Falls back to null (not a stale hardcoded value) if unavailable.
  const getLivePrice = (asset) => {
    if (asset === 'USDT') return 1;
    const key = `${asset}USDT`;
    const m = liveMarkets[key];
    return m?.price ? parseFloat(m.price) : null;
  };

  const calcAssetUsd = (asset, qty) => {
    const price = getLivePrice(asset);
    return price !== null ? qty * price : null;
  };

  const spotUSDT = balances.reduce((s, b) => {
    const qty = parseFloat(b.free) + parseFloat(b.locked);
    const usd = calcAssetUsd(b.asset, qty);
    return usd !== null ? s + usd : s;
  }, 0);

  const earnUSDT = earnPos
    .filter(p => p.status === 'active')
    .reduce((s, p) => {
      const usd = calcAssetUsd(p.asset, parseFloat(p.amount));
      return usd !== null ? s + usd : s;
    }, 0);

  const totalUSDT = spotUSDT + earnUSDT;

  const pricesAvailable = Object.keys(liveMarkets).length > 0;

  const allocations = balances
    .map(b => {
      const qty = parseFloat(b.free) + parseFloat(b.locked);
      const usd = calcAssetUsd(b.asset, qty);
      return { asset: b.asset, qty, usd: usd ?? 0, priceKnown: usd !== null, pct: 0 };
    })
    .filter(a => a.qty > 0)
    .map(a => ({
      ...a,
      pct: totalUSDT > 0 && a.usd ? (a.usd / totalUSDT) * 100 : 0,
    }))
    .sort((a, b) => b.usd - a.usd);

  const COLORS = ['var(--brass)', 'var(--green)', 'var(--red)', '#2B8AFC', '#9B59B6', '#E67E22', '#1ABC9C', '#E91E63'];

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
              {pricesAvailable
                ? <>
                    ${totalUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="pf-banner-denom"> USDT</span>
                  </>
                : <span style={{ fontSize: '20px', color: 'var(--text-muted)' }}>Loading prices…</span>
              }
            </div>
          </div>
          <div className="pf-banner-right">
            <div className="pf-wallet-split">
              <div className="pf-split-item">
                <span className="pf-split-label">Spot Wallet</span>
                <span className="pf-split-val">
                  {pricesAvailable ? `$${spotUSDT.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                </span>
              </div>
              <div className="pf-split-divider" />
              <div className="pf-split-item">
                <span className="pf-split-label">Earn Wallet</span>
                <span className="pf-split-val">
                  {pricesAvailable ? `$${earnUSDT.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                </span>
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
                  const qty = parseFloat(b.free) + parseFloat(b.locked);
                  const usd = calcAssetUsd(b.asset, qty);
                  return (
                    <tr key={b.asset}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <CryptoIcon symbol={b.asset} size={20} />
                          <b>{b.asset}</b>
                        </div>
                      </td>
                      <td className="mono">{parseFloat(b.free).toFixed(6)}</td>
                      <td className="mono">{parseFloat(b.locked).toFixed(6)}</td>
                      <td className="mono">
                        {usd !== null
                          ? `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : <span style={{ color: 'var(--text-faint)' }}>—</span>
                        }
                      </td>
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
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <CryptoIcon symbol={p.asset} size={20} />
                          <b>{p.asset}</b>
                        </div>
                      </td>
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
