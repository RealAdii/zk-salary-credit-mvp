import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account, RpcProvider, stark, ec, hash, CallData } from 'starknet'

// Load .env
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

const PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY
const EXPECTED_ADDRESS = process.env.TREASURY_ACCOUNT_ADDRESS
const RPC_URL = process.env.STARKNET_RPC_URL

const provider = new RpcProvider({ nodeUrl: RPC_URL })

// Derive public key from private key
const publicKey = ec.starkCurve.getStarkKey(PRIVATE_KEY)
console.log('Private key:', PRIVATE_KEY)
console.log('Derived public key:', publicKey)
console.log('Expected address:', EXPECTED_ADDRESS)

// OpenZeppelin Account class hash on Sepolia
// Try the standard OZ account v0.14.0 class hash
const OZ_ACCOUNT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

// Compute address to verify it matches
const constructorCalldata = CallData.compile({ public_key: publicKey })
const computedAddress = hash.calculateContractAddressFromHash(
  publicKey, // salt = public key
  OZ_ACCOUNT_CLASS_HASH,
  constructorCalldata,
  0
)

console.log('Computed address (OZ):', computedAddress)
console.log('Matches expected:', computedAddress.toLowerCase() === EXPECTED_ADDRESS.toLowerCase())

if (computedAddress.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
  // Try other common class hashes
  const classHashes = [
    { name: 'OZ 0.8.1', hash: '0x05400e90f7e0ae78bd02c77cd75527280470e2fe19c54970dd79dc37a9d3645c' },
    { name: 'OZ 0.9.0', hash: '0x01a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003' },
    { name: 'OZ 0.11.0', hash: '0x04c6d6cf894f8bc96bb9c525e6853e5483177841f7388f74a46cfb2c371571d' },
    { name: 'OZ 0.13.0', hash: '0x00e2eb8f5672af4e6a4e8a8f1b44c15c2f9418f56a81bb3907ac2b0f12f7a2b1' },
    { name: 'Argent v0.4.0', hash: '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f' },
  ]

  for (const { name, hash: ch } of classHashes) {
    const addr = hash.calculateContractAddressFromHash(publicKey, ch, constructorCalldata, 0)
    console.log(`  ${name}: ${addr}`)
    if (addr.toLowerCase() === EXPECTED_ADDRESS.toLowerCase()) {
      console.log(`  ^^^ MATCH with ${name}!`)
    }
  }

  console.log('\nAddress does not match any known class hash.')
  console.log('Trying to deploy with the standard OZ class hash anyway...')
}

// Check if already deployed
try {
  const nonce = await provider.getNonceForAddress(EXPECTED_ADDRESS)
  console.log('\nAccount is already deployed! Nonce:', nonce)
  process.exit(0)
} catch (e) {
  console.log('\nAccount not deployed yet, proceeding with deployment...')
}

// Check balance
try {
  // STRK token on Sepolia
  const STRK_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
  const balResult = await provider.callContract({
    contractAddress: STRK_ADDRESS,
    entrypoint: 'balanceOf',
    calldata: CallData.compile({ account: EXPECTED_ADDRESS }),
  })
  console.log('STRK balance (raw):', balResult)

  // ETH token
  const ETH_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
  const ethResult = await provider.callContract({
    contractAddress: ETH_ADDRESS,
    entrypoint: 'balanceOf',
    calldata: CallData.compile({ account: EXPECTED_ADDRESS }),
  })
  console.log('ETH balance (raw):', ethResult)
} catch (e) {
  console.log('Balance check failed:', e.message)
}

// Deploy the account
try {
  const account = new Account(provider, EXPECTED_ADDRESS, PRIVATE_KEY)

  const deployPayload = {
    classHash: OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata: constructorCalldata,
    addressSalt: publicKey,
  }

  const { transaction_hash, contract_address } = await account.deployAccount(deployPayload)
  console.log('\nDeployment tx:', transaction_hash)
  console.log('Contract address:', contract_address)

  await provider.waitForTransaction(transaction_hash)
  console.log('Account deployed successfully!')
} catch (e) {
  console.log('\nDeployment failed:', e.message)
  console.log('\nThis likely means the address was computed with a different class hash or salt.')
  console.log('You may need to deploy using the original tool that generated this address.')
}
