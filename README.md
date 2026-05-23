# Local Net Worth Dashboard

A local-first, privacy-focused personal net worth dashboard built with Next.js, TypeScript, Prisma, SQLite, and Vitest.

## MVP scope

- Manual assets, liabilities, and cash/bank balances.
- Ethereum public-address tracking for ETH balances and crypto price lookup.
- Portfolio aggregation, asset allocation, currency exposure, and historical snapshots.
- Provider-adapter architecture for manual, crypto, IBKR placeholder, and banking placeholder providers.
- SQLite persistence on the local machine.

## Security and privacy requirements

- Local-first by default.
- No cloud sync in the MVP.
- No financial data upload unless a future integration explicitly requires it and documents it.
- Sensitive credentials must be encrypted at rest if any are stored.
- Never store crypto private keys, seed phrases, or signing keys.
- Only public crypto addresses are allowed.
- API keys/tokens must be stored securely via local environment variables or encrypted local storage.
- `.env.example` is committed; real `.env` files are ignored.
- Audit logging records sync attempts and safe metadata only; secrets and sensitive key names are redacted.
- No trading functionality.
- No crypto transaction signing.
- No broker order placement.
- No Interactive Brokers trading automation.
- No real-time trading/HUD features.

## Threat model notes

Protected assets:

- Local portfolio database (`prisma/dev.db`).
- Manual financial entries.
- Public crypto addresses and balances.
- Future provider API tokens, if enabled.

Primary risks:

- Accidental commit of secrets: mitigated by `.gitignore` and `.env.example` pattern.
- Sensitive data leakage in logs: audit logs redact token/key/private/seed/phrase-like fields and store only safe sync metadata.
- Crypto key compromise: the app never asks for, stores, or signs with private keys/seed phrases/signing keys.
- Broker trading risk: IBKR is a placeholder adapter only; no order placement or automation exists.
- Cloud data exposure: no cloud sync is implemented in the MVP.

Out of scope for MVP:

- Multi-user auth.
- Hosted deployment.
- Live bank integrations.
- Interactive Brokers live integration.
- Crypto transaction signing.
- Trading, broker order placement, or real-time HUD functionality.

## Setup

```bash
cp .env.example .env
npm install
npm run db:push
npm run dev
```

Open http://localhost:3000.

## Tests

```bash
npm test
npm run test:ui
npm run build
```

## Architecture

- `src/lib/providers/types.ts`: common provider adapter interface.
- `src/lib/providers/manual`: manual provider.
- `src/lib/providers/crypto`: Ethereum public-address normalization and price lookup.
- `src/lib/providers/ibkr`: placeholder only; no trading.
- `src/lib/providers/banking`: placeholder only; no cloud sync.
- `src/lib/portfolio`: normalized aggregation and snapshot logic.
- `prisma/schema.prisma`: normalized SQLite data model.
- `src/app`: dashboard UI, server actions, and public-address sync API.

Provider logic is separate from portfolio aggregation, pricing is separate from holdings logic, and business logic is separate from the UI.

## Future integration notes

- IBKR: add read-only account/position import first; explicitly exclude order placement and automation.
- Banking: add opt-in read-only provider adapters; document any external data exchange before enabling.
- Crypto ERC-20 discovery: add an Etherscan/Alchemy read-only adapter using API keys from local secure storage; continue to accept public addresses only.
- Secrets: if long-lived tokens are introduced, store them in encrypted local storage or OS keychain-backed storage.
