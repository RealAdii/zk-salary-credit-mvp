import { useCallback, useMemo, useState } from 'react'
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk'
import {
  connectCartridgeWallet,
  disconnectWallet,
  getWalletUsdcBalance,
} from './starkzapClient'
import {
  extractCompensation,
  computeCreditLine,
  computeInterest,
} from './loanEngine'

const APP_ID = import.meta.env.VITE_RECLAIM_APP_ID
const APP_SECRET = import.meta.env.VITE_RECLAIM_APP_SECRET
const PROVIDER_ID = import.meta.env.VITE_RECLAIM_PROVIDER_ID
const WITHDRAW_API = import.meta.env.VITE_WITHDRAW_API || '/api/withdraw'

function parseProof(proofs) {
  if (!proofs) return {}
  const proofList = Array.isArray(proofs) ? proofs : [proofs]
  const merged = {}

  for (const proof of proofList) {
    if (!proof) continue

    if (proof.extractedParameterValues) {
      const extracted = typeof proof.extractedParameterValues === 'string'
        ? JSON.parse(proof.extractedParameterValues)
        : proof.extractedParameterValues
      Object.assign(merged, extracted || {})
    }

    if (proof.claimData?.context) {
      const context =
        typeof proof.claimData.context === 'string'
          ? JSON.parse(proof.claimData.context)
          : proof.claimData.context
      Object.assign(merged, context?.extractedParameters || context || {})
    }

    if (proof.claimData?.parameters) {
      const params =
        typeof proof.claimData.parameters === 'string'
          ? JSON.parse(proof.claimData.parameters)
          : proof.claimData.parameters
      Object.assign(merged, params || {})
    }

    if (proof.publicData) {
      const publicData = typeof proof.publicData === 'string'
        ? JSON.parse(proof.publicData)
        : proof.publicData
      Object.assign(merged, publicData || {})
    }
  }

  return merged
}

