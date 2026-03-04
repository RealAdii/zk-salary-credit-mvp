import { Account, CallData, RpcProvider, Signer, uint256, validateAndParseAddress } from 'starknet'

const TREASURY_PK = process.env.TREASURY_PRIVATE_KEY
const TREASURY_ADDRESS = process.env.TREASURY_ACCOUNT_ADDRESS
const STARKNET_RPC_URL = process.env.STARKNET_RPC_URL
const USDC_ADDRESS =
  process.env.USDC_ADDRESS ||
  '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343'

let cachedAccount = null

function getTreasuryAccount() {
  if (!TREASURY_PK) throw new Error('Missing TREASURY_PRIVATE_KEY')
  if (!TREASURY_ADDRESS) throw new Error('Missing TREASURY_ACCOUNT_ADDRESS')
  if (!STARKNET_RPC_URL) throw new Error('Missing STARKNET_RPC_URL')

  if (!cachedAccount) {
    const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL })
    const signer = new Signer(TREASURY_PK)
    cachedAccount = new Account({ provider, address: TREASURY_ADDRESS, signer })
  }
  return cachedAccount
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { recipient, amount } = req.body || {}

    if (!recipient || !amount) {
      return res.status(400).json({ error: 'recipient and amount are required' })
    }

    const to = validateAndParseAddress(recipient)
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' })
    }

    const rawAmount = BigInt(Math.floor(parsed * 1_000_000))
    const account = getTreasuryAccount()
    const provider = account.provider || new RpcProvider({ nodeUrl: STARKNET_RPC_URL })

    const calldata = CallData.compile({
      recipient: to,
      amount: uint256.bnToUint256(rawAmount),
    })

    const tx = await account.execute([
      { contractAddress: USDC_ADDRESS, entrypoint: 'transfer', calldata },
    ])

    await provider.waitForTransaction(tx.transaction_hash)
    return res.status(200).json({ ok: true, txHash: tx.transaction_hash })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'withdraw failed' })
  }
}
