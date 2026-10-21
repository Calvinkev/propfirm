import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import CryptoIcon from '../components/CryptoIcon';
import { api } from '../services/api';
import './Landing.css';

export default function Landing() {
  const [markets, setMarkets] = useState({});

  useEffect(() => {
    async function loadMarkets() {
      try {
        const res = await api.getMarketOverview();
        if (res.markets) {
          setMarkets(res.markets);
        }
      } catch (err) {
        console.error('Landing load markets error:', err);
      }
    }
    loadMarkets();
    const interval = setInterval(loadMarkets, 5000);
    return () => clearInterval(interval);
  }, []);

  const popularSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT'];

  return (
    <div className="binance-landing">
      {/* Top Navbar */}
      <header className="landing-nav">
        <div className="nav-container">
          <div className="brand-group">
            <Logo size="medium" />
            <span className="landing-brand-text">STAKEUP <span className="yellow-badge">BINANCE SPOT</span></span>
          </div>
          <div className="nav-actions">
            <Link to="/login" className="btn-login">Log In</Link>
            <Link to="/register" className="btn-register">Register</Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="yellow-text">242,108,124</span> USERS <br />TRUST US
          </h1>
          <p className="hero-sub">
            Trade 350+ Cryptocurrencies with Low Fees, High Speed Matching Engine and Industry-Leading Security.
          </p>

          <div className="cta-box">
            <Link to="/register" className="btn-hero-signup">
              Sign Up with Email or Phone
            </Link>
          </div>
        </div>
      </section>

      {/* Market Overview Ticker */}
      <section className="markets-ticker-section">
        <div className="section-container">
          <h2 className="section-title">Popular Cryptocurrencies</h2>
          <div className="markets-grid">
            {popularSymbols.map(sym => {
              const m = markets[sym] || { price: '---', change24h: 0 };
              const isPos = m.change24h >= 0;
              const ticker = sym.replace('USDT', '');
              return (
                <div key={sym} className="market-card">
                  <div className="card-pair-row">
                    <CryptoIcon symbol={ticker} size={32} />
                    <div>
                      <div className="card-pair">{ticker}<span className="card-quote"> / USDT</span></div>
                    </div>
                  </div>
                  <div className="card-price">${parseFloat(m.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className={`card-change ${isPos ? 'pos' : 'neg'}`}>
                    {isPos ? '+' : ''}{parseFloat(m.change24h || 0).toFixed(2)}%
                  </div>
                  <Link to={`/trade?symbol=${sym}`} className="card-trade-btn">Trade Now</Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features-section">
        <div className="section-container">
          <h2 className="section-title">Trade Anywhere, Anytime</h2>
          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon-wrap"><Icon name="lightning" size={28} color="var(--binance-yellow)" /></div>
              <h3>Ultra-Fast Spot Engine</h3>
              <p>Execute market and limit orders with high frequency low-latency matching engine.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrap"><Icon name="shieldCheck" size={28} color="var(--binance-yellow)" /></div>
              <h3>Institutional Security</h3>
              <p>Protected by cold storage wallet architecture and end-to-end encrypted balance vaults.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrap"><Icon name="sparkles" size={28} color="var(--binance-yellow)" /></div>
              <h3>Zero Slippage</h3>
              <p>Deep liquidity across BTC, ETH, SOL, BNB, XRP and major altcoins.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="section-container">
          <p>© 2026 STAKEUP Crypto Exchange. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
