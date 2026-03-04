import { StarkZap, sepoliaTokens, OnboardStrategy } from 'starkzap'

let walletRef = null
let sdkRef = null
const tokenRef = sepoliaTokens.USDC

function ensureSdk() {
  if (!sdkRef) {
    sdkRef = new StarkZap({ network: 'sepolia' })
  }
}

export async function connectCartridgeWallet() {
  ensureSdk()
  const onboard = await sdkRef.onboard({
    strategy: OnboardStrategy.Cartridge,
    cartridge: {
      policies: [{ target: tokenRef.address, method: 'transfer' }],
    },
    deploy: 'if_needed',
  })
  walletRef = onboard.wallet
  return walletRef
}

export async function disconnectWallet() {
  if (walletRef && typeof walletRef.disconnect === 'function') {
    await walletRef.disconnect()
  }
  walletRef = null
}

export async function getWalletUsdcBalance() {
  if (!walletRef) return '0'
  const bal = await walletRef.balanceOf(tokenRef)
  return bal.toFormatted()
}
