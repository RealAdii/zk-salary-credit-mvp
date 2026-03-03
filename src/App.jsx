import { useCallback, useMemo, useState } from 'react'
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk'
import {
  extractCompensation,
  computeCreditLine,
  computeInterest,
} from './loanEngine'

const APP_ID = import.meta.env.VITE_RECLAIM_APP_ID
const APP_SECRET = import.meta.env.VITE_RECLAIM_APP_SECRET
const PROVIDER_ID = import.meta.env.VITE_RECLAIM_PROVIDER_ID

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

  function handleDraw() {
    const parsed = Number.parseFloat(drawAmount)
    if (!creditDecision.approved || !Number.isFinite(parsed) || parsed <= 0) return
    if (parsed > remaining) return
    setOutstanding((value) => value + parsed)
  }

  function handleRepay() {
    setOutstanding(0)
  }

  const formatINR = (value) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
  const formatUSDC = (value) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value || 0)

  return (
    <main className={`page ${status === 'success' ? 'successMode' : ''}`}>
      <header className="topbar">
        <div className="brand">SalaryLine</div>
        <nav>
          <span>Farm</span>
          <span>Supply</span>
          <span className="active">Pull</span>
          <span>Info</span>
        </nav>
        <button className="walletBtn">Connect Wallet</button>
      </header>

      <div className="liveBar">Credit Lines are Live. Spots Left: 2/85</div>
      <p className="demoNote">Demo note: “Connect Wallet” is a UI placeholder and does not connect a real wallet in this MVP.</p>

      {status !== 'success' && (
        <section className="heroWrap">
          <section className="panel panelHero">
            <div className="heroOrbs" aria-hidden="true">
              <span />
              <span />
            </div>
            <p className="eyebrow">Reclaim + Starknet MVP</p>
            <h1>Private Salary Proof to USDC Credit Line</h1>
            <div className="heroMeta">
              <span>Privacy Preserving</span>
              <span>USDC Credit Line</span>
              <span>Reclaim Proof</span>
            </div>
            <p className="subtitle">
              Verify salary via Reclaim, convert INR salary to USDC, then withdraw from your line.
            </p>

            <button
              className="primary"
              onClick={handleVerify}
              disabled={status === 'loading' || status === 'verifying'}
            >
              {status === 'loading' || status === 'verifying'
                ? 'Starting verification...'
                : 'Verify Salary Proof'}
            </button>

            {status === 'error' && <p className="error">Error: {error}</p>}
          </section>
        </section>
      )}

      {status === 'success' && (
        <section className="loanScreen">
          <section className="panel loanPanel">
            <h2>Withdraw From Credit Line</h2>
            {!creditDecision.approved && <p className="error">Declined: {creditDecision.reason}</p>}

            {creditDecision.approved && (
              <>
                <div className="metrics">
                  <Metric label="Monthly Salary (INR)" value={formatINR(creditDecision.monthlySalaryInr)} />
                  <Metric label="Monthly Salary (USDC est.)" value={`${formatUSDC(creditDecision.monthlySalaryUsdc)} USDC`} />
                  <Metric label="Credit Limit" value={`${formatUSDC(creditDecision.creditLimit)} USDC`} />
                  <Metric label="FX Used" value={`1 USDC = INR ${creditDecision.fxInrPerUsdc}`} />
                </div>

                <div className="actions">
                  <input
                    value={drawAmount}
                    onChange={(event) => setDrawAmount(event.target.value)}
                    placeholder="Enter withdrawal amount (USDC)"
                  />
                  <button onClick={handleDraw}>Withdraw</button>
                  <button onClick={handleRepay} className="secondary">Repay</button>
                </div>

                <div className="summary">
                  <p>Outstanding: {formatUSDC(outstanding)} USDC</p>
                  <p>Remaining: {formatUSDC(remaining)} USDC</p>
                  <p>Projected 30d Interest: {formatUSDC(projected30DayInterest)} USDC</p>
                  {creditDecision.detectedRawSalary && (
                    <p>Detected salary input: {creditDecision.detectedRawSalary}</p>
                  )}
                  {creditDecision.salarySourcePath && (
                    <p>Detected from field: {creditDecision.salarySourcePath}</p>
                  )}
                </div>

                <details className="proofDetails">
                  <summary>Show Raw Proof</summary>
                  <pre>{JSON.stringify(proofResult, null, 2)}</pre>
                </details>
              </>
            )}
          </section>
        </section>
      )}

      {iframeUrl && (
        <div className="iframeWrap">
          <button
            className="close"
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

function Metric({ label, value }) {
  return (
    <article className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}
