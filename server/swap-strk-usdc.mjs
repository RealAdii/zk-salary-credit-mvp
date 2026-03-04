import { Account, RpcProvider, Signer, CallData } from 'starknet'

const RPC_URL = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/REDACTED_ALCHEMY_KEY'
const provider = new RpcProvider({ nodeUrl: RPC_URL })
const privateKey = 'REDACTED_TREASURY_KEY'
const address = '0x724fe5a02e1f2b756ddc68fb387e64fbab8835ab557b0b79ae20ff47a40f823'

const signer = new Signer(privateKey)
const account = new Account({ provider, address, signer })

const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
const USDC = '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343'

// Swap 500 STRK to USDC
const sellAmount = '0x' + (500n * 10n ** 18n).toString(16)

console.log('Getting quote for 500 STRK -> USDC...')
const quoteResp = await fetch(
  'https://sepolia.api.avnu.fi/swap/v2/quotes?' +
    new URLSearchParams({
      sellTokenAddress: STRK,
      buyTokenAddress: USDC,
      sellAmount: sellAmount,
      takerAddress: address,
    }),
)
const quotes = await quoteResp.json()
const quote = quotes[0]
const buyUsdc = parseInt(quote.buyAmount, 16) / 1e6
console.log(`Quote: 500 STRK -> ${buyUsdc} USDC`)
console.log('Quote ID:', quote.quoteId)

// Build swap calldata
console.log('Building swap transaction...')
const buildResp = await fetch('https://sepolia.api.avnu.fi/swap/v2/build', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    quoteId: quote.quoteId,
    takerAddress: address,
    slippage: 0.05,
  }),
})
const buildData = await buildResp.json()

if (!buildResp.ok) {
  console.log('Build error:', JSON.stringify(buildData))
  process.exit(1)
}

const calls = buildData.calls || buildData.calldata
console.log('Executing swap with', calls.length, 'calls...')

const tx = await account.execute(calls)
console.log('Swap tx:', tx.transaction_hash)
console.log('Waiting for confirmation...')
await provider.waitForTransaction(tx.transaction_hash)
console.log('Swap complete!')

// Check USDC balance
const balResult = await provider.callContract({
  contractAddress: USDC,
  entrypoint: 'balanceOf',
  calldata: CallData.compile({ account: address }),
})
console.log('Treasury USDC balance:', parseInt(balResult[0], 16) / 1e6, 'USDC')
