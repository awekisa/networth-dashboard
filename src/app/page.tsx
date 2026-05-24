import { addManualAccount, addManualAsset, addManualCash, addManualLiability, createSnapshotAction, ensureDefaultProviders, syncIbkrFlex } from './actions';
import { prisma } from '@/lib/db';
import { loadPortfolioAggregation } from '@/lib/portfolio/db-aggregation';
import { CRYPTO_CHAINS, parseConfiguredCryptoAddresses } from '@/lib/providers/crypto/chains';
import type { NormalizedHolding } from '@/lib/portfolio/types';

function money(value: number, currency = 'EUR') { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value); }
function pct(current: number, previous?: number) { if (!previous) return 'n/a'; return `${(((current - previous) / Math.abs(previous)) * 100).toFixed(2)}%`; }
function quantity(value: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value); }
function maybeMoney(value: number | undefined, currency: string) { return value === undefined ? 'n/a' : money(value, currency); }
function rowValue(holding: NormalizedHolding) { return holding.marketValue ?? holding.quantity * (holding.unitPrice ?? 0); }
function positive(value?: number) { return value === undefined ? '' : value >= 0 ? 'positive' : 'negative'; }

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
  const dailyChange = previous === undefined ? 0 : aggregation.totalNetWorth - previous;
  const allocation = Object.entries(aggregation.allocationByAssetClass);
  const exposure = Object.entries(aggregation.allocationByCurrency);
  const accountOptions = accounts.length ? accounts : [];
  const configuredCryptoAddresses = parseConfiguredCryptoAddresses();
  const connectedCryptoAccounts = accounts.filter(a => a.providerId === 'crypto-provider');
  const holdingsCount = aggregation.holdings.length;
  const connectedSources = accounts.length;
  const syncedAt = audits.find(a => a.action === 'SYNC_SUCCESS')?.createdAt;
  const syncLabel = connectedSources ? `${connectedSources} integrations · synced ${syncedAt ? syncedAt.toISOString().slice(11, 16) : 'locally'}` : 'Local sources · add integrations';
  const holdingsByClass = aggregation.holdings.reduce<Record<string, NormalizedHolding[]>>((acc, holding) => {
    (acc[holding.assetClass] ??= []).push(holding);
    return acc;
  }, {});

  return <>
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">N</span><span>Nworth</span></div>
        <nav aria-label="Primary navigation"><a className="active" href="#portfolio">Portfolio</a><a href="#holdings">Holdings</a><a href="#integrations">Integrations</a></nav>
        <div className="topbar-actions"><a className="sync-pill" href="#integrations"><span className="status-dot" />{syncLabel}</a><button className="ghost" type="button">Privacy mode</button><span className="avatar">DV</span></div>
      </header>

      <section id="portfolio" className="dashboard-grid hero-grid">
        <article className="panel net-worth-panel">
          <h2 className="eyebrow">Net worth</h2>
          <div className="hero-metric">{money(aggregation.totalNetWorth)}</div>
          <div className={`change-line ${dailyChange >= 0 ? 'positive' : 'negative'}`}><span>{dailyChange >= 0 ? '▲' : '▼'}</span><strong>{money(Math.abs(dailyChange))}</strong><span>({pct(aggregation.totalNetWorth, previous)})</span><span className="muted">Today</span></div>
          <div className="mini-metrics"><span>30d <strong>{pct(aggregation.totalNetWorth, previous)}</strong></span><span>Assets <strong>{money(aggregation.totalAssetsValue)}</strong></span><span>Liabilities <strong>{money(aggregation.liabilitiesValue)}</strong></span></div>
          <form action={createSnapshotAction}><button className="primary">Refresh data / create snapshot</button></form>
        </article>

        <article className="panel chart-panel">
          <div className="panel-title"><h2>30-day trend</h2><div className="range-tabs"><span>1w</span><span className="selected">1m</span><span>3m</span><span>1y</span><span>All</span></div></div>
          <svg className="trend-chart" viewBox="0 0 420 180" role="img" aria-label="Net worth trend chart">
            <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity="0.24"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0.02"/></linearGradient></defs>
            <path d="M12 140 C70 122 92 132 136 105 S220 82 260 92 S338 48 408 58" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round"/>
            <path d="M12 140 C70 122 92 132 136 105 S220 82 260 92 S338 48 408 58 L408 168 L12 168 Z" fill="url(#trendFill)"/>
          </svg>
          <div className="axis"><span>{snapshots.at(-1)?.capturedAt.toISOString().slice(5,10) ?? 'Start'}</span><span>{snapshots[0]?.capturedAt.toISOString().slice(5,10) ?? 'Today'}</span></div>
        </article>

        <article className="panel allocation-panel">
          <h2 className="eyebrow">Allocation</h2>
          <div className="allocation-wrap"><div className="donut" /> <div className="legend">{allocation.length ? allocation.map(([k,v], i) => <p key={k}><span className={`legend-dot c${i % 6}`} />{k}<strong>{aggregation.totalAssetsValue ? ((v / aggregation.totalAssetsValue) * 100).toFixed(1) : '0.0'}%</strong></p>) : <p className="muted">No assets yet</p>}</div></div>
        </article>
      </section>

      <section id="holdings" className="holdings-section">
        <div className="section-heading"><div><h2>Holdings</h2><p>{holdingsCount} assets across {connectedSources || 1} local sources</p></div><div className="button-row"><a href="#integrations" className="secondary-button">+ Add asset</a><a href="#integrations" className="secondary-button">Connect integration</a></div></div>
        <div className="holdings-card">
          {Object.entries(holdingsByClass).length ? Object.entries(holdingsByClass).map(([assetClass, rows], index) => <details open={index < 2} key={assetClass} className="asset-group">
            <summary><span><i className={`legend-dot c${index % 6}`} />{assetClass}<small>{rows.length}</small></span><strong>{money(rows.reduce((sum, h) => sum + rowValue(h), 0), rows[0]?.currency ?? 'EUR')}</strong></summary>
            <div className="table-wrap"><table><thead><tr><th>Symbol</th><th>Name</th><th>Shares</th><th>Price</th><th>Value</th><th>Total return</th><th>Account</th></tr></thead><tbody>{rows.map(h => <tr key={`${h.provider}-${h.account}-${h.name}`}><td><strong>{h.symbol ?? '—'}</strong></td><td>{h.name}</td><td>{quantity(h.quantity)}</td><td>{h.unitPrice === undefined ? '—' : money(h.unitPrice, h.currency)}</td><td>{h.marketValue === undefined ? '—' : money(h.marketValue, h.currency)}</td><td className={positive(h.unrealizedPnl)}>{h.unrealizedPnl === undefined ? '—' : money(h.unrealizedPnl, h.currency)}</td><td><span className="account-chip">{h.account}</span></td></tr>)}</tbody></table></div>
          </details>) : <p className="empty-state">No holdings yet. Add a manual asset or connect a read-only integration.</p>}
        </div>
      </section>

    </main>

    <aside id="integrations" className="modal-backdrop" aria-label="Integrations modal">
      <div className="integrations-modal">
        <header className="modal-header"><div><h2>Integrations</h2><p>{connectedSources} connected · next manual sync when you choose</p></div><a href="#" className="close-button" aria-label="Close integrations">×</a></header>
        <div className="modal-body"><nav className="modal-sidebar" aria-label="Integration categories"><a className="selected" href="#integrations">◯ <span>All sources</span><strong>22</strong></a><a href="#integrations">▤ <span>Brokerages</span><strong>5</strong></a><a href="#integrations">◆ <span>Crypto</span><strong>6</strong></a><a href="#integrations">▭ <span>Banks & cash</span><strong>4</strong></a><a href="#integrations">⌂ <span>Real estate</span><strong>3</strong></a><a href="#integrations">✎ <span>Manual entry</span><strong>2</strong></a><div className="status-box"><p>Status</p><span><i className="status-dot"/> {Math.max(connectedSources, 1)} syncing</span><span><i className="status-dot warning-dot"/> 0 needs re-auth</span></div></nav>
          <div className="modal-content"><section className="connected-section"><div className="modal-section-title"><p>CONNECTED</p><span>{connectedSources} sources · {money(aggregation.totalAssetsValue)} tracked</span></div><div className="integration-list"><div className="integration-row"><span className="provider-icon ib">IB</span><div><strong>Interactive Brokers</strong><small><b>FLEX</b> Read-only Flex Web Service · No trading, no order placement, no automation.</small></div><span className="healthy">synced</span><span>{money(aggregation.holdings.filter(h => h.provider === 'Interactive Brokers').reduce((sum, h) => sum + rowValue(h), 0))}</span><form action={syncIbkrFlex}><button>Sync IBKR Flex now</button></form></div>{accounts.filter(a => a.providerId !== 'ibkr-provider').map(a => <div className="integration-row" key={a.id}><span className="provider-icon">{a.provider.name.slice(0,2).toUpperCase()}</span><div><strong>{a.provider.name}</strong><small><b>LOCAL</b> {a.name}</small></div><span className="healthy">local</span><span>{a.currency}</span><button type="button">Sync</button></div>)}</div></section>
            <section className="add-new-section"><div className="modal-section-title"><p>ADD NEW</p><span>22 sources</span><input aria-label="Search providers" placeholder="Search providers…" /></div><div className="provider-grid"><a href="#integrations" className="provider-card"><span className="provider-icon">M</span><strong>Manual account</strong><small>MANUAL · cash, assets, liabilities</small></a><a href="#manual-entry" className="provider-card"><span className="provider-icon eth">₿</span><strong>Crypto addresses</strong><small>BTC · ETH · SOL · SUI · public tracking only</small></a><a href="#integrations" className="provider-card"><span className="provider-icon ib">IB</span><strong>Interactive Brokers</strong><small>FLEX · positions and cash balances</small></a><a href="#integrations" className="provider-card"><span className="provider-icon">B</span><strong>Bank / cash</strong><small>MANUAL · local-first MVP</small></a></div></section>

            <section id="manual-entry" className="modal-management"><div className="modal-section-title"><p>MANAGE LOCAL SOURCES</p><span>Manual entries and env addresses stay local</span></div><article className="panel card"><h2>Configured crypto addresses</h2><p className="muted">Set public wallet tracking in local <code>.env</code> as <code>CRYPTO_PUBLIC_ADDRESSES</code>, for example <code>bitcoin:bc1...,ethereum:0x...,solana:...,sui:0x...</code>. Public addresses are okay here; never add private keys or seed phrases.</p>{configuredCryptoAddresses.length ? <div className="integration-list">{configuredCryptoAddresses.map(item => <form action="/api/crypto-address" method="post" className="integration-row" key={`${item.chain}-${item.address}`}><span className="provider-icon eth">{CRYPTO_CHAINS[item.chain].symbol}</span><div><strong>{item.label}</strong><small><b>.ENV</b> {item.maskedAddress}</small></div><input type="hidden" name="chain" value={item.chain}/><input type="hidden" name="address" value={item.address}/><span className="healthy">configured</span><button>Sync</button></form>)}</div> : <p className="muted">No <code>CRYPTO_PUBLIC_ADDRESSES</code> entries found in local <code>.env</code> yet.</p>}{connectedCryptoAccounts.length ? <p className="muted">Already synced locally: {connectedCryptoAccounts.map(account => account.name).join(', ')}</p> : null}</article><div className="manual-grid">
              <article className="panel card"><h2>Add manual account</h2><form action={addManualAccount}>
                <label>Provider<select aria-label="Provider" name="providerId" defaultValue="manual-provider">{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                <label>Account name<input name="name" placeholder="Account name" required/></label>
                <label>Account type<input aria-label="Account type" name="type" placeholder="cash, broker, wallet, pension" defaultValue="cash" required/></label>
                <label>Base currency<input aria-label="Base currency" name="currency" placeholder="EUR" defaultValue="EUR" required/></label>
                <button>Add manual account</button>
              </form><p className="muted">Use this for banks, brokers, pensions, Fidelity, IBKR, cash envelopes, or anything not connected yet.</p></article>
              <article className="panel card warning"><h2>Add crypto public address</h2><form action="/api/crypto-address" method="post"><select aria-label="Crypto network" name="chain" defaultValue="ethereum"><option value="bitcoin">Bitcoin</option><option value="ethereum">Ethereum</option><option value="solana">Solana</option><option value="sui">Sui</option></select><input name="address" placeholder="Public address only" required/><button>Add crypto public address</button></form><p className="muted">Public addresses only. BTC, ETH/ERC-20, SOL, and SUI reads are read-only. Never enter private keys, seed phrases, or signing keys.</p></article>
              <article className="panel card"><h2>Add manual asset</h2><form action={addManualAsset}>
                <select aria-label="Asset account" name="accountId"><option value="">No account / free text below</option>{accountOptions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.provider.name}</option>)}</select>
                <input name="accountName" placeholder="Account name if not listed"/><input name="name" placeholder="Name" required/><select name="assetClass" defaultValue="FUND"><option>CASH</option><option>CRYPTO</option><option>EQUITY</option><option>FUND</option><option>BOND</option><option>REAL_ESTATE</option><option>COMMODITY</option><option>OTHER</option></select><input name="currency" placeholder="Currency" defaultValue="EUR" required/><input name="quantity" type="number" step="any" placeholder="Quantity" required/><input name="unitPrice" type="number" step="any" placeholder="Unit price" required/><button>Add manual asset</button></form></article>
              <article className="panel card"><h2>Add manual liability</h2><form action={addManualLiability}>
                <select aria-label="Liability account" name="accountId"><option value="">No account / free text below</option>{accountOptions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.provider.name}</option>)}</select>
                <input name="accountName" placeholder="Account name if not listed"/><input name="name" placeholder="Name" required/><input name="currency" placeholder="Currency" defaultValue="EUR" required/><input name="amount" type="number" step="any" placeholder="Amount" required/><button>Add manual liability</button></form></article>
              <article className="panel card"><h2>Add manual cash/bank balance</h2><form action={addManualCash}>
                <select aria-label="Cash account" name="accountId"><option value="">No account / free text below</option>{accountOptions.map(a => <option key={a.id} value={a.id}>{a.name} · {a.provider.name}</option>)}</select>
                <input name="accountName" placeholder="Account name if not listed"/><input name="name" placeholder="Cash / bank balance name" required/><input name="currency" placeholder="Currency" defaultValue="EUR" required/><input name="unitPrice" type="number" step="any" placeholder="Balance" required/><button>Add manual cash balance</button></form></article>
            </div></section>

            <section className="dashboard-grid tables-grid"><article className="panel"><h2>Manual assets table</h2>{manualAssets.map(a => <p key={a.id}>{a.name}: {String(a.quantity)} × {String(a.unitPrice)} {a.currency} · {a.accountName ?? 'No account'}</p>)}</article><article className="panel"><h2>Manual liabilities table</h2>{manualLiabilities.map(l => <p key={l.id}>{l.name}: {String(l.amount)} {l.currency} · {l.accountName ?? 'No account'}</p>)}</article><article className="panel"><h2>Portfolio snapshots table</h2>{snapshots.map(s => <p key={s.id}>{s.capturedAt.toISOString()} · {money(Number(s.totalNetWorth), s.currency)}</p>)}</article></section>
            <section id="audit-log" className="panel audit-panel"><h2>Recent audit log</h2>{audits.map(a => <p key={a.id}>{a.createdAt.toISOString()} · {a.action} · {a.safeMetadataJson}</p>)}</section></div>
        </div>
      </div>
    </aside>
  </>;
}
