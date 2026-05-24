# Real Account Integrations Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add safe, read-only ways to plug real accounts into the local-first net worth dashboard.

**Architecture:** Prefer integrations that do not require storing sensitive credentials: public crypto addresses, local CSV import, and IBKR Flex read-only reports. Keep cloud account aggregation optional and explicitly out of MVP unless approved.

**Tech Stack:** Next.js Server Actions/API routes, Prisma/SQLite, TypeScript strict mode, Vitest, Playwright.

---

## Integration feasibility

1. **Crypto wallets: high confidence**
   - Ethereum and ERC-20 balances can be read from public addresses.
   - No private keys, no signing, no transactions.
   - Current app already has ETH public-address sync and optional ERC-20 discovery via `ETHERSCAN_API_KEY`.

2. **Interactive Brokers: feasible as read-only, but choose the safe path**
   - Preferred MVP path: import IBKR Activity/Flex reports or CSV exports.
   - Later path: IBKR Flex Web Service token/query id if the user enables it.
   - Avoid Client Portal trading API until explicitly needed; do not implement order placement.

3. **Fidelity: no reliable official consumer API assumption**
   - Preferred MVP path: CSV export import.
   - Do not scrape credentials or automate login.
   - If Fidelity offers official read-only export/API in the user's region/account type, add later behind explicit docs.

4. **Bank accounts: not local-first if using aggregators**
   - Plaid/Tink/Yodlee-style integrations generally require cloud third parties and financial data upload.
   - For MVP, use manual balances or local CSV import.
   - Any aggregator must be opt-in, documented, and not default.

## Recommended build order

### Task 1: Add generic CSV import model and parser

**Objective:** Support local imports without credentials.

**Files:**
- Create: `src/lib/imports/csv.ts`
- Create: `tests/import-csv.test.ts`

**Behavior:** Parse rows into normalized holdings/cash balances with required columns: account, provider, name, symbol, assetClass, currency, quantity, unitPrice.

### Task 2: Add broker CSV import UI

**Objective:** Let user import IBKR/Fidelity exports locally.

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `tests/ui/manual-flows.spec.ts`

**Behavior:** Paste CSV text or upload file, preview normalized holdings, save to SQLite.

### Task 3: Add IBKR Flex importer

**Objective:** Fetch read-only Flex statement data when the user provides local token/query id.

**Files:**
- Create: `src/lib/providers/ibkr/flex.ts`
- Create: `tests/ibkr-flex.test.ts`
- Modify: `.env.example`

**Security:** Token stays in local `.env`; audit logs redact it; no trading endpoints.

### Task 4: Improve crypto integration

**Objective:** Expand public-address support safely.

**Files:**
- Modify: `src/lib/providers/crypto/ethereum.ts`
- Modify: `src/app/api/crypto-address/route.ts`

**Behavior:** Better ERC-20 price mapping, balance refresh per stored address, no private key fields anywhere.

### Task 5: Add integration README section

**Objective:** Document how each account type works and what data leaves the machine.

**Files:**
- Modify: `README.md`

**Must document:** Crypto public RPC, optional Etherscan, IBKR Flex, Fidelity CSV, bank aggregator caveat.
