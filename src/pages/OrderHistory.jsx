import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './OrderHistory.css';

const STATUS_CLASS = { NEW: 'new', PARTIALLY_FILLED: 'partial', FILLED: 'filled', CANCELED: 'canceled' };

export default function OrderHistory() {
  const { token } = useAuth();
  const [orders, setOrders]     = useState([]);
  const [trades, setTrades]     = useState([]);
  const [tab, setTab]           = useState('orders');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sideFilter, setSideFilter]     = useState('ALL');
  const [search, setSearch]             = useState('');
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ordRes, trdRes] = await Promise.all([
          api.getAllOrders(token),
          api.getTradeHistory(token),
        ]);
        if (ordRes.orders) setOrders(ordRes.orders);
        if (trdRes.trades) setTrades(trdRes.trades);
      } catch (err) {
        console.error('Order history load error:', err);
      } finally { setLoading(false); }
    }
    load();
  }, [token]);

  const filteredOrders = orders.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    if (sideFilter !== 'ALL' && o.side !== sideFilter) return false;
    if (search && !o.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredTrades = trades.filter(t => {
    if (sideFilter !== 'ALL' && t.side !== sideFilter) return false;
    if (search && !t.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalVolume = filteredTrades.reduce((s, t) => s + parseFloat(t.price) * parseFloat(t.amount), 0);
  const totalFees   = filteredTrades.reduce((s, t) => s + parseFloat(t.fee), 0);

  return (
    <div className="oh-page">
      <div className="oh-container">
        <div className="oh-header">
          <h1>Order History</h1>
          <p>Complete record of your spot orders and executed trades</p>
        </div>

        {/* Summary cards */}
        <div className="oh-summary">
          <div className="oh-stat">
            <span className="oh-stat-label">Total Orders</span>
            <span className="oh-stat-val">{orders.length}</span>
          </div>
          <div className="oh-stat">
            <span className="oh-stat-label">Filled Orders</span>
            <span className="oh-stat-val pos">{orders.filter(o => o.status === 'FILLED').length}</span>
          </div>
          <div className="oh-stat">
            <span className="oh-stat-label">Trade Volume</span>
            <span className="oh-stat-val">${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="oh-stat">
            <span className="oh-stat-label">Total Fees Paid</span>
            <span className="oh-stat-val neg">${totalFees.toFixed(4)}</span>
          </div>
        </div>

        {/* Tabs + Filters */}
        <div className="oh-toolbar">
          <div className="oh-tabs">
            <button className={`oh-tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
              All Orders <span className="oh-count">{orders.length}</span>
            </button>
            <button className={`oh-tab ${tab === 'trades' ? 'active' : ''}`} onClick={() => setTab('trades')}>
              Trade History <span className="oh-count">{trades.length}</span>
            </button>
          </div>

          <div className="oh-filters">
            <input
              className="oh-search"
              placeholder="Search symbol..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="oh-select" value={sideFilter} onChange={e => setSideFilter(e.target.value)}>
              <option value="ALL">All Sides</option>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
            {tab === 'orders' && (
              <select className="oh-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value="NEW">New</option>
                <option value="FILLED">Filled</option>
                <option value="PARTIALLY_FILLED">Partial</option>
                <option value="CANCELED">Canceled</option>
              </select>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="oh-card">
          {loading ? (
            <div className="oh-loading">Loading...</div>
          ) : tab === 'orders' ? (
            <div className="oh-table-wrap">
              <table className="oh-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Amount</th>
                    <th>Filled</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan="8" className="oh-empty">No orders found</td></tr>
                  ) : filteredOrders.map(o => (
                    <tr key={o.id}>
                      <td>{new Date(o.created_at).toLocaleString()}</td>
                      <td><b>{o.symbol}</b></td>
                      <td><span className={`side-badge ${o.side.toLowerCase()}`}>{o.side}</span></td>
                      <td>{o.type}</td>
                      <td className="mono">${parseFloat(o.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="mono">{parseFloat(o.amount).toFixed(6)}</td>
                      <td className="mono">{parseFloat(o.filled_amount).toFixed(6)}</td>
                      <td><span className={`status-pill ${STATUS_CLASS[o.status] || ''}`}>{o.status.replace('_',' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="oh-table-wrap">
              <table className="oh-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Amount</th>
                    <th>Total</th>
                    <th>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.length === 0 ? (
                    <tr><td colSpan="7" className="oh-empty">No trades found</td></tr>
                  ) : filteredTrades.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.created_at).toLocaleString()}</td>
                      <td><b>{t.symbol}</b></td>
                      <td><span className={`side-badge ${t.side.toLowerCase()}`}>{t.side}</span></td>
                      <td className="mono">${parseFloat(t.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="mono">{parseFloat(t.amount).toFixed(6)}</td>
                      <td className="mono">${(parseFloat(t.price) * parseFloat(t.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="mono neg">{parseFloat(t.fee).toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
