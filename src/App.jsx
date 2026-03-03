import { useCallback, useMemo, useState } from 'react'
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk'
import {
  computeCreditLine,
  computeInterest,
  extractMonthlySalaryUSD,
} from './loanEngine'

const APP_ID = import.meta.env.VITE_RECLAIM_APP_ID
const APP_SECRET = import.meta.env.VITE_RECLAIM_APP_SECRET
const PROVIDER_ID = import.meta.env.VITE_RECLAIM_PROVIDER_ID

function parseProof(proofs) {
  if (!proofs) return {}
  const proof = Array.isArray(proofs) ? proofs[0] : proofs
  if (!proof) return {}

  if (proof.extractedParameterValues) {
    return typeof proof.extractedParameterValues === 'string'
      ? JSON.parse(proof.extractedParameterValues)
      : proof.extractedParameterValues
  }

  if (proof.claimData?.context) {
    const context =
      typeof proof.claimData.context === 'string'
        ? JSON.parse(proof.claimData.context)
        : proof.claimData.context
    return context.extractedParameters || context
  }

  if (proof.publicData) {
    return typeof proof.publicData === 'string'
      ? JSON.parse(proof.publicData)
      : proof.publicData
  }

  return typeof proof === 'object' ? proof : {}
}

export default function App() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [iframeUrl, setIframeUrl] = useState(null)
  const [proofResult, setProofResult] = useState(null)
  const [drawAmount, setDrawAmount] = useState('100')
  const [outstanding, setOutstanding] = useState(0)

  const creditDecision = useMemo(() => {
    const salary = extractMonthlySalaryUSD(proofResult)
    return computeCreditLine(salary)
  }, [proofResult])

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

  return (
    <main className="page">
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
            Verify salary via Reclaim, derive a simple credit limit, then simulate draw and repay.
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

      {status === 'success' && (
        <section className="panel resultsPanel">
          <section className="card">
            <h2>Credit Decision</h2>
            {!creditDecision.approved && (
              <p className="error">Declined: {creditDecision.reason}</p>
            )}

            {creditDecision.approved && (
              <>
                <div className="metrics">
                  <Metric label="Monthly Salary (parsed)" value={`$${creditDecision.monthlySalary.toFixed(2)}`} />
                  <Metric label="Credit Limit" value={`${creditDecision.creditLimit} USDC`} />
                  <Metric label="APR" value={`${(creditDecision.aprBps / 100).toFixed(2)}%`} />
                  <Metric label="Proof Validity" value={`${creditDecision.proofValidityDays} days`} />
                </div>

                <div className="actions">
                  <input
                    value={drawAmount}
                    onChange={(event) => setDrawAmount(event.target.value)}
                    placeholder="Draw amount"
                  />
                  <button onClick={handleDraw}>Draw</button>
                  <button onClick={handleRepay} className="secondary">Repay</button>
                </div>

                <div className="summary">
                  <p>Outstanding: {outstanding.toFixed(2)} USDC</p>
                  <p>Remaining: {remaining.toFixed(2)} USDC</p>
                  <p>Projected 30d Interest: {projected30DayInterest.toFixed(2)} USDC</p>
                </div>
              </>
            )}
          </section>

          {proofResult && (
            <section className="card">
              <h2>Proof Payload</h2>
              <pre>{JSON.stringify(proofResult, null, 2)}</pre>
            </section>
          )}
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
