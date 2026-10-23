import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import CryptoIcon from '../components/CryptoIcon';
import Icon from '../components/Icon';
import { QRCodeSVG } from 'qrcode.react';
import './Wallet.css';

function getNetworkSymbol(network, fallback = 'USDT') {
  const name = (network || '').toLowerCase();
  if (name.includes('tron') || name.includes('trc')) return 'TRX';
  if (name.includes('ethereum') || name.includes('erc')) return 'ETH';
  if (name.includes('bitcoin') || name.includes('btc')) return 'BTC';
  if (name.includes('solana') || name.includes('sol')) return 'SOL';
  if (name.includes('bnb') || name.includes('bep')) return 'BNB';
  return fallback;
}

export default function Wallet() {
  const { token } = useAuth();
  const [balances, setBalances] = useState([]);
  const [depositWallets, setDepositWallets] = useState([]);
  const [loadingDepositNetworks, setLoadingDepositNetworks] = useState(false);
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
  const [addressCopied, setAddressCopied] = useState(false);

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
    // Note: live prices not yet available in wallet view — values are approximate
    const free = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    if (b.asset === 'USDT') return sum + (free + locked);
    // Without a live price feed endpoint at wallet level, we omit non-USDT assets
    // from the total to avoid showing misleading stale-price valuations.
    return sum;
  }, 0);

  const selectedDepositWallet = depositWallets.find(w => w.network === depNetwork && w.address === depAddress);
  const availableDepositWallets = depositWallets.filter(w => w.symbol === selectedCoin);
  const networkSymbol = getNetworkSymbol(depNetwork, selectedDepositWallet?.symbol || selectedCoin);

  const openDepositModal = async (coin) => {
    setSelectedCoin(coin);
    setDepNetwork('');
    setDepAddress('');
    setDepAmount('');
    setDepTxHash('');
    setAddressCopied(false);
    setShowDepositModal(true);
    setLoadingDepositNetworks(true);
    try {
      const response = await api.getDepositWallets(token);
      if (response.wallets) setDepositWallets(response.wallets);
    } catch (err) {
      console.error('Failed to refresh deposit networks:', err);
      showToast('error', 'Could not load deposit networks. Please try again.');
    } finally {
      setLoadingDepositNetworks(false);
    }
  };

  const copyDepositAddress = async () => {
    if (!depAddress) return;
    try {
      await navigator.clipboard.writeText(depAddress);
      setAddressCopied(true);
      window.setTimeout(() => setAddressCopied(false), 1800);
    } catch {
      showToast('error', 'Could not copy the address. Select and copy it manually.');
    }
  };

  const downloadDepositReceipt = () => {
    const qrNode = document.querySelector('.deposit-qr');
    if (!qrNode || !depAddress) return;

    const qrSvg = qrNode.cloneNode(true);
    qrSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    qrSvg.setAttribute('width', '420');
    qrSvg.setAttribute('height', '420');
    const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(qrSvg)], { type: 'image/svg+xml;charset=utf-8' }));
    const qrImage = new Image();
    qrImage.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1120;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(svgUrl); return; }

      ctx.fillStyle = '#0b0e19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#171a2c';
      ctx.beginPath();
      ctx.roundRect(64, 64, 772, 992, 30);
      ctx.fill();
      ctx.strokeStyle = 'rgba(194, 169, 255, .32)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#d9c8ff';
      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillText('STAKEUP  /  DEPOSIT RECEIPT', 108, 132);
      ctx.fillStyle = '#f5f1ff';
      ctx.font = '600 34px Arial, sans-serif';
      ctx.fillText(`${selectedCoin} deposit address`, 108, 198);

      const qrSize = 420;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 236;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 18);
      ctx.fill();
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = '#a9adc4';
      ctx.font = '700 16px Arial, sans-serif';
      ctx.fillText('DESTINATION NETWORK', 108, 730);
      ctx.fillStyle = '#f5f1ff';
      ctx.font = '600 24px Arial, sans-serif';
      ctx.fillText(`${depNetwork}  ·  ${networkSymbol}`, 108, 770);
      ctx.fillStyle = '#a9adc4';
      ctx.font = '700 16px Arial, sans-serif';
      ctx.fillText('DEPOSIT ADDRESS', 108, 832);
      ctx.fillStyle = '#e9e5f3';
      ctx.font = '18px monospace';
      const addressLines = depAddress.match(/.{1,58}/g) || [depAddress];
      addressLines.slice(0, 3).forEach((line, index) => ctx.fillText(line, 108, 870 + index * 27));
      ctx.fillStyle = '#e5b76e';
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText(`Send only ${selectedCoin} using ${depNetwork}.`, 108, 990);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl);
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `stakeup-${selectedCoin}-${depNetwork.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-deposit.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      }, 'image/png');
    };
    qrImage.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      showToast('error', 'Could not generate the receipt image.');
    };
    qrImage.src = svgUrl;
  };

  return (
    <div className="wallet-page">
      {toast && <div className={`desk-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="wallet-container">
        {/* Wallet Overview Summary Banner */}
        <div className="wallet-summary-card">
          <div className="summary-info">
            <span className="summary-title">USDT Balance</span>
            <div className="summary-value">
              ${totalEstUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="denom">USDT</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px', display: 'block' }}>
              Non-USDT asset values shown in individual rows below
            </span>
          </div>
          <div className="summary-actions">
            <button
              className="action-btn deposit"
              onClick={() => openDepositModal('USDT')}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CryptoIcon symbol={b.asset} size={22} />
                      <span className="asset-code">{b.asset}</span>
                    </div>
                  </td>
                  <td className="mono">{parseFloat(b.free).toFixed(4)}</td>
                  <td className="mono">{parseFloat(b.locked).toFixed(4)}</td>
                  <td className="mono">{(parseFloat(b.free) + parseFloat(b.locked)).toFixed(4)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="table-act-btn" onClick={() => openDepositModal(b.asset)}>Deposit</button>
                    <button className="table-act-btn" onClick={() => { setSelectedCoin(b.asset); setShowWithdrawModal(true); }}>Withdraw</button>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CryptoIcon symbol={selectedCoin} size={26} />
                <h3>Deposit {selectedCoin}</h3>
              </div>
              <button className="close-btn" onClick={() => setShowDepositModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={handleDepositSubmit} className="modal-body">
              <div className="modal-field">
                <label>Choose destination network</label>
                {loadingDepositNetworks ? (
                  <div className="deposit-empty-state">Loading available networks…</div>
                ) : availableDepositWallets.length > 0 ? (
                  <div className="deposit-network-list">
                    {availableDepositWallets.map(w => {
                      const isSelected = w.network === depNetwork && w.address === depAddress;
                      const symbol = getNetworkSymbol(w.network, w.symbol);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          className={`deposit-network-option ${isSelected ? 'selected' : ''}`}
                          aria-pressed={isSelected}
                          onClick={() => {
                            setDepNetwork(w.network);
                            setDepAddress(w.address);
                            setAddressCopied(false);
                          }}
                        >
                          <span className="deposit-network-icons">
                            <CryptoIcon symbol={w.symbol} size={28} />
                            <span className="network-symbol"><CryptoIcon symbol={symbol} size={15} /></span>
                          </span>
                          <span className="deposit-network-copy">
                            <b>{w.network}</b>
                            <span>{w.symbol} · {symbol} network</span>
                          </span>
                          <span className="network-selected-mark" aria-hidden="true">✓</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="deposit-empty-state">No deposit networks are available right now.</div>
                )}
              </div>

              {!depAddress && (
                <div className="deposit-select-prompt">
                  <span className="deposit-select-step">1</span>
                  <span><b>Select a network first</b><small>Your deposit address and QR code will appear after you choose a destination.</small></span>
                </div>
              )}

              {depAddress && <section className="deposit-receipt" aria-label="Deposit address receipt">
                <div className="receipt-head">
                  <div className="receipt-brand"><span className="receipt-brand-mark">S</span><span>STAKEUP <b>DEPOSIT</b></span></div>
                  <div className="receipt-head-actions">
                    <span className="receipt-live"><i /> ADDRESS READY</span>
                    <button type="button" className="download-receipt-btn" onClick={downloadDepositReceipt} disabled={!depAddress}>
                      <Icon name="download" size={13} /> Save image
                    </button>
                  </div>
                </div>
                <div className="receipt-main">
                  {depAddress ? (
                    <QRCodeSVG
                      value={depAddress}
                      size={172}
                      level="M"
                      includeMargin
                      bgColor="#ffffff"
                      fgColor="#111323"
                      className="deposit-qr"
                      title={`${selectedCoin} deposit address on ${depNetwork}`}
                    />
                  ) : (
                    <div className="deposit-qr-placeholder">QR unavailable</div>
                  )}
                  <div className="receipt-details">
                    <span className="receipt-label">Deposit asset</span>
                    <div className="receipt-asset"><CryptoIcon symbol={selectedCoin} size={24} /><b>{selectedCoin}</b></div>
                    <span className="receipt-label">Destination network</span>
                    <div className="receipt-network"><CryptoIcon symbol={networkSymbol} size={20} /><b>{depNetwork || 'Select a network'}</b></div>
                  </div>
                </div>
                <div className="receipt-rule"><span /><span /><span /></div>
                <div className="receipt-address-head"><span className="receipt-label">Deposit address</span><span className="receipt-network-mark"><CryptoIcon symbol={networkSymbol} size={15} /> {networkSymbol}</span></div>
                <div className="receipt-address-row">
                  <code>{depAddress || 'No deposit address configured'}</code>
                  <button type="button" className={`copy-address-btn ${addressCopied ? 'copied' : ''}`} onClick={copyDepositAddress} disabled={!depAddress} aria-label="Copy deposit address">
                    <Icon name={addressCopied ? 'check' : 'copy'} size={16} />
                    <span>{addressCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="receipt-warning">Only send {selectedCoin} using this network. Sending another asset or network may result in permanent loss.</p>
              </section>}

              {depAddress && <>
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
                    placeholder="Enter transaction hash"
                    value={depTxHash}
                    onChange={(e) => setDepTxHash(e.target.value)}
                  />
                </div>

                <button type="submit" className="submit-modal-btn">Confirm Deposit Submission</button>
              </>}
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-backdrop">
          <div className="wallet-modal">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CryptoIcon symbol={selectedCoin} size={26} />
                <h3>Withdraw {selectedCoin}</h3>
              </div>
              <button className="close-btn" onClick={() => setShowWithdrawModal(false)}>
                <Icon name="close" size={18} />
              </button>
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
