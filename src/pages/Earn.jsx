import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import CryptoIcon from '../components/CryptoIcon';
import Icon from '../components/Icon';
import './Earn.css';

export default function Earn() {
  const { token } = useAuth();
  const [products, setProducts]   = useState([]);
  const [positions, setPositions] = useState([]);
  const [balances, setBalances]   = useState([]);
  const [tab, setTab]             = useState('products');
  const [modal, setModal]         = useState(null); // { product }
  const [amount, setAmount]       = useState('');
  const [toast, setToast]         = useState(null);

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  const load = async () => {
    const [pRes, posRes, balRes] = await Promise.all([
      api.getEarnProducts(token),
      api.getEarnPositions(token),
      api.getWalletBalances(token),
    ]);
    if (pRes.products)   setProducts(pRes.products);
    if (posRes.positions) setPositions(posRes.positions);
    if (balRes.balances) setBalances(balRes.balances);
  };

  useEffect(() => { load(); }, [token]);

  const getBalance = (asset) => {
    const b = balances.find(b => b.asset === asset);
    return b ? parseFloat(b.free) : 0;
  };

  const handleSubscribe = async () => {
    if (!modal) return;
    const res = await api.subscribeEarn(token, { productId: modal.product.id, amount });
    if (res.error) showToast('error', res.error);
    else { showToast('success', res.message); setModal(null); setAmount(''); load(); }
  };

  const handleRedeem = async (posId) => {
    const res = await api.redeemEarn(token, posId);
    if (res.error) showToast('error', res.error);
    else { showToast('success', `Redeemed: +${res.interest} ${res.total} returned`); load(); }
  };

  const totalEarned = positions.reduce((s, p) => s + parseFloat(p.accrued_interest || 0), 0);
  const totalStaked = positions.filter(p => p.status === 'active').reduce((s, p) => s + parseFloat(p.amount), 0);

  return (
    <div className="earn-page">
      {toast && <div className={`earn-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="earn-container">
        <div className="earn-header">
          <h1>Simple Earn</h1>
          <p>Grow your crypto holdings with flexible and locked staking products</p>
        </div>

        {/* Stats */}
        <div className="earn-stats">
          <div className="earn-stat">
            <span className="es-label">Active Positions</span>
            <span className="es-val">{positions.filter(p => p.status === 'active').length}</span>
          </div>
          <div className="earn-stat">
            <span className="es-label">Total Staked</span>
            <span className="es-val">{totalStaked.toFixed(4)}</span>
          </div>
          <div className="earn-stat">
            <span className="es-label">Total Interest Earned</span>
            <span className="es-val pos">{totalEarned.toFixed(8)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="earn-tabs">
          <button className={`earn-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
            Available Products
          </button>
          <button className={`earn-tab ${tab === 'positions' ? 'active' : ''}`} onClick={() => setTab('positions')}>
            My Positions <span className="earn-badge">{positions.filter(p => p.status === 'active').length}</span>
          </button>
        </div>

        {tab === 'products' && (
          <div className="products-grid">
            {products.map(p => (
              <div key={p.id} className={`product-card ${p.type}`}>
                <div className="pc-top">
                  <div className="pc-asset-row">
                    <CryptoIcon symbol={p.asset} size={32} />
                    <span className="pc-asset">{p.asset}</span>
                  </div>
                  <span className={`pc-type-badge ${p.type}`}>{p.type === 'flexible' ? 'Flexible' : `${p.duration}D Lock`}</span>
                </div>
                <div className="pc-apy">
                  <span className="pc-apy-val">{p.apy}%</span>
                  <span className="pc-apy-label">APY</span>
                </div>
                <div className="pc-details">
                  <div className="pc-detail-row">
                    <span>Min. Amount</span>
                    <span className="mono">{p.minAmount} {p.asset}</span>
                  </div>
                  <div className="pc-detail-row">
                    <span>Available Balance</span>
                    <span className="mono">{getBalance(p.asset).toFixed(6)} {p.asset}</span>
                  </div>
                </div>
                <button
                  className="pc-subscribe-btn"
                  onClick={() => { setModal({ product: p }); setAmount(''); }}
                >
                  Subscribe
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'positions' && (
          <div className="earn-card">
            {positions.length === 0 ? (
              <div className="earn-empty">No earn positions yet. Subscribe to a product to start earning.</div>
            ) : (
              <div className="pos-table-wrap">
                <table className="pos-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Type</th>
                      <th>APY</th>
                      <th>Amount</th>
                      <th>Interest Earned</th>
                      <th>Start Date</th>
                      <th>Maturity</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(p => (
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
                        <td>{new Date(p.subscribed_at).toLocaleDateString()}</td>
                        <td>{p.maturity_date ? new Date(p.maturity_date).toLocaleDateString() : '—'}</td>
                        <td><span className={`pos-status ${p.status}`}>{p.status}</span></td>
                        <td>
                          {p.status === 'active' && (
                            <button className="redeem-btn" onClick={() => handleRedeem(p.id)}>Redeem</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subscribe Modal */}
      {modal && (
        <div className="earn-modal-backdrop">
          <div className="earn-modal">
            <div className="earn-modal-head">
              <h3>Subscribe to {modal.product.asset} {modal.product.type === 'flexible' ? 'Flexible' : `${modal.product.duration}-Day Locked`} Earn</h3>
              <button className="earn-modal-close" onClick={() => setModal(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="earn-modal-body">
              <div className="em-apy-badge">{modal.product.apy}% APY</div>
              <div className="em-field">
                <label>Amount ({modal.product.asset})</label>
                <div className="em-input-row">
                  <input
                    type="number"
                    placeholder={`Min: ${modal.product.minAmount}`}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                  <button className="em-max-btn" onClick={() => setAmount(getBalance(modal.product.asset).toString())}>MAX</button>
                </div>
                <span className="em-hint">Available: {getBalance(modal.product.asset).toFixed(6)} {modal.product.asset}</span>
              </div>
              {modal.product.type === 'locked' && (
                <div className="em-warning">
                  <Icon name="warning" size={14} color="var(--binance-yellow)" style={{ flexShrink:0 }} />
                  Locked for {modal.product.duration} days. Early redemption not available.
                </div>
              )}
              <button className="em-confirm-btn" onClick={handleSubscribe}>Confirm Subscription</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
