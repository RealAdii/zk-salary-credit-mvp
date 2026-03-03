const CREDIT_MULTIPLIER_BPS = 5000 // 50% of monthly salary
const MAX_LIMIT_USDC = 5000
const MIN_LIMIT_USDC = 100

const SALARY_KEYS = [
  'salary',
  'monthlySalary',
  'monthly_salary',
  'income',
  'monthlyIncome',
  'monthly_income',
  'ctc',
]

function parseNumberish(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export function extractMonthlySalaryUSD(proofResult) {
  if (!proofResult || typeof proofResult !== 'object') return null

  for (const key of SALARY_KEYS) {
    const parsed = parseNumberish(proofResult[key])
    if (parsed && parsed > 0) return parsed
  }

  for (const value of Object.values(proofResult)) {
    const parsed = parseNumberish(value)
    if (parsed && parsed >= 500) return parsed
  }

  return null
}

export function computeCreditLine(monthlySalary) {
  if (!monthlySalary || monthlySalary <= 0) {
    return { approved: false, reason: 'Could not infer salary from proof payload.' }
  }

  const rawLimit = (monthlySalary * CREDIT_MULTIPLIER_BPS) / 10_000
  const capped = Math.min(rawLimit, MAX_LIMIT_USDC)
  const rounded = Math.floor(capped)

  if (rounded < MIN_LIMIT_USDC) {
    return {
      approved: false,
      reason: `Computed limit (${rounded} USDC) is below minimum (${MIN_LIMIT_USDC} USDC).`,
    }
  }

  return {
    approved: true,
    monthlySalary,
    creditLimit: rounded,
    aprBps: 1500,
    proofValidityDays: 30,
  }
}

export function computeInterest(principal, aprBps, days) {
  if (principal <= 0 || aprBps <= 0 || days <= 0) return 0
  const yearly = principal * (aprBps / 10_000)
  return yearly * (days / 365)
}
