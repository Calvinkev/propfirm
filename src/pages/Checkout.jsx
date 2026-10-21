import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Card from '../components/Card'
import Button from '../components/Button'
import Icon from '../components/Icon'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Checkout.css'

const ACCOUNT_SIZES = [
  { label: '$1,000',   fee: '$25',  feeNum: 25,  value: 1000,   profitTarget: 10 },
  { label: '$2,500',   fee: '$50',  feeNum: 50,  value: 2500,   profitTarget: 10 },
  { label: '$6,000',   fee: '$100', feeNum: 100, value: 6000,   profitTarget: 9  },
  { label: '$10,000',  fee: '$150', feeNum: 150, value: 10000,  profitTarget: 8  },
  { label: '$100,000', fee: '$500', feeNum: 500, value: 100000, profitTarget: 8  },
]

const PLATFORMS = ['MetaTrader 5', 'MetaTrader 4', 'cTrader']

export default function Checkout() {
  const { token } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const preselect = location.state?.accountSize
  const defaultSize = ACCOUNT_SIZES.find(a => a.value === preselect) || ACCOUNT_SIZES[3]

  const [selectedSize, setSelectedSize] = useState(defaultSize)
  const [selectedPlatform, setSelectedPlatform] = useState('MetaTrader 5')
  const [paymentMode, setPaymentMode] = useState('crypto') // 'crypto' or 'instant'
  
  // Crypto wallets state
  const [wallets, setWallets] = useState([])
  const [selectedWallet, setSelectedWallet] = useState(null)
  const [txHash, setTxHash] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    const fetchWallets = async () => {
      try {
        const res = await api.getCryptoWallets(token)
        if (res.wallets && res.wallets.length > 0) {
          setWallets(res.wallets)
          setSelectedWallet(res.wallets[0])
        }
      } catch (err) {
        console.error('Failed to load crypto wallets:', err)
      }
    }
    fetchWallets()
  }, [token])

  const handleCopyAddress = (address) => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleSubmitOrder = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      if (paymentMode === 'crypto') {
        if (!selectedWallet) {
          setError('Please select a cryptocurrency network.')
          setLoading(false)
          return
        }
        if (!txHash.trim()) {
          setError('Please enter your payment Transaction Hash (TxID).')
          setLoading(false)
          return
        }

        const res = await api.submitCryptoDeposit(token, {
          accountSize: selectedSize.value,
          feeAmount: selectedSize.feeNum,
          platform: selectedPlatform,
          coin: selectedWallet.symbol,
          network: selectedWallet.network,
          depositAddress: selectedWallet.address,
          txHash: txHash.trim()
        })

        if (res.depositId) {
          setSuccessMsg('Crypto deposit submitted! Admin is confirming your transaction. Your account will be provisioned shortly.')
          setTimeout(() => navigate('/dashboard'), 3000)
        } else {
          setError(res.error || 'Failed to submit deposit.')
        }
      } else {
        // Direct instant demo creation for testing
        const res = await api.createAccount(token, {
          accountSize: selectedSize.value,
          accountType: 'Challenge',
        })
        if (res.accountId) {
          navigate('/dashboard')
        } else {
          setError(res.error || 'Failed to create account.')
        }
      }
    } catch (err) {
      setError('Server error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="checkout">
      <div className="topbar">
        <div>
          <h1>Start a New Challenge</h1>
          <div className="sub">Select account size, platform, and complete payment via Crypto</div>
        </div>
      </div>

      <div className="checkout-wrap">
        {/* Left column */}
        <div>
          {/* 1. Account size */}
          <Card style={{ padding: '26px', marginBottom: '20px' }}>
            <div className="panel-head"><h3>1 · Account Size</h3></div>
            <div className="size-grid">
              {ACCOUNT_SIZES.map(acc => (
                <div
                  key={acc.value}
                  className={`size-opt ${selectedSize.value === acc.value ? 'selected' : ''}`}
                  onClick={() => setSelectedSize(acc)}
                >
                  <div className="top">
                    <b>{acc.label}</b>
                    <div className="radio" />
                  </div>
                  <div className="fee">{acc.fee} entry fee</div>
                </div>
              ))}
            </div>
          </Card>

          {/* 2. Platform */}
          <Card style={{ padding: '26px', marginBottom: '20px' }}>
            <div className="panel-head"><h3>2 · Trading Platform</h3></div>
            <div className="platform-row">
              {PLATFORMS.map(p => (
                <div
                  key={p}
                  className={`platform-opt ${selectedPlatform === p ? 'selected' : ''}`}
                  onClick={() => setSelectedPlatform(p)}
                >
                  {p}
                </div>
              ))}
            </div>
          </Card>

          {/* 3. Crypto Payment Section */}
          <Card style={{ padding: '26px', marginBottom: '20px' }}>
            <div className="panel-head">
              <h3>3 · Payment Method (Crypto Deposit)</h3>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setPaymentMode('crypto')}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer',
                  border: paymentMode === 'crypto' ? '1px solid var(--brass)' : '1px solid var(--border-soft)',
                  background: paymentMode === 'crypto' ? 'var(--surface-raised)' : 'transparent',
                  color: paymentMode === 'crypto' ? 'var(--brass)' : 'var(--text-muted)',
                  fontWeight: 600, fontSize: '13px'
                }}
              >
                ₿ Pay with Cryptocurrency
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('instant')}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer',
                  border: paymentMode === 'instant' ? '1px solid var(--brass)' : '1px solid var(--border-soft)',
                  background: paymentMode === 'instant' ? 'var(--surface-raised)' : 'transparent',
                  color: paymentMode === 'instant' ? 'var(--brass)' : 'var(--text-muted)',
                  fontWeight: 600, fontSize: '13px', display:'flex', alignItems:'center', justifyContent:'center', gap:6
                }}
              >
                <Icon name="lightning" size={14} /> Instant Test Onboarding
              </button>
            </div>

            {paymentMode === 'crypto' && (
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>
                  Select Crypto Coin & Network
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                  {wallets.map((w) => (
                    <div
                      key={w.id}
                      onClick={() => setSelectedWallet(w)}
                      style={{
                        padding: '12px', borderRadius: '8px', cursor: 'pointer',
                        border: selectedWallet?.id === w.id ? '2px solid var(--brass)' : '1px solid var(--border-soft)',
                        background: selectedWallet?.id === w.id ? 'rgba(201,162,39,0.1)' : 'var(--surface-raised)',
                        textAlign: 'center'
                      }}
                    >
                      <b style={{ display: 'block', fontSize: '14px', color: '#fff' }}>{w.symbol}</b>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.network}</span>
                    </div>
                  ))}
                </div>

                {selectedWallet && (
                  <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', padding: '20px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Deposit Address ({selectedWallet.network})</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--brass)', background: 'rgba(201,162,39,0.15)', padding: '3px 8px', borderRadius: '4px' }}>
                        Send Fee: {selectedSize.fee}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                      <input
                        type="text"
                        readOnly
                        value={selectedWallet.address}
                        style={{
                          flex: 1, padding: '10px 12px', background: '#0D0E11', border: '1px solid var(--border-soft)',
                          borderRadius: '6px', color: 'var(--brass)', fontFamily: 'monospace', fontSize: '13px'
                        }}
                      />
                      <Button type="button" onClick={() => handleCopyAddress(selectedWallet.address)}
                        style={{ padding: '8px 16px', fontSize: '12px', display:'flex', alignItems:'center', gap:5 }}>
                        {copied ? <><Icon name="check" size={13} /> Copied</> : <><Icon name="copy" size={13} /> Copy</>}
                      </Button>
                    </div>

                    {selectedWallet.instructions && (
                      <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '16px', lineHeight: '1.4', display:'flex', alignItems:'flex-start', gap:5 }}>
                        <Icon name="info" size={13} color="var(--text-faint)" style={{ flexShrink:0, marginTop:1 }} />
                        {selectedWallet.instructions}
                      </p>
                    )}

                    <div style={{ marginTop: '16px' }}>
                      <label style={{ fontSize: '12.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                        Enter Transaction Hash / TxID
                      </label>
                      <input
                        type="text"
                        placeholder="Paste your 64-character transaction hash or TxID here"
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        style={{
                          width: '100%', padding: '12px', background: '#0D0E11', border: '1px solid var(--border-soft)',
                          borderRadius: '6px', color: '#fff', fontSize: '13px'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Order summary */}
        <Card className="summary-card" style={{ padding: '26px' }}>
          <h3 style={{ fontSize: '15.5px', marginBottom: '6px' }}>Order Summary</h3>
          <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '18px' }}>
            {selectedSize.label} Challenge · Phase 1
          </div>

          <div className="summary-row">
            <span>Account size</span>
            <span className="mono">{selectedSize.label}</span>
          </div>
          <div className="summary-row">
            <span>Platform</span>
            <span>{selectedPlatform}</span>
          </div>
          <div className="summary-row">
            <span>Payment Method</span>
            <span>{paymentMode === 'crypto' ? `${selectedWallet?.symbol || 'Crypto'} (${selectedWallet?.network || ''})` : 'Instant Test'}</span>
          </div>
          <div className="summary-row">
            <span>Profit target</span>
            <span className="mono">{selectedSize.profitTarget}%</span>
          </div>
          <div className="summary-row">
            <span>Max daily loss</span>
            <span className="mono">5%</span>
          </div>
          <div className="summary-row">
            <span>Max drawdown</span>
            <span className="mono">10%</span>
          </div>
          <div className="summary-row total">
            <span>Entry fee today</span>
            <span>{selectedSize.fee}</span>
          </div>

          {error && (
            <div style={{ color: 'var(--red)', background: 'var(--red-dim)', border: '1px solid rgba(229,72,77,0.3)', borderRadius: '7px', padding: '10px', fontSize: '13px', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          {successMsg && (
            <div style={{ color: 'var(--green)', background: 'rgba(62,207,142,0.15)', border: '1px solid var(--green)', borderRadius: '7px', padding: '10px', fontSize: '13px', marginBottom: '12px' }}>
              {successMsg}
            </div>
          )}

          <Button
            onClick={handleSubmitOrder}
            disabled={loading}
            style={{ width: '100%', marginTop: '20px', padding: '13px' }}
          >
            {loading ? 'Processing Payment…' : `Confirm & Pay ${selectedSize.fee}`}
          </Button>
          <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '12px' }}>
            Account issued after crypto transaction confirmation
          </div>
        </Card>
      </div>
    </div>
  )
}
