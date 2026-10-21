import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import CryptoIcon from '../components/CryptoIcon';
import './Markets.css';

export default function Markets() {
  const [markets, setMarkets] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    async function fetchMarkets() {
      try {
        const res = await api.getMarketOverview();
        if (res.markets) {
          setMarkets(res.markets);
        }
      } catch (err) {
        console.error('Fetch markets error:', err);
      }
    }
    fetchMarkets();
    const timer = setInterval(fetchMarkets, 3000);
    return () => clearInterval(timer);
  }, []);

  const marketList = Object.values(markets).filter(m => {
    const matchesSearch = m.symbol.toLowerCase().includes(search.toLowerCase());
    if (filter === 'GAINERS') return matchesSearch && m.change24h > 0;
    if (filter === 'LOSERS') return matchesSearch && m.change24h < 0;
    return matchesSearch;
  });

  return (
    <div className="markets-page">
      <div className="markets-container">
        <div className="markets-header">
          <h1>Markets Overview</h1>
          <p>Real-time prices and trading volumes across crypto pairs</p>
        </div>

        <div className="markets-controls">
          <div className="filter-tabs">
            {['ALL', 'GAINERS', 'LOSERS'].map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="search-box">
            <input
              type="text"
              placeholder="Search Coin Name or Symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="markets-table-wrapper">
          <table className="markets-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Last Price</th>
                <th>24h Change</th>
                <th>24h High</th>
                <th>24h Low</th>
                <th>24h Volume</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {marketList.map(m => {
                const isPos = m.change24h >= 0;
                return (
                  <tr key={m.symbol}>
                    <td>
                      <div className="pair-info">
                        <CryptoIcon symbol={m.symbol} size={22} />
                        <span className="pair-base">{m.symbol.replace('USDT', '')}</span>
                        <span className="pair-quote">/ USDT</span>
                      </div>
                    </td>
                    <td className="mono-val">${parseFloat(m.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className={`change-val ${isPos ? 'pos' : 'neg'}`}>
                      {isPos ? '+' : ''}{parseFloat(m.change24h).toFixed(2)}%
                    </td>
                    <td className="mono-val">${parseFloat(m.high24h).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="mono-val">${parseFloat(m.low24h).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="mono-val">${(m.volume24h / 1e6).toFixed(2)}M</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/trade?symbol=${m.symbol}`} className="table-trade-btn">
                        Trade Spot
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
