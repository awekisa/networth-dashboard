import { addManualAccount, addManualAsset, addManualCash, addManualLiability, createSnapshotAction, ensureDefaultProviders, syncIbkrFlex } from './actions';
import { prisma } from '@/lib/db';
import { loadPortfolioAggregation } from '@/lib/portfolio/db-aggregation';

function money(value: number, currency = 'EUR') { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value); }
function pct(current: number, previous?: number) { if (!previous) return 'n/a'; return `${(((current - previous) / Math.abs(previous)) * 100).toFixed(2)}%`; }

export default async function Home() {
  await ensureDefaultProviders();
  const [aggregation, snapshots, accounts, providers, manualAssets, manualLiabilities, audits] = await Promise.all([
    loadPortfolioAggregation(),
    prisma.portfolioSnapshot.findMany({ orderBy: { capturedAt: 'desc' }, take: 30 }),
    prisma.account.findMany({ include: { provider: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.provider.findMany({ orderBy: { name: 'asc' } }),
    prisma.manualAsset.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.manualLiability.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 })
  ]);
  const previous = snapshots[1] ? Number(snapshots[1].totalNetWorth) : undefined;
  const allocation = Object.entries(aggregation.allocationByAssetClass);
  const exposure = Object.entries(aggregation.allocationByCurrency);
  const accountOptions = accounts.length ? accounts : [];
  return <main className="container">
    <section className="hero">
      <div><p className="badge">Local-first • SQLite • public crypto addresses only</p><h1>Local Net Worth Dashboard</h1><p className="muted">Private MVP for manual assets, liabilities, cash balances and Ethereum public-address tracking. Never enter private keys, seed phrases, or signing keys.</p></div>
      <form action={createSnapshotAction}><button>Refresh data / create snapshot</button></form>
    </section>
    <section className="grid" aria-label="Main dashboard cards">
      <div className="card"><h3>Total net worth</h3><div className="metric">{money(aggregation.totalNetWorth)}</div><p className="muted">Assets {money(aggregation.totalAssetsValue)} − liabilities {money(aggregation.liabilitiesValue)}</p></div>
      <div className="card"><h3>24h / 7d / 30d change</h3><div className="metric">{pct(aggregation.totalNetWorth, previous)}</div><p className="muted">Snapshot-based; more history improves this.</p></div>
      <div className="card"><h3>Asset allocation</h3>{allocation.length ? allocation.map(([k,v]) => <p key={k}>{k}: {money(v)}</p>) : <p className="muted">No assets yet</p>}</div>
      <div className="card"><h3>Currency exposure</h3>{exposure.length ? exposure.map(([k,v]) => <p key={k}>{k}: {money(v)}</p>) : <p className="muted">No exposure yet</p>}</div>
      <div className="card"><h3>Top holdings</h3>{aggregation.topHoldings.map(h => <p key={`${h.account}-${h.name}`}>{h.name}: {h.quantity} {h.symbol ?? ''}</p>)}</div>
      <div className="card"><h3>Account breakdown</h3>{accounts.length ? accounts.map(a => <p key={a.id}>{a.name} · {a.provider.name}</p>) : <p className="muted">Add a manual, bank, broker, Fidelity, or crypto account below.</p>}</div>
    </section>

    <h2>Connect accounts</h2>
    <section className="forms">
      <div className="card ok"><h3>Add manual account</h3><form action={addManualAccount}>
        <label>Provider<select aria-label="Provider" name="providerId" defaultValue="manual-provider">{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Account name<input name="name" placeholder="Account name" required/></label>
        <label>Account type<input aria-label="Account type" name="type" placeholder="cash, broker, wallet, pension" defaultValue="cash" required/></label>
        <label>Base currency<input aria-label="Base currency" name="currency" placeholder="EUR" defaultValue="EUR" required/></label>
        <button>Add manual account</button>
      </form><p className="muted">Use this for banks, brokers, pensions, Fidelity, IBKR, cash envelopes, or anything not connected yet.</p></div>
      <div className="card warning"><h3>Add Ethereum public address</h3><form action="/api/crypto-address" method="post"><input name="address" placeholder="0x public address only" required/><button>Add Ethereum public address</button></form><p className="muted">Public addresses only. This is enough for ETH and public ERC-20 balances when an Etherscan key is configured. Never enter private keys, seed phrases, or signing keys.</p></div>
      <div className="card"><h3>Interactive Brokers</h3><p className="muted">MVP status: read-only Flex Web Service sync. Add IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID to local .env, restart the dev server, then sync. Uses read-only reports only. No trading, no order placement, no automation.</p><form action={syncIbkrFlex}><button>Sync IBKR Flex now</button></form></div>
      <div className="card"><h3>Fidelity</h3><p className="muted">MVP status: safe placeholder. Fidelity is best handled as CSV export or manual entry unless an official read-only integration is explicitly available. No credential scraping, no trading, no order placement.</p></div>
      <div className="card"><h3>Bank accounts</h3><p className="muted">MVP status: manual balances. Add each bank as a manual account, then add cash balances. Future bank integrations must be opt-in, documented, and read-only.</p></div>
    </section>

    <h2>Manual entry</h2>
    <section className="forms">
      <div className="card"><h3>Add manual asset</h3><form action={addManualAsset}>
        <select aria-label="Asset account" name="accountId"><option value="">No account / free text below</option>{accountOptions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.provider.name}</option>)}</select>
        <input name="accountName" placeholder="Account name if not listed"/><input name="name" placeholder="Name" required/><select name="assetClass" defaultValue="FUND"><option>CASH</option><option>CRYPTO</option><option>EQUITY</option><option>FUND</option><option>BOND</option><option>REAL_ESTATE</option><option>COMMODITY</option><option>OTHER</option></select><input name="currency" placeholder="Currency" defaultValue="EUR" required/><input name="quantity" type="number" step="any" placeholder="Quantity" required/><input name="unitPrice" type="number" step="any" placeholder="Unit price" required/><button>Add manual asset</button></form></div>
      <div className="card"><h3>Add manual liability</h3><form action={addManualLiability}>
        <select aria-label="Liability account" name="accountId"><option value="">No account / free text below</option>{accountOptions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.provider.name}</option>)}</select>
        <input name="accountName" placeholder="Account name if not listed"/><input name="name" placeholder="Name" required/><input name="currency" placeholder="Currency" defaultValue="EUR" required/><input name="amount" type="number" step="any" placeholder="Amount" required/><button>Add manual liability</button></form></div>
      <div className="card"><h3>Add manual cash/bank balance</h3><form action={addManualCash}>
        <select aria-label="Cash account" name="accountId"><option value="">No account / free text below</option>{accountOptions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.provider.name}</option>)}</select>
        <input name="accountName" placeholder="Account name if not listed"/><input name="name" placeholder="Cash / bank balance name" required/><input name="currency" placeholder="Currency" defaultValue="EUR" required/><input name="unitPrice" type="number" step="any" placeholder="Balance" required/><button>Add manual cash balance</button></form></div>
    </section>

    <h2>Charts</h2><section className="grid"><div className="card"><h3>Net worth over time</h3>{snapshots.slice().reverse().map(s => <p key={s.id}>{s.capturedAt.toISOString().slice(0,10)} · {money(Number(s.totalNetWorth), s.currency)}</p>)}</div><div className="card"><h3>Asset allocation pie/donut</h3>{allocation.map(([k,v]) => <p key={k}>● {k}: {money(v)}</p>)}</div><div className="card"><h3>Currency exposure</h3>{exposure.map(([k,v]) => <p key={k}>● {k}: {money(v)}</p>)}</div><div className="card"><h3>Holdings performance</h3><p className="muted">Shown when cost basis/price history is available.</p></div></section>
    <h2>Tables</h2><section className="card table-wrap"><h3>Holdings table</h3><table><thead><tr><th>Name</th><th>Ticker</th><th>Provider</th><th>Account</th><th>Asset class</th><th>Currency</th><th>Quantity</th><th>Unit price</th><th>Market value</th><th>Cost basis</th><th>Unrealized P&L</th><th>Last updated</th></tr></thead><tbody>{aggregation.holdings.map(h => <tr key={`${h.provider}-${h.account}-${h.name}`}><td>{h.name}</td><td>{h.symbol}</td><td>{h.provider}</td><td>{h.account}</td><td>{h.assetClass}</td><td>{h.currency}</td><td>{h.quantity}</td><td>{h.unitPrice ?? ''}</td><td>{h.marketValue ?? ''}</td><td>{h.costBasis ?? ''}</td><td>{h.unrealizedPnl ?? ''}</td><td>{h.lastUpdatedAt ?? ''}</td></tr>)}</tbody></table></section>
    <section className="grid"><div className="card"><h3>Accounts table</h3>{accounts.map(a => <p key={a.id}>{a.name} · {a.type} · {a.currency} · {a.provider.name}</p>)}</div><div className="card"><h3>Manual assets table</h3>{manualAssets.map(a => <p key={a.id}>{a.name}: {String(a.quantity)} × {String(a.unitPrice)} {a.currency} · {a.accountName ?? 'No account'}</p>)}</div><div className="card"><h3>Manual liabilities table</h3>{manualLiabilities.map(l => <p key={l.id}>{l.name}: {String(l.amount)} {l.currency} · {l.accountName ?? 'No account'}</p>)}</div><div className="card"><h3>Portfolio snapshots table</h3>{snapshots.map(s => <p key={s.id}>{s.capturedAt.toISOString()} · {money(Number(s.totalNetWorth), s.currency)}</p>)}</div></section>
    <h2>Filters</h2><section className="card"><p className="muted">Filter dimensions supported in the normalized model: account, asset class, currency, provider. UI controls are intentionally minimal in MVP and can be wired to query params next.</p></section>
    <h2>Audit log</h2><section className="card ok">{audits.map(a => <p key={a.id}>{a.createdAt.toISOString()} · {a.action} · {a.safeMetadataJson}</p>)}</section>
  </main>;
}