export default function App() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [iframeUrl, setIframeUrl] = useState(null)
  const [proofResult, setProofResult] = useState(null)
  const [drawAmount, setDrawAmount] = useState('50')
  const [outstanding, setOutstanding] = useState(0)
  const [drawError, setDrawError] = useState(null)
  const [walletAddress, setWalletAddress] = useState('')
  const [walletUsdcBalance, setWalletUsdcBalance] = useState('0')
  const [walletBusy, setWalletBusy] = useState(false)
  const [onchainTxHash, setOnchainTxHash] = useState('')

  const compensation = useMemo(() => extractCompensation(proofResult), [proofResult])

  const creditDecision = useMemo(() => {
    return computeCreditLine(compensation.monthlySalary, compensation)
  }, [compensation])

  const remaining = creditDecision.approved
    ? Math.max(0, creditDecision.creditLimit - outstanding)
    : 0
  const projected30DayInterest = computeInterest(
    outstanding,
    creditDecision.aprBps || 0,
    30,
  )

  const handleVerify = useCallback(async () => {
    try {
      if (!APP_ID || !APP_SECRET || !PROVIDER_ID) {
        throw new Error('Missing Reclaim env vars. Check .env values.')
      }

      setStatus('loading')
      setError(null)
      setProofResult(null)
      setOutstanding(0)

      const reclaimRequest = await ReclaimProofRequest.init(
        APP_ID,
        APP_SECRET,
        PROVIDER_ID,
        {
          useAppClip: false,
          customSharePageUrl: 'https://portal.reclaimprotocol.org/popcorn',
        },
      )

      await reclaimRequest.startSession({
        onSuccess: (proofs) => {
          setProofResult(parseProof(proofs))
          setStatus('success')
          setIframeUrl(null)
        },
        onError: (sessionError) => {
          setError(sessionError?.message || String(sessionError))
          setStatus('error')
          setIframeUrl(null)
        },
      })

      const url = await reclaimRequest.getRequestUrl()
      setIframeUrl(url)
      setStatus('verifying')
    } catch (initError) {
      setError(initError?.message || String(initError))
      setStatus('error')
    }
  }, [])

  async function handleOnchainWithdraw() {
    const parsed = Number.parseFloat(drawAmount)
    setDrawError(null)
    setOnchainTxHash('')

    if (!creditDecision.approved) return
    if (!walletAddress) {
      setDrawError('Connect a Starknet wallet first.')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDrawError('Enter a valid withdrawal amount.')
      return
    }
    if (parsed > remaining) {
      setDrawError('Withdrawal amount exceeds available credit.')
      return
    }

    try {
      setWalletBusy(true)
      const response = await fetch(WITHDRAW_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: walletAddress,
          amount: parsed.toString(),
          proof: proofResult,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Treasury transfer failed')
      }
      setOnchainTxHash(data.txHash || '')
      setOutstanding((value) => value + parsed)
      const refreshed = await getWalletUsdcBalance().catch(() => null)
      if (refreshed) setWalletUsdcBalance(refreshed)
    } catch (error) {
      setDrawError(error?.message || 'On-chain withdraw failed')
    } finally {
      setWalletBusy(false)
    }
  }

  function handleRepay() {
    setOutstanding(0)
    setDrawError(null)
    setOnchainTxHash('')
  }

  function resetFlow() {
    setStatus('idle')
    setError(null)
    setProofResult(null)
    setOutstanding(0)
    setDrawAmount('50')
    setDrawError(null)
    setOnchainTxHash('')
  }

  const formatINR = (value) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
  const formatUSDC = (value) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value || 0)
  const utilizationPct = creditDecision.approved && creditDecision.creditLimit > 0
    ? (outstanding / creditDecision.creditLimit) * 100
    : 0

  const primaryCta = status === 'loading' || status === 'verifying'
    ? 'Verifying...'
    : walletBusy
      ? 'Submitting...'
      : status === 'success' && creditDecision.approved
        ? 'Withdraw Onchain'
      : 'Get a Quote'

  const payrollProviders = [
    {
      id: 'razorpay',
      label: 'Razorpay Payroll',
      logo: 'https://logo.clearbit.com/razorpay.com',
      fallback: 'R',
      active: true,
    },
    {
      id: 'deel',
      label: 'Deel',
      logo: 'https://logo.clearbit.com/deel.com',
      fallback: 'D',
      active: false,
    },
    {
      id: 'rippling',
      label: 'Rippling',
      logo: 'https://logo.clearbit.com/rippling.com',
      fallback: 'Ri',
      active: false,
    },
    {
      id: 'workday',
      label: 'Workday',
      logo: 'https://logo.clearbit.com/workday.com',
      fallback: 'W',
      active: false,
    },
  ]

  function handlePrimaryAction() {
    if (status === 'loading' || status === 'verifying' || walletBusy) return
    if (status === 'success' && creditDecision.approved) {
      handleOnchainWithdraw()
      return
    }
    handleVerify()
  }

  async function handleConnectWallet() {
    try {
      setDrawError(null)
      setWalletBusy(true)

      if (walletAddress) {
        await disconnectWallet()
        setWalletAddress('')
        setWalletUsdcBalance('0')
        setWalletBusy(false)
        return
      }

      const wallet = await connectCartridgeWallet()
      setWalletAddress(wallet.address.toString())
      const bal = await getWalletUsdcBalance().catch(() => '0')
      setWalletUsdcBalance(bal)
    } catch (error) {
      setDrawError(error?.message || 'Wallet connection failed')
    } finally {
      setWalletBusy(false)
    }
  }

  const [creditOpen, setCreditOpen] = useState(false)

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">SalaryLine</div>
        <button className="walletBtn" onClick={handleConnectWallet}>
          {walletAddress
            ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
            : 'Connect Wallet'}
        </button>
      </header>

      <div className="content">
        <section className="statsStrip">
          <article>
            <span className="statLabel">Implied APY</span>
            <strong>{((creditDecision.aprBps || 0) / 100).toFixed(2)}%</strong>
          </article>
          <article>
            <span className="statLabel">Cash</span>
            <strong>{formatUSDC(remaining)}/{formatUSDC(creditDecision.creditLimit || 0)}</strong>
          </article>
          <article>
            <span className="statLabel">Outstanding</span>
            <strong>{formatUSDC(outstanding)} USDC</strong>
          </article>
        </section>

        <section className="moneyCard">
          <div className="moneyHead">
            <p>[ACCESS CREDIT LINE]</p>
            <div className="tabGroup">
              <span className="activeTab">Draw</span>
              <span>Pay</span>
            </div>
          </div>

          <div className="quoteValue">${formatUSDC(creditDecision.creditLimit || 0)}</div>
          <div className="maxDraw">MAX DRAW {formatUSDC(remaining)} USDC</div>

          <div className="inputRow">
            <input
              value={drawAmount}
              onChange={(event) => setDrawAmount(event.target.value)}
              placeholder="Amount in USDC"
            />
            <button className="repayBtn" onClick={handleRepay}>Repay</button>
          </div>

          <button
            className="primaryBtn"
            onClick={handlePrimaryAction}
            disabled={status === 'loading' || status === 'verifying' || walletBusy}
          >
            {primaryCta}
          </button>

          {drawError && <p className="error">{drawError}</p>}
          {error && <p className="error">Error: {error}</p>}

          <div className="summaryRows">
            <p><span>Balance</span><strong>{formatUSDC(outstanding)} USDC</strong></p>
            <p><span>Utilization</span><strong>{utilizationPct.toFixed(1)}%</strong></p>
            <p><span>Monthly Salary</span><strong>{formatINR(creditDecision.monthlySalaryInr)}</strong></p>
            <p><span>Salary (USDC)</span><strong>{formatUSDC(creditDecision.monthlySalaryUsdc)} USDC</strong></p>
            <p><span>30d Interest</span><strong>{formatUSDC(projected30DayInterest)} USDC</strong></p>
            <p><span>Wallet</span><strong>{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : 'Not connected'}</strong></p>
            {walletAddress && <p><span>Wallet USDC</span><strong>{walletUsdcBalance}</strong></p>}
          </div>

          {onchainTxHash && (
            <p className="txHash">
              Tx:{' '}
              <a href={`https://sepolia.voyager.online/tx/${onchainTxHash}`} target="_blank" rel="noreferrer">
                {onchainTxHash.slice(0, 12)}...{onchainTxHash.slice(-8)}
              </a>
            </p>
          )}
        </section>

        <section className="creditInfoCard">
          <button className="creditToggle" onClick={() => setCreditOpen((v) => !v)}>
            <span>Credit Info</span>
            <span className={`arrow ${creditOpen ? 'open' : ''}`}>&#9660;</span>
          </button>

          {creditOpen && (
            <div className="creditBody">
              <div className="creditSection">
                <div className="creditSectionLabel">Credit Score</div>
                <div className="creditRow">
                  <span>Score</span>
                  <strong>{status === 'success' && creditDecision.approved ? '720 / 1000' : '0 / 1000'}</strong>
                </div>
              </div>

              <div className="creditSection">
                <div className="creditSectionLabel">Payroll Providers</div>
                {payrollProviders.map((provider) => (
                  <div key={provider.id} className="providerRow">
                    <div className="providerIdentity">
                      <span className="providerLogo">
                        <img
                          src={provider.logo}
                          alt={`${provider.label} logo`}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                            const fallback = event.currentTarget.nextElementSibling
                            if (fallback) fallback.style.display = 'grid'
                          }}
                        />
                        <span className="fallbackLogo">{provider.fallback}</span>
                      </span>
                      <div className="providerText">
                        <span>{provider.label}</span>
                        <small>{provider.active ? 'Ready now' : 'Integration pending'}</small>
                      </div>
                    </div>
                    {provider.active ? (
                      <button className="connectBtn" onClick={handleConnectWallet}>
                        {walletAddress ? 'Connected' : 'Connect'}
                      </button>
                    ) : (
                      <button className="comingBtn" disabled>Coming Soon</button>
                    )}
                  </div>
                ))}
              </div>

              <details className="proofDetails">
                <summary>Show Raw Proof</summary>
                <pre>{JSON.stringify(proofResult, null, 2)}</pre>
              </details>

              <button
                className="connectBtn"
                style={{ marginTop: '0.75rem', width: '100%', textAlign: 'center' }}
                onClick={resetFlow}
              >
                Reset
              </button>
            </div>
          )}
        </section>
      </div>

      {iframeUrl && (
        <div className="iframeWrap">
          <button
            className="closeBtn"
            onClick={() => {
              setIframeUrl(null)
              if (status === 'verifying') setStatus('idle')
            }}
          >
            Close
          </button>
          <iframe src={iframeUrl} title="Reclaim Verification" allow="clipboard-read; clipboard-write" />
        </div>
      )}
    </main>
  )
}
