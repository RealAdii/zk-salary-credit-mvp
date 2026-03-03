const CREDIT_MULTIPLIER_BPS = 5000 // 50% of monthly salary
const MAX_LIMIT_USDC = 5000
const MIN_LIMIT_USDC = 100
const INR_PER_USDC = 83

const SALARY_KEYS = [
  'salary',
  'monthlySalary',
  'monthly_salary',
  'income',
  'monthlyIncome',
  'monthly_income',
  'ctc',
  'annualSalary',
  'annual_salary',
  'yearlySalary',
  'yearly_salary',
  'lpa',
]

function parseNumberish(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function flattenWithPath(input, prefix = '', output = []) {
  if (input == null) return output

  if (typeof input !== 'object') {
    output.push({ path: prefix || 'root', value: input })
    return output
  }

  for (const [key, value] of Object.entries(input)) {
    const nextPath = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenWithPath(value, nextPath, output)
      continue
    }
    output.push({ path: nextPath, value })
  }

  return output
}

function convertToMonthly(path, rawValue, numericValue) {
  const pathLower = String(path || '').toLowerCase()
  const valueLower = String(rawValue || '').toLowerCase()

  // Handle "36 LPA", "12 lakh per annum", etc.
  if (
    valueLower.includes('lpa') ||
    valueLower.includes('lakh') ||
    pathLower.includes('lpa')
  ) {
    return numericValue * 100_000 / 12
  }

  // Explicit annual signals.
  if (
    pathLower.includes('annual') ||
    pathLower.includes('yearly') ||
    pathLower.includes('annum') ||
    valueLower.includes('per annum') ||
    valueLower.includes('/year')
  ) {
    return numericValue / 12
  }

  // "ctc" is usually annual in India payroll language.
  if (pathLower.includes('ctc')) {
    return numericValue / 12
  }

  return numericValue
}

export function extractCompensation(proofResult) {
  if (!proofResult || typeof proofResult !== 'object') {
    return { monthlySalary: null, sourcePath: null, detectedRaw: null }
  }

  const flattened = flattenWithPath(proofResult)

  // First pass: prioritize known salary keys anywhere in nested object.
  for (const key of SALARY_KEYS) {
    const match = flattened.find(({ path }) =>
      path.toLowerCase().endsWith(key.toLowerCase()),
    )
    if (!match) continue

    const parsed = parseNumberish(match.value)
    if (!parsed || parsed <= 0) continue

    return {
      monthlySalary: convertToMonthly(match.path, match.value, parsed),
      sourcePath: match.path,
      detectedRaw: String(match.value),
    }
  }

  // Fallback: locate any field that looks salary/income related.
  for (const field of flattened) {
    const pathLower = field.path.toLowerCase()
    if (
      !pathLower.includes('salary') &&
      !pathLower.includes('income') &&
      !pathLower.includes('ctc') &&
      !pathLower.includes('compensation')
    ) {
      continue
    }

    const parsed = parseNumberish(field.value)
    if (!parsed || parsed <= 0) continue

    return {
      monthlySalary: convertToMonthly(field.path, field.value, parsed),
      sourcePath: field.path,
      detectedRaw: String(field.value),
    }
  }

  return { monthlySalary: null, sourcePath: null, detectedRaw: null }
}

export function computeCreditLine(monthlySalary, compensation = {}) {
  if (!monthlySalary || monthlySalary <= 0) {
    return { approved: false, reason: 'Could not infer salary from proof payload.' }
  }

  const monthlySalaryInr = monthlySalary
  const monthlySalaryUsdc = monthlySalaryInr / INR_PER_USDC
  const rawLimit = (monthlySalaryUsdc * CREDIT_MULTIPLIER_BPS) / 10_000
  const capped = Math.min(rawLimit, MAX_LIMIT_USDC)
  const rounded = Math.floor(capped * 100) / 100

  if (rounded < MIN_LIMIT_USDC) {
    return {
      approved: false,
      reason: `Computed limit (${rounded} USDC) is below minimum (${MIN_LIMIT_USDC} USDC).`,
    }
  }

  return {
    approved: true,
    monthlySalaryInr,
    monthlySalaryUsdc,
    salarySourcePath: compensation.sourcePath || 'unknown',
    detectedRawSalary: compensation.detectedRaw || null,
    creditLimit: rounded,
    aprBps: 1500,
    proofValidityDays: 30,
    fxInrPerUsdc: INR_PER_USDC,
  }
}

export function computeInterest(principal, aprBps, days) {
  if (principal <= 0 || aprBps <= 0 || days <= 0) return 0
  const yearly = principal * (aprBps / 10_000)
  return yearly * (days / 365)
}
