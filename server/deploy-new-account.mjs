import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account, RpcProvider, ec, hash, CallData } from 'starknet'

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

// The key generated in the first run
const privateKey = 'REDACTED_TREASURY_KEY'
const publicKey = ec.starkCurve.getStarkKey(privateKey)
const OZ_ACCOUNT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'
const constructorCalldata = CallData.compile({ public_key: publicKey })
const address = hash.calculateContractAddressFromHash(publicKey, OZ_ACCOUNT_CLASS_HASH, constructorCalldata, 0)

console.log('Address:', address)

// Check balance
const STRK_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
const balResult = await provider.callContract({
  contractAddress: STRK_ADDRESS,
  entrypoint: 'balanceOf',
  calldata: CallData.compile({ account: address }),
})
const balance = BigInt(balResult[0])
console.log('STRK balance:', (Number(balance) / 1e18).toFixed(4), 'STRK')

if (balance === 0n) {
  console.log('No balance yet. Fund this address first.')
  process.exit(1)
}

// Deploy
const account = new Account(provider, address, privateKey)
const { transaction_hash, contract_address } = await account.deployAccount({
  classHash: OZ_ACCOUNT_CLASS_HASH,
  constructorCalldata,
  addressSalt: publicKey,
})
console.log('Deploy tx:', transaction_hash)
await provider.waitForTransaction(transaction_hash)
console.log('Account deployed successfully!')
console.log('')
console.log('Update server/.env with:')
console.log(`TREASURY_PRIVATE_KEY=${privateKey}`)
console.log(`TREASURY_ACCOUNT_ADDRESS=${address}`)
