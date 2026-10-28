import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import CryptoIcon from '../components/CryptoIcon';
import { api } from '../services/api';
import './Landing.css';

export default function Landing() {
  const [markets, setMarkets] = useState({});
  const [marketsLoading, setMarketsLoading] = useState(true);

  useEffect(() => {
    async function loadMarkets() {
      try {
        const res = await api.getMarketOverview();
        if (res.markets) {
          setMarkets(res.markets);
        }
      } catch (err) {
        console.error('Landing load markets error:', err);
      } finally {
        setMarketsLoading(false);
      }
    }
    loadMarkets();
    const interval = setInterval(loadMarkets, 5000);
    return () => clearInterval(interval);
  }, []);

  const popularSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT'];

  const heroSymbol = 'BTCUSDT';
  const heroMarket = markets[heroSymbol] || null;
  const heroPrice = heroMarket
    ? `$${parseFloat(heroMarket.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    : 'Loading...';
  const heroChange = heroMarket
    ? `${heroMarket.change24h >= 0 ? '+' : ''}${parseFloat(heroMarket.change24h).toFixed(2)}%`
    : '--';

  return (
    <div className="stakeup-landing">
      {/* ── Navbar ── */}
      <header className="landing-nav">
        <div className="nav-container">
          <Link to="/" className="landing-brand">
            <Logo size="medium" />
          </Link>
          <nav className="landing-nav-links">
            <a href="#markets" className="landing-nav-link">Markets</a>
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#steps" className="landing-nav-link">How It Works</a>
          </nav>
          <div className="nav-actions">
            <Link to="/login" className="btn-login">Log In</Link>
            <Link to="/register" className="btn-register">Create Account</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-copy">
            <div className="hero-eyebrow">Spot &amp; Futures Trading</div>
            <h1 className="hero-title">
              Trade with
              <span className="hero-accent"> Conviction</span>,
              <br />
              Execute with Precision.
            </h1>
            <p className="hero-sub">
              STAKEUP is a professional cryptocurrency exchange with spot and futures trading,
              high-speed matching, and a live market feed built for active decision-making.
            </p>
            <div className="hero-ctas">
              <Link to="/register" className="btn-cta-primary">Start Trading</Link>
              <Link to="/markets" className="btn-cta-secondary">
                <Icon name="trendingUp" size={16} />
                Explore Markets
              </Link>
            </div>
            <div className="hero-tagline">PROVE YOUR EDGE. TRADE WITH PRECISION.</div>
          </div>

          <aside className="hero-panel" aria-label="Live BTC market panel">
            <div className="hero-panel-head">
              <div className="hero-panel-pair">
                <CryptoIcon symbol="BTC" size={30} />
                <div>
                  <div className="hero-panel-symbol">BTC / USDT</div>
                  <div className="hero-panel-meta">Live market snapshot</div>
                </div>
              </div>
              <span className={`hero-panel-change ${heroMarket && heroMarket.change24h >= 0 ? 'pos' : 'neg'}`}>
                {heroChange}
              </span>
            </div>
            <div className="hero-panel-price">{heroPrice}</div>
            <div className="hero-panel-grid">
              <div className="hero-metric">
                <span>Execution</span>
                <strong>&lt; 40ms</strong>
              </div>
              <div className="hero-metric">
                <span>Order Types</span>
                <strong>Market + Limit</strong>
              </div>
              <div className="hero-metric">
                <span>Products</span>
                <strong>Spot + Futures</strong>
              </div>
              <div className="hero-metric">
                <span>Live Feed</span>
                <strong>24/7</strong>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="proof-strip" aria-label="Platform highlights">
        <div className="proof-container">
          <div className="proof-item">
            <span className="proof-value">5+</span>
            <span className="proof-label">Core pairs tracked live</span>
          </div>
          <div className="proof-item">
            <span className="proof-value">2</span>
            <span className="proof-label">Trading environments</span>
          </div>
          <div className="proof-item">
            <span className="proof-value">24/7</span>
            <span className="proof-label">Real-time market visibility</span>
          </div>
          <div className="proof-item">
            <span className="proof-value">1</span>
            <span className="proof-label">Unified wallet &amp; portfolio</span>
          </div>
        </div>
      </section>

      {/* ── Market Strip ── */}
      <section className="markets-section" id="markets">
        <div className="section-container">
          <div className="section-head">
            <h2 className="section-title">Live Market Prices</h2>
            <Link to="/markets" className="section-link">View all markets →</Link>
          </div>

          {marketsLoading ? (
            <div className="market-skeleton-row">
              {popularSymbols.map(s => (
                <div key={s} className="market-skeleton-card" />
              ))}
            </div>
          ) : (
            <div className="markets-grid">
              {popularSymbols.map(sym => {
                const m = markets[sym] || null;
                const ticker = sym.replace('USDT', '');
                const isPos = m ? m.change24h >= 0 : null;
                return (
                  <Link to={`/trade?symbol=${sym}`} key={sym} className="market-card">
                    <div className="market-card-top">
                      <div className="market-pair-row">
                        <CryptoIcon symbol={ticker} size={28} />
                        <div>
                          <span className="market-base">{ticker}</span>
                          <span className="market-quote"> / USDT</span>
                        </div>
                      </div>
                      {m && (
                        <span className={`market-change ${isPos ? 'pos' : 'neg'}`}>
                          {isPos ? '+' : ''}{parseFloat(m.change24h).toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="market-price">
                      {m
                        ? `$${parseFloat(m.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : '—'
                      }
                    </div>
                    <div className="market-card-trade">Trade →</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features-section" id="features">
        <div className="section-container">
          <h2 className="section-title">Built for Active Traders</h2>
          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon-wrap">
                <Icon name="lightning" size={22} color="var(--brass)" />
              </div>
              <h3>Spot Trading Engine</h3>
              <p>Market and limit orders across major crypto pairs with a real-time matching engine and live depth feed.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrap">
                <Icon name="trendingUp" size={22} color="var(--brass)" />
              </div>
              <h3>Futures &amp; Leverage</h3>
              <p>Open long or short perpetual positions with configurable leverage and real-time mark price tracking.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrap">
                <Icon name="arrowsSwap" size={22} color="var(--brass)" />
              </div>
              <h3>Instant Convert</h3>
              <p>Swap between supported assets at live market rates with a quoted price and transparent fee before confirmation.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrap">
                <Icon name="sparkles" size={22} color="var(--brass)" />
              </div>
              <h3>Simple Earn</h3>
              <p>Put idle assets to work with flexible and fixed-term earn products. Redeem at any time on flexible positions.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrap">
                <Icon name="chartBar" size={22} color="var(--brass)" />
              </div>
              <h3>Live Charts</h3>
              <p>Candlestick charts with multiple timeframes, volume visualization, and a real-time price crosshair.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrap">
                <Icon name="shieldCheck" size={22} color="var(--brass)" />
              </div>
              <h3>Account Security</h3>
              <p>JWT-authenticated sessions, server-side balance enforcement, and confirmation flows for consequential actions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Getting Started ── */}
      <section className="steps-section" id="steps">
        <div className="section-container">
          <h2 className="section-title">Start in three steps</h2>
          <div className="steps-grid">
            <div className="step-item">
              <div className="step-num">01</div>
              <h3>Create an account</h3>
              <p>Register with your email address. Your account gives you access to spot trading, futures, earn, and wallet immediately.</p>
            </div>
            <div className="step-item">
              <div className="step-num">02</div>
              <h3>Fund your wallet</h3>
              <p>Deposit supported cryptocurrencies to your spot wallet. New accounts start with a USDT balance for getting started.</p>
            </div>
            <div className="step-item">
              <div className="step-num">03</div>
              <h3>Place your first trade</h3>
              <p>Open the trading terminal, select a pair, set your order type and quantity, and submit with a single confirmation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <Logo size="small" />
            <p className="footer-desc">A professional cryptocurrency exchange for spot and futures trading.</p>
          </div>
          <div className="footer-links-group">
            <div className="footer-links-col">
              <span className="footer-col-label">Trade</span>
              <Link to="/markets" className="footer-link">Markets</Link>
              <Link to="/register" className="footer-link">Spot Trading</Link>
              <Link to="/register" className="footer-link">Futures</Link>
              <Link to="/register" className="footer-link">Convert</Link>
            </div>
            <div className="footer-links-col">
              <span className="footer-col-label">Account</span>
              <Link to="/register" className="footer-link">Create Account</Link>
              <Link to="/login" className="footer-link">Log In</Link>
              <Link to="/register" className="footer-link">Earn</Link>
              <Link to="/register" className="footer-link">Wallet</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 STAKEUP. All rights reserved. Trading cryptocurrency involves significant risk.</p>
        </div>
      </footer>
    </div>
  );
}
