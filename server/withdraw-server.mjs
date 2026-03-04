import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account, CallData, RpcProvider, Signer, uint256, validateAndParseAddress } from 'starknet'

// Load server/.env if present
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

const PORT = Number(process.env.PORT || 8787)
const TREASURY_PK = process.env.TREASURY_PRIVATE_KEY
const TREASURY_ADDRESS = process.env.TREASURY_ACCOUNT_ADDRESS
const STARKNET_RPC_URL = process.env.STARKNET_RPC_URL
const USDC_ADDRESS =
  process.env.USDC_ADDRESS ||
  '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343'

let treasuryAccountPromise = null

async function getTreasuryAccount() {
  if (!TREASURY_PK) throw new Error('Missing TREASURY_PRIVATE_KEY')
  if (!TREASURY_ADDRESS) throw new Error('Missing TREASURY_ACCOUNT_ADDRESS')
  if (!STARKNET_RPC_URL) throw new Error('Missing STARKNET_RPC_URL')

  if (!treasuryAccountPromise) {
    const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL })
    const signer = new Signer(TREASURY_PK)
    treasuryAccountPromise = Promise.resolve(
      new Account({ provider, address: TREASURY_ADDRESS, signer }),
    )
  }
  return treasuryAccountPromise
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    })
    res.end()
    return
  }

  if (req.url === '/api/health' && req.method === 'GET') {
    json(res, 200, { ok: true })
    return
  }

  if (req.url === '/api/withdraw' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const recipient = body?.recipient
      const amount = String(body?.amount || '')

      if (!recipient || !amount) {
        json(res, 400, { error: 'recipient and amount are required' })
        return
      }

      const to = validateAndParseAddress(recipient)
      const parsed = Number(amount)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        json(res, 400, { error: 'amount must be a positive number' })
        return
      }
      const rawAmount = BigInt(Math.floor(parsed * 1_000_000))
      const account = await getTreasuryAccount()
      const calldata = CallData.compile({
        recipient: to,
        amount: uint256.bnToUint256(rawAmount),
      })
      const tx = await account.execute([
        { contractAddress: USDC_ADDRESS, entrypoint: 'transfer', calldata },
      ])
      await account.waitForTransaction(tx.transaction_hash)
      json(res, 200, { ok: true, txHash: tx.transaction_hash })
      return
    } catch (error) {
      json(res, 500, { error: error?.message || 'withdraw failed' })
      return
    }
  }

  json(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`[withdraw-server] listening on http://localhost:${PORT}`)
})
