import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import Card from '../components/Card'
import Eyebrow from '../components/Eyebrow'
import Logo from '../components/Logo'
import { wsService } from '../services/websocket'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Landing.css'

// Custom hook for scroll-triggered animations
function useScrollAnimation(options = {}) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const threshold = options.threshold !== undefined ? options.threshold : 0.15
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold, rootMargin: options.rootMargin || '0px' }
    )

    const currentRef = ref.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [options.threshold, options.rootMargin])

  return [ref, isVisible]
}

function useCounter(end, duration = 2000, trigger = true) {
  const [count, setCount] = useState(0)
  
  useEffect(() => {
    if (!trigger) return
    let startTimestamp = null
    const step = timestamp => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }
    window.requestAnimationFrame(step)
  }, [end, duration, trigger])

  return count
}

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [marketData, setMarketData] = useState({})
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isScrolled, setIsScrolled] = useState(false)
  const [scrollPosition, setScrollPosition] = useState(0)

  const { isAuthenticated, token, logout } = useAuth()
  const navigate = useNavigate()

  // Track window scroll for progress bar, sticky nav, and ambient parallax
  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = window.scrollY
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = totalHeight > 0 ? (currentScroll / totalHeight) * 100 : 0
      
      setScrollProgress(progress)
      setIsScrolled(currentScroll > 30)
      setScrollPosition(currentScroll)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Scroll animation refs
  const [heroRef, heroVisible] = useScrollAnimation({ threshold: 0.1 })
  const [stepsHeadRef, stepsHeadVisible] = useScrollAnimation({ threshold: 0.2 })
  const [stepsGridRef, stepsGridVisible] = useScrollAnimation({ threshold: 0.15 })
  const [pricingHeadRef, pricingHeadVisible] = useScrollAnimation({ threshold: 0.2 })
  const [pricingGridRef, pricingGridVisible] = useScrollAnimation({ threshold: 0.15 })
  const [trustRef, trustVisible] = useScrollAnimation({ threshold: 0.2 })
  const [quotesHeadRef, quotesHeadVisible] = useScrollAnimation({ threshold: 0.2 })
  const [quotesGridRef, quotesGridVisible] = useScrollAnimation({ threshold: 0.15 })
  const [faqRef, faqVisible] = useScrollAnimation({ threshold: 0.2 })
  const [ctaRef, ctaVisible] = useScrollAnimation({ threshold: 0.2 })

  // Counters triggered on view
  const heroPaidTraders = useCounter(4800000, 2500, heroVisible)
  const heroFundedAccounts = useCounter(11400, 2000, heroVisible)
  const maxProfitSplit = useCounter(90, 1500, heroVisible)
  const challengeWindow = useCounter(30, 1500, heroVisible)

  const trustPaidTraders = useCounter(4800000, 2200, trustVisible)
  const trustFundedAccounts = useCounter(11400, 2000, trustVisible)
  const trustMaxProfitSplit = useCounter(90, 1500, trustVisible)
  const trustChallengeWindow = useCounter(30, 1500, trustVisible)

  useEffect(() => {
    if (token) {
      wsService.connect(token)
      wsService.subscribeToMarketData(['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'XAU/USD'])
      wsService.on('market_data', (data) => {
        setMarketData(prev => ({ ...prev, [data.symbol]: data.data }))
      })
    } else {
      const fetchMarketData = async () => {
        try {
          const data = await api.getCurrentMarketData(null, ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'XAU/USD'])
          if (data.prices) {
            setMarketData(data.prices)
          }
        } catch (err) {
          console.error('Failed to fetch market data:', err)
        }
      }
      fetchMarketData()
    }
  }, [token])

  const getMarketDisplay = (symbol) => {
    const data = marketData[symbol]
    if (!data) return null
    
    const change = parseFloat(data.change)
    const isUp = change >= 0
    
    return (
      <span>{symbol} <b className={isUp ? 'up' : 'down'}>{data.price.toFixed(2)} {isUp ? '▲' : '▼'}{Math.abs(change).toFixed(2)}%</b></span>
    )
  }

  return (
    <div className="landing">
      {/* Top Scroll Progress Bar */}
      <div 
        className="scroll-progress-bar" 
        style={{ width: `${scrollProgress}%` }} 
      />

      {/* Ambient Parallax Background Glows */}
      <div className="landing-bg-glows">
        <div 
          className="bg-glow bg-glow-1" 
          style={{ transform: `translateY(${scrollPosition * 0.12}px)` }} 
        />
        <div 
          className="bg-glow bg-glow-2" 
          style={{ transform: `translateY(${-scrollPosition * 0.08}px)` }} 
        />
      </div>

      <nav className={`l-nav ${isScrolled ? 'scrolled' : ''}`}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Logo size="medium" />
        </Link>
        <div className="l-nav-links">
          <a href="#challenges">Challenges</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#rules">Rules</a>
          <a href="#traders">Traders</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="l-nav-cta">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Button variant="ghost" onClick={logout}>Log out</Button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Button onClick={() => navigate('/register')}>Start a Challenge</Button>
            </>
          )}
        </div>
        <button 
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu">
            <a href="#challenges">Challenges</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#rules">Rules</a>
            <a href="#traders">Traders</a>
            <a href="#faq">FAQ</a>
            <div className="mobile-menu-cta">
              {isAuthenticated ? (
                <>
                  <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                  <Button variant="ghost" onClick={() => { logout(); setMobileMenuOpen(false) }}>Log out</Button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
                  <Button onClick={() => { navigate('/register'); setMobileMenuOpen(false) }}>Start a Challenge</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="ticker-wrap">
        <div className="ticker">
          {getMarketDisplay('EUR/USD') || <span>EUR/USD <b className="up">1.0842 ▲0.12%</b></span>}
          {getMarketDisplay('GBP/USD') || <span>GBP/USD <b className="up">1.2701 ▲0.08%</b></span>}
          {getMarketDisplay('USD/JPY') || <span>USD/JPY <b className="down">156.22 ▼0.15%</b></span>}
          {getMarketDisplay('BTC/USD') || <span>BTC/USD <b className="up">67,214 ▲1.02%</b></span>}
          {getMarketDisplay('XAU/USD') || <span>XAU/USD <b className="down">2,318.40 ▼0.34%</b></span>}
          {getMarketDisplay('EUR/USD') || <span>EUR/USD <b className="up">1.0842 ▲0.12%</b></span>}
          {getMarketDisplay('GBP/USD') || <span>GBP/USD <b className="up">1.2701 ▲0.08%</b></span>}
          {getMarketDisplay('USD/JPY') || <span>USD/JPY <b className="down">156.22 ▼0.15%</b></span>}
          {getMarketDisplay('BTC/USD') || <span>BTC/USD <b className="up">67,214 ▲1.02%</b></span>}
          {getMarketDisplay('XAU/USD') || <span>XAU/USD <b className="down">2,318.40 ▼0.34%</b></span>}
        </div>
      </div>

      <header className="l-hero" ref={heroRef}>
        <div className={`l-hero-content reveal reveal-fade-right ${heroVisible ? 'reveal-active' : ''}`}>
          <div>
            <Eyebrow>Funded trading, on your terms</Eyebrow>
            <h1>Prove your edge.<br />We fund <em>the size.</em></h1>
            <p>One evaluation, thirty days, five account sizes. Pass the objectives and trade up to $100,000 of our capital — keep up to 90% of what you make.</p>
            <div className="l-hero-cta">
              <Button onClick={() => navigate(isAuthenticated ? '/checkout' : '/register')}>View Challenges →</Button>
              <Button variant="ghost" onClick={() => navigate('/rules')}>See the Rules</Button>
            </div>
            <div className="l-hero-note">No hidden fees · Instant account issue · Payouts from day 1 of funding</div>
            <div className="l-stats-row stagger-children">
              <div className="l-stat"><b>${(heroPaidTraders / 1000000).toFixed(1)}M+</b><span>Paid to traders</span></div>
              <div className="l-stat"><b>{heroFundedAccounts.toLocaleString()}+</b><span>Funded accounts</span></div>
              <div className="l-stat"><b>{maxProfitSplit}%</b><span>Max profit split</span></div>
              <div className="l-stat"><b>{challengeWindow} days</b><span>Challenge window</span></div>
            </div>
          </div>
        </div>
        <div className={`hero-image reveal reveal-fade-left ${heroVisible ? 'reveal-active' : ''}`}>
          <img src="https://plus.unsplash.com/premium_photo-1681487769650-a0c3fbaed85a?q=80&w=955&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Trading platform" />
        </div>
      </header>

      {/* How It Works Section */}
      <section className="l-section" id="how-it-works">
        <div className="l-wrap">
          <div 
            ref={stepsHeadRef} 
            className={`l-section-head reveal reveal-fade-up ${stepsHeadVisible ? 'reveal-active' : ''}`}
          >
            <Eyebrow>The path to funding</Eyebrow>
            <h2>Three steps. One capital account.</h2>
            <p>Every STAKEUP evaluation follows the same disciplined structure — designed to test consistency, not luck.</p>
          </div>
          <div 
            ref={stepsGridRef} 
            className={`steps-row reveal reveal-fade-up stagger-children ${stepsGridVisible ? 'reveal-active' : ''}`}
          >
            <div className="step-cell">
              <div className="step-no">01</div>
              <h3>Challenge</h3>
              <p>Hit your profit target within 30 days while respecting daily loss and max drawdown limits. This is where discipline is proven.</p>
              <div className="step-meta"><span>Target 8–10%</span><span>Max DD 10%</span></div>
              <div className="step-image">
                <img src="https://images.unsplash.com/photo-1620266757065-5814239881fd?q=80&w=872&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Trading charts" />
              </div>
            </div>
            <div className="step-cell">
              <div className="step-no">02</div>
              <h3>Verification</h3>
              <p>A second, lower-pressure evaluation confirms your edge is repeatable — not a single lucky stretch.</p>
              <div className="step-meta"><span>Target 5%</span><span>No time pressure</span></div>
              <div className="step-image">
                <img src="https://images.unsplash.com/photo-1579226905180-636b76d96082?q=80&w=387&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Market analysis" />
              </div>
            </div>
            <div className="step-cell">
              <div className="step-no">03</div>
              <h3>Funded</h3>
              <p>Trade a live STAKEUP capital account. Request payouts on demand, scale up as you grow your track record.</p>
              <div className="step-meta"><span>Up to 90% split</span><span>Bi-weekly payouts</span></div>
              <div className="step-image">
                <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80" alt="Success" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Challenges Section */}
      <section className="l-section" id="challenges">
        <div className="l-wrap">
          <div 
            ref={pricingHeadRef} 
            className={`l-section-head reveal reveal-fade-up ${pricingHeadVisible ? 'reveal-active' : ''}`}
          >
            <Eyebrow>Choose your capital</Eyebrow>
            <h2>Five account sizes. One standard.</h2>
            <p>Every tier runs the same rule set — only the size of the capital, and the entry fee, change.</p>
          </div>
          <div 
            ref={pricingGridRef} 
            className={`pricing-grid reveal reveal-zoom-in stagger-children ${pricingGridVisible ? 'reveal-active' : ''}`}
          >
            <Card className="price-card">
              <span className="size">Account Size</span>
              <div className="amt">$1,000</div>
              <div className="fee">$25 entry fee</div>
              <ul>
                <li><span>Profit Target</span><span>10%</span></li>
                <li><span>Max Daily Loss</span><span>5%</span></li>
                <li><span>Max Drawdown</span><span>10%</span></li>
                <li><span>Duration</span><span>30 days</span></li>
              </ul>
              <Button variant="ghost" onClick={() => navigate(isAuthenticated ? '/checkout' : '/register', { state: { accountSize: 1000 } })}>Select</Button>
            </Card>
            <Card className="price-card">
              <span className="size">Account Size</span>
              <div className="amt">$2,500</div>
              <div className="fee">$50 entry fee</div>
              <ul>
                <li><span>Profit Target</span><span>10%</span></li>
                <li><span>Max Daily Loss</span><span>5%</span></li>
                <li><span>Max Drawdown</span><span>10%</span></li>
                <li><span>Duration</span><span>30 days</span></li>
              </ul>
              <Button variant="ghost" onClick={() => navigate(isAuthenticated ? '/checkout' : '/register', { state: { accountSize: 2500 } })}>Select</Button>
            </Card>
            <Card className="price-card">
              <span className="size">Account Size</span>
              <div className="amt">$6,000</div>
              <div className="fee">$100 entry fee</div>
              <ul>
                <li><span>Profit Target</span><span>9%</span></li>
                <li><span>Max Daily Loss</span><span>5%</span></li>
                <li><span>Max Drawdown</span><span>10%</span></li>
                <li><span>Duration</span><span>30 days</span></li>
              </ul>
              <Button variant="ghost" onClick={() => navigate(isAuthenticated ? '/checkout' : '/register', { state: { accountSize: 6000 } })}>Select</Button>
            </Card>
            <Card className="price-card featured">
              <span className="badge">Most Popular</span>
              <span className="size">Account Size</span>
              <div className="amt">$10,000</div>
              <div className="fee">$150 entry fee</div>
              <ul>
                <li><span>Profit Target</span><span>8%</span></li>
                <li><span>Max Daily Loss</span><span>5%</span></li>
                <li><span>Max Drawdown</span><span>10%</span></li>
                <li><span>Duration</span><span>30 days</span></li>
              </ul>
              <Button onClick={() => navigate(isAuthenticated ? '/checkout' : '/register', { state: { accountSize: 10000 } })}>Select</Button>
            </Card>
            <Card className="price-card">
              <span className="size">Account Size</span>
              <div className="amt">$100,000</div>
              <div className="fee">$500 entry fee</div>
              <ul>
                <li><span>Profit Target</span><span>8%</span></li>
                <li><span>Max Daily Loss</span><span>5%</span></li>
                <li><span>Max Drawdown</span><span>10%</span></li>
                <li><span>Duration</span><span>30 days</span></li>
              </ul>
              <Button variant="ghost" onClick={() => navigate(isAuthenticated ? '/checkout' : '/register', { state: { accountSize: 100000 } })}>Select</Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust Stats Bar */}
      <section className="l-wrap" ref={trustRef}>
        <div className={`trust-bar reveal reveal-fade-up stagger-children ${trustVisible ? 'reveal-active' : ''}`}>
          <div><b>${(trustPaidTraders / 1000000).toFixed(1)}M+</b><span>Paid to traders</span></div>
          <div><b>{trustFundedAccounts.toLocaleString()}+</b><span>Accounts funded</span></div>
          <div><b>{trustMaxProfitSplit}%</b><span>Max profit split</span></div>
          <div><b>{trustChallengeWindow} days</b><span>Challenge window</span></div>
        </div>
      </section>

      {/* Testimonials / Traders Section */}
      <section className="l-section" id="traders">
        <div className="l-wrap">
          <div 
            ref={quotesHeadRef} 
            className={`l-section-head reveal reveal-fade-up ${quotesHeadVisible ? 'reveal-active' : ''}`}
          >
            <Eyebrow>From the desk</Eyebrow>
            <h2>Traders who made it funded.</h2>
          </div>
          <div 
            ref={quotesGridRef} 
            className={`quote-grid reveal reveal-fade-up stagger-children ${quotesGridVisible ? 'reveal-active' : ''}`}
          >
            <Card className="quote-card">
              <p>"The rules were exactly as written — no surprise drawdown recalculation, no moving targets. Passed Phase 1 in eleven days."</p>
              <div className="who"><div className="avatar">KM</div><div><b>Kwame M.</b><span>Funded · $100K account</span></div></div>
            </Card>
            <Card className="quote-card">
              <p>"First payout landed in under a day. That alone told me this firm treats traders like partners, not customers."</p>
              <div className="who"><div className="avatar">AT</div><div><b>Amara T.</b><span>Funded · $10K account</span></div></div>
            </Card>
            <Card className="quote-card">
              <p>"I've run three prop firm challenges. STAKEUP's dashboard is the only one that actually tells me my real risk in real time."</p>
              <div className="who"><div className="avatar">DK</div><div><b>Daniel K.</b><span>Funded · $6K account</span></div></div>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="l-section" id="faq" ref={faqRef}>
        <div className={`l-wrap reveal reveal-fade-up ${faqVisible ? 'reveal-active' : ''}`} style={{maxWidth: '820px'}}>
          <div className="l-section-head" style={{marginBottom: '20px'}}>
            <Eyebrow>Questions</Eyebrow>
            <h2>Before you start</h2>
          </div>
          <FAQ />
        </div>
      </section>

      {/* CTA Section */}
      <section className="l-cta" ref={ctaRef}>
        <div className={`l-wrap reveal reveal-zoom-in ${ctaVisible ? 'reveal-active' : ''}`}>
          <Eyebrow style={{justifyContent: 'center'}}>Ready when you are</Eyebrow>
          <h2>Your track record is the only<br />application we need.</h2>
          <Button
            style={{padding: '16px 36px', fontSize: '15px'}}
            onClick={() => navigate(isAuthenticated ? '/checkout' : '/register')}
          >
            Start Your Challenge →
          </Button>
        </div>
      </section>

      <footer>
        <div className="l-wrap l-footer">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Logo size="medium" />
          </Link>
          <div className="l-footer-cols">
            <div className="l-footer-col">
              <h4>Product</h4>
              <a href="#challenges">Challenges</a>
              <a href="#rules">Rules</a>
              <a href="#payouts">Payouts</a>
            </div>
            <div className="l-footer-col">
              <h4>Company</h4>
              <a href="#about">About</a>
              <a href="#traders">Traders</a>
              <a href="#support">Support</a>
            </div>
            <div className="l-footer-col">
              <h4>Legal</h4>
              <a href="#terms">Terms</a>
              <a href="#risk">Risk Disclosure</a>
            </div>
          </div>
        </div>
        <div className="l-footer-bottom">
          <span>© 2026 STAKEUP Capital. All rights reserved.</span>
          <span>Trading involves risk. Simulated evaluation accounts only.</span>
        </div>
      </footer>
    </div>
  )
}

function FAQ() {
  const [openIndex, setOpenIndex] = useState(0)

  const items = [
    {
      q: "What happens if I breach the max drawdown?",
      a: "Your challenge account is closed immediately. You can purchase a new challenge at any tier to try again — there's no limit on retries."
    },
    {
      q: "How fast are payouts once I'm funded?",
      a: "Payout requests are processed on a bi-weekly cycle, with most approvals completed in under 24 hours."
    },
    {
      q: "Can I trade news and hold positions over the weekend?",
      a: "Yes — STAKEUP places no restriction on news trading or weekend holding across any account size."
    },
    {
      q: "Is there a minimum number of trading days?",
      a: "Yes, 5 active trading days minimum per phase, with no maximum — take the full 30 days if you need them."
    }
  ]

  return (
    <div className="faq-list">
      {items.map((item, idx) => (
        <div 
          key={idx} 
          className={`faq-item ${openIndex === idx ? 'open' : ''}`}
          onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
        >
          <div className="faq-q">
            {item.q}
            <i>{openIndex === idx ? '−' : '+'}</i>
          </div>
          <div className="faq-a">
            <p>{item.a}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
