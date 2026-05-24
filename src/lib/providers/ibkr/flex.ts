import type { NormalizedHolding } from '@/lib/portfolio/types';

const FLEX_BASE_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';

export type FlexUrlInput = { token: string; queryId: string; referenceCode?: string; version?: number };
export type FlexSendResult = { status: 'Success'; referenceCode: string } | { status: 'Fail'; errorCode?: string; errorMessage?: string };
export type IbkrCashBalance = { account: string; currency: string; balance: number };
export type ParsedIbkrFlexStatement = { accountId: string; cashBalances: IbkrCashBalance[]; holdings: NormalizedHolding[] };

function decodeXml(value: string): string {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
}

function tagValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : undefined;
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g)) {
    out[match[1]] = decodeXml(match[2]);
  }
  return out;
}

function tags(xml: string, name: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const match of xml.matchAll(new RegExp(`<${name}\\b([^>]*)/?>`, 'gi'))) {
    out.push(attributes(match[0]));
  }
  return out;
}

function n(value: string | undefined): number {
  const parsed = Number(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function assetClassFromIbkr(category?: string): NormalizedHolding['assetClass'] {
  const upper = (category ?? '').toUpperCase();
  if (upper.includes('BOND')) return 'BOND';
  if (upper.includes('FUND')) return 'FUND';
  if (upper.includes('CASH')) return 'CASH';
  if (upper.includes('OPT') || upper.includes('FUT') || upper.includes('STK')) return 'EQUITY';
  return 'OTHER';
}

export function buildFlexUrls(input: FlexUrlInput) {
  const version = input.version ?? 3;
  const send = new URL(`${FLEX_BASE_URL}/SendRequest`);
  send.searchParams.set('t', input.token);
  send.searchParams.set('q', input.queryId);
  send.searchParams.set('v', String(version));
  const statement = new URL(`${FLEX_BASE_URL}/GetStatement`);
  statement.searchParams.set('t', input.token);
  statement.searchParams.set('q', input.referenceCode ?? '');
  statement.searchParams.set('v', String(version));
  return { sendRequest: send.toString(), getStatement: statement.toString() };
}

export function parseFlexSendResponse(xml: string): FlexSendResult {
  const status = tagValue(xml, 'Status');
  if (status === 'Success') {
    const referenceCode = tagValue(xml, 'ReferenceCode');
    if (!referenceCode) return { status: 'Fail', errorMessage: 'Missing ReferenceCode in IBKR Flex response' };
    return { status: 'Success', referenceCode };
  }
  return { status: 'Fail', errorCode: tagValue(xml, 'ErrorCode'), errorMessage: tagValue(xml, 'ErrorMessage') };
}

export function parseIbkrFlexStatement(xml: string): ParsedIbkrFlexStatement {
  const statementAttrs = tags(xml, 'FlexStatement')[0] ?? {};
  const accountId = statementAttrs.accountId ?? 'IBKR';
  const cashBalances = tags(xml, 'CashReportCurrency')
    .map(row => ({ account: accountId, currency: row.currency ?? 'USD', balance: n(row.total ?? row.endingCash ?? row.settledCash) }))
    .filter(row => row.balance !== 0);
  const holdings = tags(xml, 'OpenPosition').map(row => {
    const quantity = n(row.position ?? row.quantity);
    const unitPrice = n(row.markPrice ?? row.closePrice);
    const marketValue = n(row.positionValue ?? row.value);
    const costBasisPrice = row.costBasisPrice ? n(row.costBasisPrice) : undefined;
    return {
      name: row.description || row.symbol || 'IBKR position',
      symbol: row.symbol,
      provider: 'Interactive Brokers',
      account: row.accountId || accountId,
      assetClass: assetClassFromIbkr(row.assetCategory),
      currency: row.currency ?? 'USD',
      quantity,
      unitPrice,
      marketValue: marketValue || quantity * unitPrice,
      costBasis: costBasisPrice === undefined ? undefined : quantity * costBasisPrice,
      unrealizedPnl: row.fifoPnlUnrealized ? n(row.fifoPnlUnrealized) : undefined,
      lastUpdatedAt: new Date().toISOString()
    } satisfies NormalizedHolding;
  }).filter(row => row.quantity !== 0);
  return { accountId, cashBalances, holdings };
}

export function redactIbkrSecrets<T extends Record<string, unknown>>(metadata: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => /token|queryId/i.test(key) ? [key, '[REDACTED]'] : [key, value]));
}

export async function fetchIbkrFlexStatement(input: { token: string; queryId: string; fetchFn?: typeof fetch }): Promise<string> {
  const fetcher = input.fetchFn ?? fetch;
  const urls = buildFlexUrls(input);
  const sendResponse = await fetcher(urls.sendRequest, { headers: { accept: 'application/xml,text/xml' } });
  if (!sendResponse.ok) throw new Error(`IBKR SendRequest failed: ${sendResponse.status}`);
  const sendXml = await sendResponse.text();
  const parsed = parseFlexSendResponse(sendXml);
  if (parsed.status === 'Fail') throw new Error(`IBKR Flex failed: ${parsed.errorCode ?? 'unknown'} ${parsed.errorMessage ?? ''}`.trim());
  const statementUrl = buildFlexUrls({ ...input, referenceCode: parsed.referenceCode }).getStatement;
  const statementResponse = await fetcher(statementUrl, { headers: { accept: 'application/xml,text/xml' } });
  if (!statementResponse.ok) throw new Error(`IBKR GetStatement failed: ${statementResponse.status}`);
  return statementResponse.text();
}
