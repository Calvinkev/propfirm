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
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState('USDT');

  // Form states
  const [depNetwork, setDepNetwork] = useState('');
  const [depAddress, setDepAddress] = useState('');
  const [depTxHash, setDepTxHash] = useState('');
  const [depAmount, setDepAmount] = useState('');
  const [depCurrency, setDepCurrency] = useState('USDT');
  const [addressCopied, setAddressCopied] = useState(false);

  const [wdAddress, setWdAddress] = useState('');
  const [wdNetwork, setWdNetwork] = useState('TRC20');
  const [wdAmount, setWdAmount] = useState('');
  const [wdAccountType, setWdAccountType] = useState('EXCHANGE');
  const [wdCurrency, setWdCurrency] = useState('USDT');

  // Transfer form state
  const [transferFromAccount, setTransferFromAccount] = useState('EXCHANGE');
  const [transferToAccount, setTransferToAccount] = useState('TRADE');
  const [transferCurrency, setTransferCurrency] = useState('USDT');
  const [transferAmount, setTransferAmount] = useState('');

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
        coin: wdCurrency,
        network: wdNetwork,
        address: wdAddress,
        amount: wdAmount,
        accountType: wdAccountType
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

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.transferBetweenAccounts(token, {
        fromAccount: transferFromAccount,
        toAccount: transferToAccount,
        currency: transferCurrency,
        amount: transferAmount
      });
      if (res.error) {
        showToast('error', res.error);
      } else {
        showToast('success', res.message || 'Transfer successful');
        setShowTransferModal(false);
        setTransferAmount('');
        loadData();
      }
    } catch (err) {
      showToast('error', 'Failed to transfer funds');
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
            <button
              className="action-btn transfer"
              onClick={() => setShowTransferModal(true)}
            >
              Transfer
            </button>
          </div>
        </div>

        {/* Mobile Finance Actions */}
        <div className="mobile-finance-actions">
          <button className="finance-action-btn" onClick={() => openDepositModal('USDT')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Deposit</span>
          </button>
          <button className="finance-action-btn" onClick={() => { setSelectedCoin('USDT'); setShowWithdrawModal(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
            </svg>
            <span>Withdraw</span>
          </button>
          <button className="finance-action-btn" onClick={() => setShowTransferModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span>Transfer</span>
          </button>
          <button className="finance-action-btn" onClick={() => window.location.href = '/convert'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4" />
            </svg>
            <span>Swap</span>
          </button>
        </div>

        {/* My Account Section */}
        <div className="my-account-section">
          <h3 className="account-section-title">My Account</h3>
          <div className="account-cards-grid">
            <div className="account-card">
              <div className="account-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <div className="account-card-info">
                <span className="account-card-title">Exchange</span>
                <span className="account-card-desc">Spot trading wallet</span>
              </div>
            </div>
            <div className="account-card">
              <div className="account-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div className="account-card-info">
                <span className="account-card-title">Trade</span>
                <span className="account-card-desc">Margin trading account</span>
              </div>
            </div>
            <div className="account-card">
              <div className="account-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="account-card-info">
                <span className="account-card-title">Perpetual</span>
                <span className="account-card-desc">Futures trading wallet</span>
              </div>
            </div>
            <div className="account-card">
              <div className="account-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <div className="account-card-info">
                <span className="account-card-title">Finance</span>
                <span className="account-card-desc">Earn & savings wallet</span>
              </div>
            </div>
          </div>
        </div>

        {/* Spot Assets Balance Table */}
        <div className="wallet-card">
          <h2>Spot Assets</h2>
          <div className="wallet-table-wrapper">
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
        </div>

        {/* Deposit History */}
        <div className="wallet-card">
          <h2>Deposit History</h2>
          <div className="wallet-table-wrapper">
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
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(d.created_at).toLocaleString()}</td>
                    <td><b>{d.coin}</b></td>
                    <td>{d.network}</td>
                    <td className="mono">{parseFloat(d.amount).toFixed(4)}</td>
                    <td className="mono tx-hash-cell">{d.tx_hash.slice(0, 16)}…</td>
                    <td><span className={`status-badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Withdrawal History */}
        <div className="wallet-card">
          <h2>Withdrawal History</h2>
          <div className="wallet-table-wrapper">
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
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(w.created_at).toLocaleString()}</td>
                    <td><b>{w.coin}</b></td>
                    <td>{w.network}</td>
                    <td className="mono addr-cell">{w.address}</td>
                    <td className="mono">{parseFloat(w.amount).toFixed(4)}</td>
                    <td>
                      {w.status === 'Pending' ? (
                        <span className="wd-status-processing">
                          <span className="wd-spinner"/> Waiting for transaction to complete
                        </span>
                      ) : (
                        <span className={`status-badge ${w.status.toLowerCase()}`}>{w.status}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="modal-backdrop">
          <div className="wallet-modal">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CryptoIcon symbol={selectedCoin} size={26} />
                <h3>Deposit</h3>
              </div>
              <button className="close-btn" onClick={() => setShowDepositModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={handleDepositSubmit} className="modal-body">
              <div className="modal-field">
                <label>Select Currency</label>
                <select
                  value={depCurrency}
                  onChange={(e) => { setDepCurrency(e.target.value); setSelectedCoin(e.target.value); }}
                  required
                >
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="ETH">ETH</option>
                  <option value="BTC">BTC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                  <option value="BNB">BNB</option>
                  <option value="ADA">ADA</option>
                  <option value="DOGE">DOGE</option>
                  <option value="DOT">DOT</option>
                  <option value="MATIC">MATIC</option>
                  <option value="LTC">LTC</option>
                  <option value="AVAX">AVAX</option>
                  <option value="LINK">LINK</option>
                  <option value="UNI">UNI</option>
                  <option value="ATOM">ATOM</option>
                </select>
              </div>

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
                <div className="tips-section">
                  <h4>TIPS (TELEGRAM)</h4>
                  <ol>
                    <li>The above deposit address is the official payment address of the platform, please look for the official deposit address of the platform, and the loss of funds caused by incorrect charging shall be borne by yourself;</li>
                    <li>Please make sure that your computer and browser are safe to prevent information from being tampered with or leaked;</li>
                    <li>After you recharge the above address, you need to confirm the entire network node before it can be credited;</li>
                    <li>Please select the above-mentioned token system and currency type and transfer the corresponding amount for deposit. Please do not transfer any other Irrelevant assets, otherwise they will not be retrieved.</li>
                  </ol>
                </div>

                <button type="submit" className="submit-modal-btn">Confirm Deposit</button>
              </>}
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-backdrop">
          <div className="wallet-modal wallet-modal-withdraw" style={{ width: '200px', maxWidth: '200px', minWidth: '200px', padding: '12px' }}>
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
                <label>Account Type</label>
                <select
                  value={wdAccountType}
                  onChange={(e) => setWdAccountType(e.target.value)}
                  required
                >
                  <option value="EXCHANGE">Exchange</option>
                  <option value="TRADE">Trade</option>
                  <option value="PERPETUAL">Perpetual</option>
                  <option value="FINANCE">Finance</option>
                </select>
              </div>

              <div className="modal-field">
                <label>Select Currency</label>
                <select
                  value={wdCurrency}
                  onChange={(e) => setWdCurrency(e.target.value)}
                  required
                >
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="ETH">ETH</option>
                  <option value="BTC">BTC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
                  <option value="BNB">BNB</option>
                  <option value="ADA">ADA</option>
                  <option value="DOGE">DOGE</option>
                  <option value="DOT">DOT</option>
                  <option value="MATIC">MATIC</option>
                  <option value="LTC">LTC</option>
                  <option value="AVAX">AVAX</option>
                  <option value="LINK">LINK</option>
                  <option value="UNI">UNI</option>
                  <option value="ATOM">ATOM</option>
                </select>
              </div>

              <div className="modal-field">
                <label>Withdraw Network</label>
                <select
                  value={wdNetwork}
                  onChange={(e) => setWdNetwork(e.target.value)}
                  required
                >
                  <option value="ETH">Ethereum (ERC20)</option>
                  <option value="POLYGON">Polygon</option>
                  <option value="TRON">Tron (TRC20)</option>
                  <option value="BSC">BNB Chain (BEP20)</option>
                  <option value="SOLANA">Solana</option>
                  <option value="BITCOIN">Bitcoin</option>
                </select>
              </div>

              <div className="modal-field">
                <label>Withdraw Address</label>
                <input
                  type="text"
                  required
                  placeholder="Paste destination address"
                  value={wdAddress}
                  onChange={(e) => setWdAddress(e.target.value)}
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

              <div className="important-notice">
                <h4>Important notice</h4>
                <ol>
                  <li>In order to prevent arbitrage behavior, the transaction volume can be applied for withdrawal after reaching the limit.</li>
                  <li>The account will be received within 24 hours after submitting the withdrawal application. If the account is not received after the estimated time of withdrawal, please consult the online customer service.</li>
                  <li>After submitting the withdrawal application, the funds are in a frozen state because the withdrawal is in progress and the funds are temporarily under the custody of the system, which does not mean that you have lost the asset or the asset is abnormal.</li>
                </ol>
              </div>

              <button type="submit" className="submit-modal-btn">Submit Withdrawal Request</button>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="modal-backdrop">
          <div className="wallet-modal">
            <div className="modal-header">
              <h3>Transfer Between Accounts</h3>
              <button className="close-btn" onClick={() => setShowTransferModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={handleTransferSubmit} className="modal-body">
              <div className="modal-field">
                <label>From Account</label>
                <select
                  value={transferFromAccount}
                  onChange={(e) => setTransferFromAccount(e.target.value)}
                  required
                >
                  <option value="EXCHANGE">Exchange</option>
                  <option value="TRADE">Trade</option>
                  <option value="PERPETUAL">Perpetual</option>
                  <option value="FINANCE">Finance</option>
                </select>
              </div>

              <div className="modal-field">
                <label>To Account</label>
                <select
                  value={transferToAccount}
                  onChange={(e) => setTransferToAccount(e.target.value)}
                  required
                >
                  <option value="EXCHANGE">Exchange</option>
                  <option value="TRADE">Trade</option>
                  <option value="PERPETUAL">Perpetual</option>
                  <option value="FINANCE">Finance</option>
                </select>
              </div>

              <div className="modal-field">
                <label>Currency</label>
                <select
                  value={transferCurrency}
                  onChange={(e) => setTransferCurrency(e.target.value)}
                  required
                >
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                  <option value="ETH">ETH</option>
                  <option value="BTC">BTC</option>
                  <option value="XRP">XRP</option>
                  <option value="SOL">SOL</option>
<option value="BNB">BNB</option>
                  <option value="ADA">ADA</option>
                  <option value="DOGE">DOGE</option>
                  <option value="DOT">DOT</option>
                  <option value="MATIC">MATIC</option>
                  <option value="LTC">LTC</option>
                  <option value="AVAX">AVAX</option>
                  <option value="LINK">LINK</option>
                  <option value="UNI">UNI</option>
                  <option value="ATOM">ATOM</option>
                </select>
              </div>

              <div className="modal-field">
                <label>Amount</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                />
              </div>

              <button type="submit" className="submit-modal-btn">Transfer Funds</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
