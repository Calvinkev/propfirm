import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './Wallet.css';

export default function Wallet() {
  const { token } = useAuth();
  const [balances, setBalances] = useState([]);
  const [depositWallets, setDepositWallets] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  // Modals state
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState('USDT');

  // Form states
  const [depNetwork, setDepNetwork] = useState('');
  const [depAddress, setDepAddress] = useState('');
  const [depTxHash, setDepTxHash] = useState('');
  const [depAmount, setDepAmount] = useState('');

  const [wdAddress, setWdAddress] = useState('');
  const [wdNetwork, setWdNetwork] = useState('TRC20');
  const [wdAmount, setWdAmount] = useState('');

  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    try {
      const [balRes, walRes, depRes, wdRes] = await Promise.all([
        api.getWalletBalances(token),
        api.getDepositWallets(token),
        api.getDepositHistory(token),
        api.getWithdrawalHistory(token)
      ]);
      if (balRes.balances) setBalances(balRes.balances);
      if (walRes.wallets) {
        setDepositWallets(walRes.wallets);
        if (walRes.wallets.length > 0) {
          setDepNetwork(walRes.wallets[0].network);
          setDepAddress(walRes.wallets[0].address);
        }
      }
      if (depRes.deposits) setDeposits(depRes.deposits);
      if (wdRes.withdrawals) setWithdrawals(wdRes.withdrawals);
    } catch (err) {
      console.error('Load wallet error:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.submitDeposit(token, {
        coin: selectedCoin,
        network: depNetwork,
        depositAddress: depAddress,
        txHash: depTxHash,
        amount: depAmount
      });
      if (res.error) {
        showToast('error', res.error);
      } else {
        showToast('success', res.message || 'Deposit submitted');
        setShowDepositModal(false);
        setDepTxHash('');
        setDepAmount('');
        loadData();
      }
    } catch (err) {
      showToast('error', 'Failed to submit deposit');
    }
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.requestWithdrawal(token, {
        coin: selectedCoin,
        network: wdNetwork,
        address: wdAddress,
        amount: wdAmount
      });
      if (res.error) {
        showToast('error', res.error);
      } else {
        showToast('success', res.message || 'Withdrawal requested');
        setShowWithdrawModal(false);
        setWdAddress('');
        setWdAmount('');
        loadData();
      }
    } catch (err) {
      showToast('error', 'Failed to submit withdrawal');
    }
  };

  const totalEstUsdt = balances.reduce((sum, b) => {
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    const rate = b.asset === 'USDT' ? 1 : b.asset === 'BTC' ? 67500 : b.asset === 'ETH' ? 3500 : 150;
    return sum + (free + locked) * rate;
  }, 0);

  return (
    <div className="wallet-page">
      {toast && <div className={`desk-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="wallet-container">
        {/* Wallet Overview Summary Banner */}
        <div className="wallet-summary-card">
          <div className="summary-info">
            <span className="summary-title">Estimated Total Balance</span>
            <div className="summary-value">
              ${totalEstUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="denom">USDT</span>
            </div>
          </div>
          <div className="summary-actions">
            <button
              className="action-btn deposit"
              onClick={() => { setSelectedCoin('USDT'); setShowDepositModal(true); }}
            >
              Deposit Crypto
            </button>
            <button
              className="action-btn withdraw"
              onClick={() => { setSelectedCoin('USDT'); setShowWithdrawModal(true); }}
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* Spot Assets Balance Table */}
        <div className="wallet-card">
          <h2>Spot Assets</h2>
          <table className="wallet-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Available Free</th>
                <th>In Orders (Locked)</th>
                <th>Total Balance</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {balances.map(b => (
                <tr key={b.asset}>
                  <td>
                    <span className="asset-code">{b.asset}</span>
                  </td>
                  <td className="mono">{parseFloat(b.free).toFixed(4)}</td>
                  <td className="mono">{parseFloat(b.locked).toFixed(4)}</td>
                  <td className="mono">{(parseFloat(b.free) + parseFloat(b.locked)).toFixed(4)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="table-act-btn"
                      onClick={() => { setSelectedCoin(b.asset); setShowDepositModal(true); }}
                    >
                      Deposit
                    </button>
                    <button
                      className="table-act-btn"
                      onClick={() => { setSelectedCoin(b.asset); setShowWithdrawModal(true); }}
                    >
                      Withdraw
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Deposit History */}
        <div className="wallet-card">
          <h2>Deposit History</h2>
          <table className="wallet-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Coin</th>
                <th>Network</th>
                <th>Amount</th>
                <th>TX Hash</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 ? (
                <tr><td colSpan="6" className="empty-msg">No deposits submitted</td></tr>
              ) : (
                deposits.map(d => (
                  <tr key={d.id}>
                    <td>{new Date(d.created_at).toLocaleString()}</td>
                    <td><b>{d.coin}</b></td>
                    <td>{d.network}</td>
                    <td className="mono">{parseFloat(d.amount).toFixed(4)}</td>
                    <td className="mono" style={{ fontSize: '11px' }}>{d.tx_hash.slice(0, 16)}...</td>
                    <td><span className={`status-badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Withdrawal History */}
        <div className="wallet-card">
          <h2>Withdrawal History</h2>
          <table className="wallet-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Coin</th>
                <th>Network</th>
                <th>Destination Address</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr><td colSpan="6" className="empty-msg">No withdrawals requested</td></tr>
              ) : (
                withdrawals.map(w => (
                  <tr key={w.id}>
                    <td>{new Date(w.created_at).toLocaleString()}</td>
                    <td><b>{w.coin}</b></td>
                    <td>{w.network}</td>
                    <td className="mono" style={{ fontSize: '11px' }}>{w.address}</td>
                    <td className="mono">{parseFloat(w.amount).toFixed(4)}</td>
                    <td><span className={`status-badge ${w.status.toLowerCase()}`}>{w.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="modal-backdrop">
          <div className="wallet-modal">
            <div className="modal-header">
              <h3>Deposit {selectedCoin}</h3>
              <button className="close-btn" onClick={() => setShowDepositModal(false)}>✕</button>
            </div>
            <form onSubmit={handleDepositSubmit} className="modal-body">
              <div className="modal-field">
                <label>Select Deposit Destination Network</label>
                <select
                  value={depNetwork}
                  onChange={(e) => {
                    const found = depositWallets.find(w => w.network === e.target.value);
                    setDepNetwork(e.target.value);
                    if (found) setDepAddress(found.address);
                  }}
                >
                  {depositWallets.map(w => (
                    <option key={w.id} value={w.network}>{w.symbol} - {w.network}</option>
                  ))}
                </select>
              </div>

              <div className="modal-field">
                <label>Deposit Address (Send exact funds here)</label>
                <input type="text" readOnly value={depAddress || 'TX9aB47zL9mN28qR75vP31xK04wE86yU21'} />
              </div>

              <div className="modal-field">
                <label>Amount Transferred</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  placeholder="0.00"
                  value={depAmount}
                  onChange={(e) => setDepAmount(e.target.value)}
                />
              </div>

              <div className="modal-field">
                <label>Transaction Hash / TXID</label>
                <input
                  type="text"
                  required
                  placeholder="Enter 0x... transaction hash"
                  value={depTxHash}
                  onChange={(e) => setDepTxHash(e.target.value)}
                />
              </div>

              <button type="submit" className="submit-modal-btn">Confirm Deposit Submission</button>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-backdrop">
          <div className="wallet-modal">
            <div className="modal-header">
              <h3>Withdraw {selectedCoin}</h3>
              <button className="close-btn" onClick={() => setShowWithdrawModal(false)}>✕</button>
            </div>
            <form onSubmit={handleWithdrawSubmit} className="modal-body">
              <div className="modal-field">
                <label>Recipient Address</label>
                <input
                  type="text"
                  required
                  placeholder="Paste destination address"
                  value={wdAddress}
                  onChange={(e) => setWdAddress(e.target.value)}
                />
              </div>

              <div className="modal-field">
                <label>Network</label>
                <input
                  type="text"
                  value={wdNetwork}
                  onChange={(e) => setWdNetwork(e.target.value)}
                />
              </div>

              <div className="modal-field">
                <label>Withdrawal Amount</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  placeholder="0.00"
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                />
              </div>

              <button type="submit" className="submit-modal-btn">Submit Withdrawal Request</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
