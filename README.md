# SalaryLine

Undercollateralized lending on Starknet. Draw a line of credit backed by your salary — no collateral, no credit bureau, just a ZK proof of income.

## Why undercollateralized?

DeFi lending today is backwards. To borrow $1,000 on Aave or Compound, you need to lock up $1,500+ in collateral. That works for whales and degens, but it excludes the vast majority of people who actually need credit — people with steady income but no on-chain assets.

In traditional finance, most credit is undercollateralized. Your credit card, your personal loan, your mortgage — none of these require you to lock up more than you borrow. They work because the lender can verify your income and enforce repayment.

SalaryLine brings this model on-chain:
- **ZK salary verification** via [Reclaim Protocol](https://reclaimprotocol.org/) — prove your income without exposing your payslip
- **Algorithmic underwriting** — credit limit derived directly from verified monthly salary
- **On-chain credit lines** — draw USDC into your Starknet wallet against your approved limit
- **No collateral required** — your salary proof IS your creditworthiness

The thesis is simple: if we can trustlessly verify that someone earns X per month, we can safely lend them a fraction of X without requiring collateral. ZK proofs solve the information problem. Starknet's low fees make small credit lines economically viable.

## How it works

1. Connect your Starknet wallet (via [StarkZap](https://github.com/keep-starknet-strange/starkzap/) + Cartridge Controller)
2. Verify your salary through Reclaim Protocol (currently supports Razorpay Payroll)
3. The engine computes your credit line: `min(50% of monthly salary in USDC, 5000 USDC)`
4. Draw USDC on-chain — the treasury sends tokens directly to your wallet
5. Repay when ready

## StarkZap integration

We used [StarkZap](https://github.com/keep-starknet-strange/starkzap/) to plug into the Starknet ecosystem instantly. StarkZap is an SDK from [StarkWare](https://starkware.co/) — the $2B company behind Starknet, StarkEx, and the STARK proof system that secures billions in TVL. StarkZap handles:
- **Wallet onboarding** — one-call Cartridge Controller integration with session policies
- **Token balance reads** — real-time USDC balance for connected wallets
- **Network abstraction** — Sepolia config, token registries, and RPC setup out of the box

Instead of writing custom wallet connection logic, StarkZap let us go from zero to working wallet integration in minutes. This is what composability looks like — one `npm install` and we had wallet connect, balance reads, and token transfers working out of the box on Starknet.

## Quick start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your Reclaim credentials to .env

cp server/.env.example server/.env
# Add treasury private key, account address, and RPC URL to server/.env

# Terminal 1: Start the withdraw server
node server/withdraw-server.mjs

# Terminal 2: Start the frontend
npm run dev
```

## Underwriting logic

| Parameter | Value |
|---|---|
| Credit multiplier | 50% of monthly salary |
| Max credit limit | 5,000 USDC |
| Min credit limit | 100 USDC |
| APR | 15% (fixed) |
| FX rate | 83 INR/USDC (hardcoded) |
| Proof validity | 30 days |

## Architecture

```
┌─────────────┐    ZK Proof    ┌──────────────┐
│   Reclaim    │──────────────>│   Frontend   │
│   Protocol   │               │  (React/Vite)│
└─────────────┘               └──────┬───────┘
                                      │
                              ┌───────▼───────┐
                              │  Loan Engine  │
                              │  (underwrite) │
                              └───────┬───────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │         Withdraw Server            │
                    │  (treasury sends USDC on Sepolia)  │
                    └─────────────────┬─────────────────┘
                                      │
                              ┌───────▼───────┐
                              │   Starknet    │
                              │   (Sepolia)   │
                              └───────────────┘
```

## Contract

Cairo contract in `contracts/src/lib.cairo`:
- `set_credit_line(user, limit, apr_bps)` — owner sets credit line after proof verification
- `draw(amount)` — user draws against their limit
- `repay(amount)` — user repays outstanding balance
- `get_position(user)` — returns (limit, outstanding, apr_bps)

Build with Scarb:
```bash
cd contracts && scarb build
```

## This is a demo

This is an MVP built to prove the concept. It is NOT production-ready.

What's missing for production:
- On-chain payroll streaming for auto-repayment
- Real FX oracle instead of hardcoded rate
- Variable APR based on risk scoring
- Default insurance / reserve pool for LPs
- Multi-provider salary verification (Deel, Rippling, Workday)
- Legal framework and loan agreements
- On-chain credit scoring that evolves with repayment history

**We want people to build on this.** The salary verification pipeline, the underwriting engine, the StarkZap integration, the contract scaffold — it's all here and open source. Fork it, extend it, ship it.

Ideas for builders:
- Plug in additional payroll providers via Reclaim
- Build a liquidity pool for lenders to supply USDC
- Add on-chain credit scoring and reputation
- Implement salary stream interception for auto-repayment
- Create a governance token for protocol parameters

## Tech stack

- **Frontend**: React 19 + Vite
- **Wallet**: StarkZap + Cartridge Controller
- **ZK Proofs**: Reclaim Protocol
- **Smart Contract**: Cairo (Starknet)
- **Backend**: Node.js (treasury server)
- **Network**: Starknet Sepolia

## Notes

- Treasury signer key is testnet-only and must never be used on mainnet.
- No liquidation, collections, or production risk controls are included.
- This is intentionally simple. Complexity should be earned, not assumed.
