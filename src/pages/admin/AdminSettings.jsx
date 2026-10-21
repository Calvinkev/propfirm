import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminSettings() {
  const { token } = useAuth()
  const [saved, setSaved] = useState(false)
  const [wallets, setWallets] = useState([])
  const [deposits, setDeposits] = useState([])
  const [loadingWallets, setLoadingWallets] = useState(true)
  const [loadingDeposits, setLoadingDeposits] = useState(true)

  // Wallet Form Modal state
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [walletForm, setWalletForm] = useState({ id: null, symbol: 'USDT', network: 'TRC20', address: '', instructions: '' })

  const [settings, setSettings] = useState({
    profitTargetPhase1: 10,
    profitTargetPhase2: 5,
    maxDailyLoss: 5,
    maxTotalDrawdown: 10,
    profitSplit: 90,
    minimumTradingDays: 5,
    payoutCycle: 'Bi-Weekly',
    cryptoPaymentsEnabled: true
  })

  const loadWallets = async () => {
    try {
      setLoadingWallets(true)
      const res = await api.getAdminCryptoWallets(token)
      if (res.wallets) setWallets(res.wallets)
    } catch (err) {
      console.error('Failed to load crypto wallets:', err)
    } finally {
      setLoadingWallets(false)
    }
  }

  const loadDeposits = async () => {
    try {
      setLoadingDeposits(true)
      const res = await api.getAdminCryptoDeposits(token)
      if (res.deposits) setDeposits(res.deposits)
    } catch (err) {
      console.error('Failed to load crypto deposits:', err)
    } finally {
      setLoadingDeposits(false)
    }
  }

  useEffect(() => {
    loadWallets()
    loadDeposits()
  }, [token])

  const handleSaveWallet = async (e) => {
    e.preventDefault()
    try {
      await api.saveAdminCryptoWallet(token, walletForm)
      setShowWalletModal(false)
      setWalletForm({ id: null, symbol: 'USDT', network: 'TRC20', address: '', instructions: '' })
      loadWallets()
    } catch (err) {
      alert('Failed to save crypto wallet')
    }
  }

  const handleToggleWallet = async (id) => {
    try {
      await api.toggleAdminCryptoWallet(token, id)
      loadWallets()
    } catch (err) {
      console.error('Failed to toggle wallet:', err)
    }
  }

  const handleDeleteWallet = async (id) => {
    if (window.confirm('Delete this crypto wallet address?')) {
      try {
        await api.deleteAdminCryptoWallet(token, id)
        loadWallets()
      } catch (err) {
        console.error('Failed to delete wallet:', err)
      }
    }
  }

  const handleApproveDeposit = async (depositId) => {
    try {
      const res = await api.approveAdminCryptoDeposit(token, depositId)
      if (res.message) {
        alert(res.message)
        loadDeposits()
      }
    } catch (err) {
      alert('Failed to approve deposit')
    }
  }

  const handleRejectDeposit = async (depositId) => {
    if (window.confirm('Reject this crypto deposit request?')) {
      try {
        await api.rejectAdminCryptoDeposit(token, depositId)
        loadDeposits()
      } catch (err) {
        console.error('Failed to reject deposit:', err)
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div>
          <h1>Prop Firm Settings & Crypto Management</h1>
          <div className="sub">Set up deposit wallet addresses, networks, approve trader payments, and set evaluation rules</div>
        </div>
      </div>

      {saved && (
        <div style={{ background: 'rgba(62,207,142,0.15)', border: '1px solid var(--green)', color: 'var(--green)', padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', display:'flex', alignItems:'center', gap:8 }}>
          <Icon name="checkCircle" size={16} color="var(--green)" />
          Settings saved successfully!
        </div>
      )}

      {/* ── 1. CRYPTO DEPOSIT WALLET MANAGER ── */}
      <Card className="admin-panel" style={{ marginBottom: '24px' }}>
        <div className="panel-head">
          <div>
            <h3>Admin Crypto Deposit Wallets</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Configured wallet addresses for trader challenge purchases</span>
          </div>
          <Button onClick={() => { setWalletForm({ id: null, symbol: 'USDT', network: 'TRC20', address: '', instructions: '' }); setShowWalletModal(true); }}>
            + Add Crypto Wallet
          </Button>
        </div>

        {loadingWallets ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading wallets...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Network</th>
                <th>Deposit Wallet Address</th>
                <th>Instructions</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id}>
                  <td className="mono" style={{ fontWeight: 600, color: 'var(--brass)' }}>{w.symbol}</td>
                  <td className="mono">{w.network}</td>
                  <td className="mono" style={{ fontSize: '12px' }}>{w.address}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-faint)', maxWidth: '240px' }}>{w.instructions || '—'}</td>
                  <td>
                    <span className={`status-badge ${w.is_active ? 'completed' : 'rejected'}`}>
                      {w.is_active ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button
                        variant="outline"
                        onClick={() => handleToggleWallet(w.id)}
                        style={{ padding: '4px 8px', fontSize: '10px' }}
                      >
                        {w.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDeleteWallet(w.id)}
                        style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--red)', borderColor: 'var(--red)' }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── 2. TRADER CRYPTO DEPOSITS APPROVAL CONSOLE ── */}
      <Card className="admin-panel" style={{ marginBottom: '24px' }}>
        <div className="panel-head">
          <div>
            <h3>Pending & Historical Trader Crypto Deposits</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Review transaction hashes and issue challenge accounts upon approval</span>
          </div>
        </div>

        {loadingDeposits ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading deposit submissions...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Trader</th>
                <th>Account Size</th>
                <th>Fee Paid</th>
                <th>Coin & Network</th>
                <th>Tx Hash / TxID</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-faint)' }}>
                    No deposit submissions recorded yet.
                  </td>
                </tr>
              ) : (
                deposits.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">{(d.first_name || 'T')[0]}</div>
                        <div>
                          <b>{d.first_name} {d.last_name}</b>
                          <span>{d.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="mono">${parseFloat(d.account_size).toLocaleString()}</td>
                    <td className="mono" style={{ color: 'var(--green)', fontWeight: 600 }}>${parseFloat(d.fee_amount).toFixed(2)}</td>
                    <td className="mono">{d.coin} ({d.network})</td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--brass)' }}>
                      {d.tx_hash}
                    </td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <span className={`status-badge ${d.status.toLowerCase()}`}>{d.status}</span>
                    </td>
                    <td>
                      {d.status === 'Pending' && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Button
                            onClick={() => handleApproveDeposit(d.id)}
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >
                            Approve & Issue Account
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleRejectDeposit(d.id)}
                            style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--red)', borderColor: 'var(--red)' }}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── 3. EVALUATION RULES FORM ── */}
      <form onSubmit={handleSubmit}>
        <div className="admin-grid-2">
          <Card className="admin-panel">
            <h3 style={{ marginBottom: '16px' }}>Evaluation Rules & Targets</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Phase 1 Profit Target (%)</label>
                <input
                  type="number" step="0.5" value={settings.profitTargetPhase1}
                  onChange={(e) => setSettings({ ...settings, profitTargetPhase1: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Phase 2 Profit Target (%)</label>
                <input
                  type="number" step="0.5" value={settings.profitTargetPhase2}
                  onChange={(e) => setSettings({ ...settings, profitTargetPhase2: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Max Daily Loss Limit (%)</label>
                <input
                  type="number" step="0.5" value={settings.maxDailyLoss}
                  onChange={(e) => setSettings({ ...settings, maxDailyLoss: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Max Overall Drawdown Limit (%)</label>
                <input
                  type="number" step="0.5" value={settings.maxTotalDrawdown}
                  onChange={(e) => setSettings({ ...settings, maxTotalDrawdown: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
                />
              </div>
            </div>
          </Card>

          <Card className="admin-panel">
            <h3 style={{ marginBottom: '16px' }}>Payout & Capital Settings</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Default Trader Profit Split (%)</label>
                <input
                  type="number" value={settings.profitSplit}
                  onChange={(e) => setSettings({ ...settings, profitSplit: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Minimum Required Trading Days</label>
                <input
                  type="number" value={settings.minimumTradingDays}
                  onChange={(e) => setSettings({ ...settings, minimumTradingDays: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Payout Distribution Cycle</label>
                <select
                  value={settings.payoutCycle}
                  onChange={(e) => setSettings({ ...settings, payoutCycle: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginTop: '6px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
                >
                  <option value="On-Demand">On-Demand</option>
                  <option value="Bi-Weekly">Bi-Weekly (14 Days)</option>
                  <option value="Monthly">Monthly (30 Days)</option>
                </select>
              </div>

              <div style={{ marginTop: '20px' }}>
                <Button type="submit">Save Rules Configuration</Button>
              </div>
            </div>
          </Card>
        </div>
      </form>

      {/* Wallet Modal */}
      {showWalletModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-soft)',
            padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '420px'
          }}>
            <h2 style={{ marginBottom: '16px' }}>Configure Crypto Deposit Wallet</h2>
            <form onSubmit={handleSaveWallet} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cryptocurrency Symbol</label>
              <input
                type="text" placeholder="e.g. USDT, BTC, ETH, SOL" required
                value={walletForm.symbol} onChange={(e) => setWalletForm({ ...walletForm, symbol: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />

              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Blockchain Network</label>
              <input
                type="text" placeholder="e.g. TRC20, ERC20, Bitcoin, Solana" required
                value={walletForm.network} onChange={(e) => setWalletForm({ ...walletForm, network: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />

              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Admin Receiving Wallet Address</label>
              <input
                type="text" placeholder="Paste your wallet address here" required
                value={walletForm.address} onChange={(e) => setWalletForm({ ...walletForm, address: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff', fontFamily: 'monospace' }}
              />

              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Deposit Instructions (Optional)</label>
              <textarea
                placeholder="e.g. Send exact USDT amount via TRC20 network." rows="3"
                value={walletForm.instructions} onChange={(e) => setWalletForm({ ...walletForm, instructions: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <Button type="submit" style={{ flex: 1 }}>Save Wallet Address</Button>
                <Button variant="outline" type="button" onClick={() => setShowWalletModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
