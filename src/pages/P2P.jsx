import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import CryptoIcon from '../components/CryptoIcon';
import './P2P.css';

const ASSETS   = ['USDT','BTC','ETH','SOL','BNB','XRP','DOGE','ADA','LTC','AVAX','LINK','MATIC','DOT','TRX','UNI','ATOM'];
const FIATS    = ['USD','EUR','GBP','CAD','AUD','NGN','KES','GHS','ZAR','INR','BRL','MXN','AED','SGD'];
const PAYMENTS = ['Bank Transfer','PayPal','Wise','Revolut','Cash App','Venmo','Zelle','M-Pesa','MTN Mobile Money','Airtel Money','Other'];

const STATUS_COLORS = {
  pending:   '#F59E0B',
  paid:      '#3B82F6',
  released:  '#10B981',
  completed: '#10B981',
  cancelled: '#6B7280',
  disputed:  '#EF4444',
};

export default function P2P() {
  const { token, user } = useAuth();

  const [tab, setTab]           = useState('buy');   // buy | sell | myads | orders
  const [ads, setAds]           = useState([]);
  const [myAds, setMyAds]       = useState([]);
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null);

  // Filters
  const [filterAsset, setFilterAsset] = useState('USDT');
  const [filterFiat,  setFilterFiat]  = useState('USD');

  // Create Ad modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    type: 'SELL', asset: 'USDT', fiat: 'USD',
    price: '', price_type: 'fixed', float_margin: '1',
    total_amount: '', min_order: '', max_order: '',
    payment_methods: [], payment_window: '15', terms: '',
  });
  const [creating, setCreating] = useState(false);

  // Place Order modal
  const [orderAd,     setOrderAd]     = useState(null);
  const [orderQty,    setOrderQty]    = useState('');
  const [orderPay,    setOrderPay]    = useState('');
  const [placing,     setPlacing]     = useState(false);

  // Order detail modal
  const [detailOrder, setDetailOrder] = useState(null);
  const [actionLoading, setActionLoad] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeInput, setShowDispute] = useState(false);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getP2PAds(token, {
        type: tab === 'buy' ? 'SELL' : 'BUY',  // buyer sees SELL ads
        asset: filterAsset, fiat: filterFiat,
      });
      if (res.ads) setAds(res.ads);
    } catch { showToast('error', 'Failed to load ads'); }
    finally { setLoading(false); }
  }, [token, tab, filterAsset, filterFiat]);

  const loadMyAds = useCallback(async () => {
    const res = await api.getP2PAds(token, { mine: '1' });
    if (res.ads) setMyAds(res.ads);
  }, [token]);

  const loadOrders = useCallback(async () => {
    const res = await api.getP2POrders(token);
    if (res.orders) setOrders(res.orders);
  }, [token]);

  useEffect(() => {
    if (tab === 'buy' || tab === 'sell') loadAds();
    if (tab === 'myads')  loadMyAds();
    if (tab === 'orders') loadOrders();
  }, [tab, filterAsset, filterFiat]);

  // ── Create Ad ────────────────────────────────────────────────────────────
  const handleCreateAd = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = {
        ...createForm,
        price:        parseFloat(createForm.price),
        float_margin: parseFloat(createForm.float_margin),
        total_amount: parseFloat(createForm.total_amount),
        min_order:    parseFloat(createForm.min_order),
        max_order:    parseFloat(createForm.max_order),
        payment_window: parseInt(createForm.payment_window),
      };
      const res = await api.createP2PAd(token, payload);
      if (res.error) { showToast('error', res.error); return; }
      showToast('success', 'Ad posted successfully');
      setShowCreate(false);
      setCreateForm({ type: 'SELL', asset: 'USDT', fiat: 'USD', price: '', price_type: 'fixed',
        float_margin: '1', total_amount: '', min_order: '', max_order: '',
        payment_methods: [], payment_window: '15', terms: '' });
      loadMyAds();
    } catch { showToast('error', 'Failed to create ad'); }
    finally { setCreating(false); }
  };

  const togglePayment = (method) => {
    setCreateForm(f => ({
      ...f,
      payment_methods: f.payment_methods.includes(method)
        ? f.payment_methods.filter(m => m !== method)
        : [...f.payment_methods, method],
    }));
  };

  // ── Place Order ──────────────────────────────────────────────────────────
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setPlacing(true);
    try {
      const res = await api.placeP2POrder(token, {
        ad_id: orderAd.id,
        crypto_amount: parseFloat(orderQty),
        payment_method: orderPay,
      });
      if (res.error) { showToast('error', res.error); return; }
      showToast('success', `Order placed! Pay ${res.fiatAmount} ${orderAd.fiat} within ${orderAd.payment_window} min`);
      setOrderAd(null); setOrderQty(''); setOrderPay('');
      loadOrders(); loadAds();
      setTab('orders');
    } catch { showToast('error', 'Failed to place order'); }
    finally { setPlacing(false); }
  };

  // ── Order actions ────────────────────────────────────────────────────────
  const doAction = async (fn, successMsg) => {
    setActionLoad(true);
    try {
      const res = await fn();
      if (res.error) { showToast('error', res.error); return; }
      showToast('success', successMsg || res.message);
      const updated = await api.getP2POrder(token, detailOrder.id);
      if (updated.order) setDetailOrder(updated.order);
      loadOrders();
    } catch { showToast('error', 'Action failed'); }
    finally { setActionLoad(false); }
  };

  const cancelAd = async (adId) => {
    if (!window.confirm('Cancel this ad? Escrowed funds will be returned.')) return;
    const res = await api.cancelP2PAd(token, adId);
    if (res.error) { showToast('error', res.error); return; }
    showToast('success', 'Ad cancelled');
    loadMyAds();
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const fiatAmt = (ad) => {
    if (!orderQty) return '0.00';
    return (parseFloat(orderQty) * parseFloat(ad.effective_price || ad.price)).toFixed(2);
  };

  const isMyOrder = (o) => o.buyer_id === user?.id || o.seller_id === user?.id;
  const isBuyer   = (o) => o.buyer_id  === user?.id;
  const isSeller  = (o) => o.seller_id === user?.id;

  return (
    <div className="p2p-page">
      {toast && <div className={`p2p-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="p2p-header">
        <div>
          <h1 className="p2p-title">P2P Trading</h1>
          <p className="p2p-subtitle">Trade crypto directly with other users using your preferred payment method</p>
        </div>
        <button className="p2p-post-btn" onClick={() => setShowCreate(true)}>+ Post Ad</button>
      </div>

      {/* Tabs */}
      <div className="p2p-tabs">
        {[
          { key: 'buy',    label: 'Buy Crypto' },
          { key: 'sell',   label: 'Sell Crypto' },
          { key: 'myads',  label: 'My Ads' },
          { key: 'orders', label: 'My Orders' },
        ].map(t => (
          <button key={t.key} className={`p2p-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters (buy/sell tabs) */}
      {(tab === 'buy' || tab === 'sell') && (
        <div className="p2p-filters">
          <div className="p2p-filter-group">
            <label>Asset</label>
            <div className="p2p-asset-pills">
              {ASSETS.slice(0, 8).map(a => (
                <button key={a} className={`asset-pill ${filterAsset === a ? 'active' : ''}`}
                  onClick={() => setFilterAsset(a)}>
                  <CryptoIcon symbol={a} size={14} /> {a}
                </button>
              ))}
            </div>
          </div>
          <div className="p2p-filter-group">
            <label>Fiat</label>
            <select value={filterFiat} onChange={e => setFilterFiat(e.target.value)} className="p2p-select">
              {FIATS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── BUY / SELL ADS TABLE ── */}
      {(tab === 'buy' || tab === 'sell') && (
        <div className="p2p-table-wrap">
          {loading ? (
            <div className="p2p-empty">Loading ads…</div>
          ) : ads.length === 0 ? (
            <div className="p2p-empty">No {tab === 'buy' ? 'sell' : 'buy'} ads for {filterAsset}/{filterFiat} right now.</div>
          ) : (
            <table className="p2p-table">
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th>Price</th>
                  <th>Available</th>
                  <th>Limit ({filterFiat})</th>
                  <th>Payment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ads.map(ad => (
                  <tr key={ad.id}>
                    <td>
                      <div className="p2p-advertiser">
                        <div className="p2p-avatar">{ad.first_name?.[0]}{ad.last_name?.[0]}</div>
                        <div>
                          <div className="p2p-adv-name">{ad.first_name} {ad.last_name}</div>
                          <div className="p2p-adv-trades">{ad.completed_trades || 0} trades</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="p2p-price">{parseFloat(ad.effective_price || ad.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      <div className="p2p-fiat">{ad.fiat}</div>
                    </td>
                    <td className="mono">{parseFloat(ad.available).toFixed(4)} {ad.asset}</td>
                    <td className="p2p-limit">{parseFloat(ad.min_order).toLocaleString()} – {parseFloat(ad.max_order).toLocaleString()} {ad.fiat}</td>
                    <td>
                      <div className="p2p-methods">
                        {(typeof ad.payment_methods === 'string' ? JSON.parse(ad.payment_methods) : ad.payment_methods)
                          .slice(0, 2).map(m => <span key={m} className="p2p-method-tag">{m}</span>)}
                      </div>
                    </td>
                    <td>
                      <button
                        className={`p2p-action-btn ${tab === 'buy' ? 'buy' : 'sell'}`}
                        onClick={() => { setOrderAd(ad); setOrderQty(''); setOrderPay(''); }}
                      >
                        {tab === 'buy' ? 'Buy' : 'Sell'} {ad.asset}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── MY ADS ── */}
      {tab === 'myads' && (
        <div className="p2p-table-wrap">
          {myAds.length === 0 ? (
            <div className="p2p-empty">You haven't posted any ads yet. <button className="p2p-link-btn" onClick={() => setShowCreate(true)}>Post one now</button></div>
          ) : (
            <table className="p2p-table">
              <thead>
                <tr><th>Type</th><th>Asset</th><th>Price</th><th>Available</th><th>Limits</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {myAds.map(ad => (
                  <tr key={ad.id}>
                    <td><span className={`p2p-type-badge ${ad.type.toLowerCase()}`}>{ad.type}</span></td>
                    <td><CryptoIcon symbol={ad.asset} size={18} /> {ad.asset}/{ad.fiat}</td>
                    <td className="mono">{parseFloat(ad.price).toLocaleString(undefined, {minimumFractionDigits:2})} {ad.fiat}</td>
                    <td className="mono">{parseFloat(ad.available).toFixed(4)}</td>
                    <td className="p2p-limit">{parseFloat(ad.min_order).toLocaleString()} – {parseFloat(ad.max_order).toLocaleString()} {ad.fiat}</td>
                    <td><span className="p2p-status" style={{ color: ad.status === 'active' ? '#10B981' : '#6B7280' }}>{ad.status}</span></td>
                    <td>
                      {ad.status === 'active' && (
                        <button className="p2p-cancel-btn" onClick={() => cancelAd(ad.id)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── MY ORDERS ── */}
      {tab === 'orders' && (
        <div className="p2p-table-wrap">
          {orders.length === 0 ? (
            <div className="p2p-empty">No orders yet.</div>
          ) : (
            <table className="p2p-table">
              <thead>
                <tr><th>Time</th><th>Asset</th><th>Role</th><th>Amount</th><th>Fiat</th><th>Payment</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td className="mono" style={{fontSize:'11px'}}>{new Date(o.created_at).toLocaleString()}</td>
                    <td><CryptoIcon symbol={o.asset} size={16}/> {o.asset}</td>
                    <td><span className={`p2p-role ${isBuyer(o) ? 'buyer' : 'seller'}`}>{isBuyer(o) ? 'Buyer' : 'Seller'}</span></td>
                    <td className="mono">{parseFloat(o.crypto_amount).toFixed(6)}</td>
                    <td className="mono">{parseFloat(o.fiat_amount).toLocaleString(undefined,{minimumFractionDigits:2})} {o.fiat}</td>
                    <td>{o.payment_method}</td>
                    <td><span className="p2p-status" style={{color: STATUS_COLORS[o.status] || '#fff'}}>{o.status}</span></td>
                    <td>
                      <button className="p2p-detail-btn" onClick={() => { setDetailOrder(o); setShowDispute(false); setDisputeReason(''); }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          CREATE AD MODAL
      ══════════════════════════════════════ */}
      {showCreate && (
        <div className="p2p-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="p2p-modal">
            <div className="p2p-modal-header">
              <h3>Post a P2P Ad</h3>
              <button className="p2p-close-btn" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateAd} className="p2p-form">
              <div className="p2p-form-row">
                <div className="p2p-field">
                  <label>Ad Type</label>
                  <div className="p2p-type-toggle">
                    {['SELL','BUY'].map(t => (
                      <button key={t} type="button"
                        className={`type-toggle-btn ${createForm.type === t ? t.toLowerCase() : ''}`}
                        onClick={() => setCreateForm(f => ({ ...f, type: t }))}>
                        {t === 'SELL' ? 'I want to Sell' : 'I want to Buy'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p2p-form-row two-col">
                <div className="p2p-field">
                  <label>Asset</label>
                  <select value={createForm.asset} onChange={e => setCreateForm(f => ({...f, asset: e.target.value}))}>
                    {ASSETS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="p2p-field">
                  <label>Fiat Currency</label>
                  <select value={createForm.fiat} onChange={e => setCreateForm(f => ({...f, fiat: e.target.value}))}>
                    {FIATS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div className="p2p-form-row two-col">
                <div className="p2p-field">
                  <label>Price Type</label>
                  <select value={createForm.price_type} onChange={e => setCreateForm(f => ({...f, price_type: e.target.value}))}>
                    <option value="fixed">Fixed Price</option>
                    <option value="floating">Floating (% above/below market)</option>
                  </select>
                </div>
                <div className="p2p-field">
                  {createForm.price_type === 'fixed' ? (
                    <>
                      <label>Price per {createForm.asset} ({createForm.fiat})</label>
                      <input type="number" step="0.01" required placeholder="0.00"
                        value={createForm.price} onChange={e => setCreateForm(f => ({...f, price: e.target.value}))} />
                    </>
                  ) : (
                    <>
                      <label>Market Margin (%)</label>
                      <input type="number" step="0.1" required placeholder="1.5"
                        value={createForm.float_margin} onChange={e => setCreateForm(f => ({...f, float_margin: e.target.value}))} />
                    </>
                  )}
                </div>
              </div>

              <div className="p2p-form-row three-col">
                <div className="p2p-field">
                  <label>Total Amount ({createForm.asset})</label>
                  <input type="number" step="0.0001" required placeholder="0.00"
                    value={createForm.total_amount} onChange={e => setCreateForm(f => ({...f, total_amount: e.target.value}))} />
                </div>
                <div className="p2p-field">
                  <label>Min Order ({createForm.fiat})</label>
                  <input type="number" step="0.01" required placeholder="10"
                    value={createForm.min_order} onChange={e => setCreateForm(f => ({...f, min_order: e.target.value}))} />
                </div>
                <div className="p2p-field">
                  <label>Max Order ({createForm.fiat})</label>
                  <input type="number" step="0.01" required placeholder="1000"
                    value={createForm.max_order} onChange={e => setCreateForm(f => ({...f, max_order: e.target.value}))} />
                </div>
              </div>

              <div className="p2p-field">
                <label>Payment Methods (select all that apply)</label>
                <div className="p2p-payment-grid">
                  {PAYMENTS.map(m => (
                    <label key={m} className={`p2p-payment-check ${createForm.payment_methods.includes(m) ? 'checked' : ''}`}>
                      <input type="checkbox" checked={createForm.payment_methods.includes(m)} onChange={() => togglePayment(m)} />
                      {m}
                    </label>
                  ))}
                </div>
              </div>

              <div className="p2p-form-row two-col">
                <div className="p2p-field">
                  <label>Payment Window (minutes)</label>
                  <select value={createForm.payment_window} onChange={e => setCreateForm(f => ({...f, payment_window: e.target.value}))}>
                    {[15,30,45,60,90,120].map(v => <option key={v} value={v}>{v} min</option>)}
                  </select>
                </div>
                <div className="p2p-field">
                  <label>Terms / Remarks (optional)</label>
                  <input type="text" placeholder="e.g. Only verified accounts"
                    value={createForm.terms} onChange={e => setCreateForm(f => ({...f, terms: e.target.value}))} />
                </div>
              </div>

              <button type="submit" className="p2p-submit-btn" disabled={creating}>
                {creating ? 'Posting…' : `Post ${createForm.type} Ad`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          PLACE ORDER MODAL
      ══════════════════════════════════════ */}
      {orderAd && (
        <div className="p2p-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOrderAd(null)}>
          <div className="p2p-modal p2p-order-modal">
            <div className="p2p-modal-header">
              <h3>{tab === 'buy' ? 'Buy' : 'Sell'} {orderAd.asset}</h3>
              <button className="p2p-close-btn" onClick={() => setOrderAd(null)}>✕</button>
            </div>

            <div className="order-ad-info">
              <div className="oai-row"><span>Price</span><b>{parseFloat(orderAd.effective_price || orderAd.price).toLocaleString(undefined,{minimumFractionDigits:2})} {orderAd.fiat}</b></div>
              <div className="oai-row"><span>Available</span><b>{parseFloat(orderAd.available).toFixed(4)} {orderAd.asset}</b></div>
              <div className="oai-row"><span>Limits</span><b>{parseFloat(orderAd.min_order).toLocaleString()} – {parseFloat(orderAd.max_order).toLocaleString()} {orderAd.fiat}</b></div>
              <div className="oai-row"><span>Payment Window</span><b>{orderAd.payment_window} minutes</b></div>
              {orderAd.terms && <div className="oai-terms">📋 {orderAd.terms}</div>}
            </div>

            <form onSubmit={handlePlaceOrder} className="p2p-form">
              <div className="p2p-field">
                <label>Amount ({orderAd.asset})</label>
                <input type="number" step="0.0001" required placeholder="0.00"
                  min="0" max={orderAd.available}
                  value={orderQty} onChange={e => setOrderQty(e.target.value)} />
                {orderQty && (
                  <div className="p2p-fiat-preview">
                    ≈ {fiatAmt(orderAd)} {orderAd.fiat}
                  </div>
                )}
              </div>

              <div className="p2p-field">
                <label>Payment Method</label>
                <select required value={orderPay} onChange={e => setOrderPay(e.target.value)}>
                  <option value="">Select method…</option>
                  {(typeof orderAd.payment_methods === 'string'
                    ? JSON.parse(orderAd.payment_methods)
                    : orderAd.payment_methods
                  ).map(m => <option key={m}>{m}</option>)}
                </select>
              </div>

              <button type="submit" className="p2p-submit-btn" disabled={placing}>
                {placing ? 'Placing…' : `Confirm ${tab === 'buy' ? 'Buy' : 'Sell'}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          ORDER DETAIL MODAL
      ══════════════════════════════════════ */}
      {detailOrder && (
        <div className="p2p-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDetailOrder(null)}>
          <div className="p2p-modal p2p-detail-modal">
            <div className="p2p-modal-header">
              <h3>Order #{detailOrder.id}</h3>
              <button className="p2p-close-btn" onClick={() => setDetailOrder(null)}>✕</button>
            </div>

            <div className="p2p-detail-status">
              <span className="detail-status-badge" style={{ background: STATUS_COLORS[detailOrder.status] + '22', color: STATUS_COLORS[detailOrder.status] }}>
                {detailOrder.status.toUpperCase()}
              </span>
            </div>

            <div className="p2p-detail-grid">
              <div className="detail-item"><span>Asset</span><b>{detailOrder.asset}</b></div>
              <div className="detail-item"><span>Role</span><b>{isBuyer(detailOrder) ? 'Buyer' : 'Seller'}</b></div>
              <div className="detail-item"><span>Crypto Amount</span><b className="mono">{parseFloat(detailOrder.crypto_amount).toFixed(6)} {detailOrder.asset}</b></div>
              <div className="detail-item"><span>Fiat Amount</span><b className="mono">{parseFloat(detailOrder.fiat_amount).toLocaleString(undefined,{minimumFractionDigits:2})} {detailOrder.fiat}</b></div>
              <div className="detail-item"><span>Price</span><b className="mono">{parseFloat(detailOrder.price).toLocaleString(undefined,{minimumFractionDigits:2})} {detailOrder.fiat}</b></div>
              <div className="detail-item"><span>Payment Method</span><b>{detailOrder.payment_method}</b></div>
              <div className="detail-item"><span>Counterparty</span>
                <b>{isBuyer(detailOrder)
                  ? `${detailOrder.seller_first} ${detailOrder.seller_last}`
                  : `${detailOrder.buyer_first} ${detailOrder.buyer_last}`}</b>
              </div>
              <div className="detail-item"><span>Expires</span><b>{new Date(detailOrder.expires_at).toLocaleString()}</b></div>
            </div>

            {/* Instructions */}
            {detailOrder.status === 'pending' && isBuyer(detailOrder) && (
              <div className="p2p-instruction buy">
                <b>📌 Payment Instructions</b>
                <p>Send <b>{parseFloat(detailOrder.fiat_amount).toLocaleString(undefined,{minimumFractionDigits:2})} {detailOrder.fiat}</b> to the seller via <b>{detailOrder.payment_method}</b>. Once sent, click "I've Paid" below.</p>
              </div>
            )}
            {detailOrder.status === 'paid' && isSeller(detailOrder) && (
              <div className="p2p-instruction sell">
                <b>📌 Buyer has marked payment as sent</b>
                <p>Verify that you received <b>{parseFloat(detailOrder.fiat_amount).toLocaleString(undefined,{minimumFractionDigits:2})} {detailOrder.fiat}</b> via <b>{detailOrder.payment_method}</b>. Only release crypto after confirming receipt.</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="p2p-detail-actions">
              {detailOrder.status === 'pending' && isBuyer(detailOrder) && (
                <button className="p2p-submit-btn" disabled={actionLoading}
                  onClick={() => doAction(() => api.p2pMarkPaid(token, detailOrder.id), "Payment confirmed! Waiting for seller.")}>
                  {actionLoading ? '…' : "I've Paid"}
                </button>
              )}
              {detailOrder.status === 'paid' && isSeller(detailOrder) && (
                <button className="p2p-submit-btn" disabled={actionLoading}
                  onClick={() => doAction(() => api.p2pRelease(token, detailOrder.id), "Crypto released to buyer!")}>
                  {actionLoading ? '…' : 'Release Crypto'}
                </button>
              )}
              {detailOrder.status === 'pending' && (
                <button className="p2p-cancel-btn" disabled={actionLoading}
                  onClick={() => doAction(() => api.p2pCancelOrder(token, detailOrder.id), "Order cancelled")}>
                  {actionLoading ? '…' : 'Cancel Order'}
                </button>
              )}
              {['pending','paid'].includes(detailOrder.status) && (
                <>
                  {!showDisputeInput ? (
                    <button className="p2p-dispute-btn" onClick={() => setShowDispute(true)}>Raise Dispute</button>
                  ) : (
                    <div className="p2p-dispute-form">
                      <input placeholder="Describe the issue…" value={disputeReason}
                        onChange={e => setDisputeReason(e.target.value)} />
                      <button className="p2p-dispute-btn" disabled={actionLoading}
                        onClick={() => doAction(() => api.p2pDisputeOrder(token, detailOrder.id, disputeReason), "Dispute raised. Admin will review.")}>
                        {actionLoading ? '…' : 'Submit Dispute'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
