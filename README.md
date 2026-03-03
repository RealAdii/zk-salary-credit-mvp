# zk-salary-credit-mvp

Small MVP for: prove salary privately (Reclaim) -> derive a credit line -> simulate draw/repay.

## What this includes

- React frontend using `@reclaimprotocol/js-sdk`
- Simple underwriting rule:
  - `credit_limit = min(50% of monthly salary, 5000 USDC)`
  - minimum approved limit: `100 USDC`
- Minimal Cairo contract scaffold for Starknet:
  - owner sets credit line for users
  - user can `draw` and `repay`

## Quick start

```bash
cd /Users/adithya/zk-salary-credit-mvp
npm install
cp .env.example .env
npm run dev
```

Open the local URL shown by Vite.

## Required env vars

Add these in `.env`:

```bash
VITE_RECLAIM_APP_ID=...
VITE_RECLAIM_APP_SECRET=...
VITE_RECLAIM_PROVIDER_ID=...
```

## Contract scaffold

Contract code is in:

- `contracts/src/lib.cairo`

Build with Scarb:

```bash
cd contracts
scarb build
```

## Demo flow

1. Click `Verify Salary Proof`
2. Complete Reclaim verification
3. App parses payload and computes credit limit
4. Draw USDC amount in simulator
5. Repay to reset outstanding balance

## Notes

- This is intentionally simple for demo purposes.
- Proof verification is assumed off-chain in MVP mode before setting on-chain line.
- No liquidation, collections, or production risk controls are included.
