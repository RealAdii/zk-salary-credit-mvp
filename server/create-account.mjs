import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account, RpcProvider, ec, hash, CallData, stark } from 'starknet'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '.env')
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

const RPC_URL = process.env.STARKNET_RPC_URL
const provider = new RpcProvider({ nodeUrl: RPC_URL })

// Generate a new key pair
const privateKey = stark.randomAddress()
const publicKey = ec.starkCurve.getStarkKey(privateKey)

// Use OZ Account class hash that supports v3 txns (Cairo 1 / OZ 0.14+)
const OZ_ACCOUNT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

const constructorCalldata = CallData.compile({ public_key: publicKey })
const address = hash.calculateContractAddressFromHash(
  publicKey,
  OZ_ACCOUNT_CLASS_HASH,
  constructorCalldata,
  0
)

console.log('=== New Treasury Account ===')
console.log('Private key:', privateKey)
console.log('Public key:', publicKey)
console.log('Address:', address)
console.log('Class hash:', OZ_ACCOUNT_CLASS_HASH)
console.log('')
console.log('STEP 1: Fund this address with STRK on Sepolia.')
console.log(`  Send STRK to: ${address}`)
console.log('  You can transfer from the old account if you have another way to access it,')
console.log('  or use a Sepolia faucet.')
console.log('')
console.log('STEP 2: After funding, run this script again with --deploy flag.')

if (process.argv.includes('--deploy')) {
  console.log('\nAttempting deployment...')

  // Check STRK balance
  const STRK_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
  const balResult = await provider.callContract({
    contractAddress: STRK_ADDRESS,
    entrypoint: 'balanceOf',
    calldata: CallData.compile({ account: address }),
  })
  const balance = BigInt(balResult[0])
  console.log('STRK balance:', (Number(balance) / 1e18).toFixed(4), 'STRK')

  if (balance === 0n) {
    console.log('No STRK balance. Fund the account first.')
    process.exit(1)
  }

  const account = new Account(provider, address, privateKey)
  const deployPayload = {
    classHash: OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    addressSalt: publicKey,
  }

  try {
    const { transaction_hash, contract_address } = await account.deployAccount(deployPayload)
    console.log('Deploy tx:', transaction_hash)
    console.log('Address:', contract_address)
    await provider.waitForTransaction(transaction_hash)
    console.log('Account deployed successfully!')
    console.log('')
    console.log('Update server/.env with:')
    console.log(`TREASURY_PRIVATE_KEY=${privateKey}`)
    console.log(`TREASURY_ACCOUNT_ADDRESS=${address}`)
  } catch (e) {
    console.log('Deploy failed:', e.message)
  }
}
