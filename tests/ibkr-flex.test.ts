import { describe, expect, it } from 'vitest';
import { buildFlexUrls, parseFlexSendResponse, parseIbkrFlexStatement, redactIbkrSecrets } from '@/lib/providers/ibkr/flex';

const sampleStatement = `<?xml version="1.0" encoding="UTF-8"?>
<FlexQueryResponse>
  <FlexStatements>
    <FlexStatement accountId="U1234567" fromDate="20260523" toDate="20260523" period="LastBusinessDay" whenGenerated="20260524;120000">
      <CashReport>
        <CashReportCurrency currency="EUR" total="1000.50" />
        <CashReportCurrency currency="USD" total="250.25" />
      </CashReport>
      <OpenPositions>
        <OpenPosition accountId="U1234567" symbol="VUSA" description="Vanguard S&amp;P 500 UCITS ETF" assetCategory="STK" currency="EUR" position="12" markPrice="90.5" positionValue="1086" fifoPnlUnrealized="86" costBasisPrice="83.3333" conid="123" />
        <OpenPosition accountId="U1234567" symbol="AAPL" description="APPLE INC" assetCategory="STK" currency="USD" position="2" markPrice="200" positionValue="400" fifoPnlUnrealized="50" costBasisPrice="175" conid="265598" />
      </OpenPositions>
    </FlexStatement>
  </FlexStatements>
</FlexQueryResponse>`;

describe('IBKR Flex Web Service helpers', () => {
  it('builds read-only SendRequest and GetStatement URLs without trading endpoints', () => {
    const urls = buildFlexUrls({ token: 'secret-token', queryId: '12345', referenceCode: '999' });
    expect(urls.sendRequest).toContain('/SendRequest');
    expect(urls.sendRequest).toContain('q=12345');
    expect(urls.sendRequest).toContain('t=secret-token');
    expect(urls.getStatement).toContain('/GetStatement');
    expect(urls.getStatement).toContain('q=999');
    expect(`${urls.sendRequest} ${urls.getStatement}`).not.toMatch(/order|trade|iserver/i);
  });

  it('parses SendRequest success and failure responses', () => {
    expect(parseFlexSendResponse('<FlexStatementResponse><Status>Success</Status><ReferenceCode>abc123</ReferenceCode></FlexStatementResponse>')).toEqual({ status: 'Success', referenceCode: 'abc123' });
    expect(parseFlexSendResponse('<FlexStatementResponse><Status>Fail</Status><ErrorCode>1012</ErrorCode><ErrorMessage>Token has expired.</ErrorMessage></FlexStatementResponse>')).toEqual({ status: 'Fail', errorCode: '1012', errorMessage: 'Token has expired.' });
  });

  it('normalizes cash and open positions from Flex XML', () => {
    const parsed = parseIbkrFlexStatement(sampleStatement);
    expect(parsed.accountId).toBe('U1234567');
    expect(parsed.cashBalances).toEqual([
      { account: 'U1234567', currency: 'EUR', balance: 1000.5 },
      { account: 'U1234567', currency: 'USD', balance: 250.25 }
    ]);
    expect(parsed.holdings).toEqual([
      expect.objectContaining({ name: 'Vanguard S&P 500 UCITS ETF', symbol: 'VUSA', provider: 'Interactive Brokers', account: 'U1234567', assetClass: 'EQUITY', currency: 'EUR', quantity: 12, unitPrice: 90.5, marketValue: 1086, unrealizedPnl: 86 }),
      expect.objectContaining({ name: 'APPLE INC', symbol: 'AAPL', currency: 'USD', quantity: 2, marketValue: 400 })
    ]);
  });

  it('redacts token and query id from audit-safe metadata', () => {
    expect(redactIbkrSecrets({ token: 'abc', queryId: '123', accountId: 'U123' })).toEqual({ token: '[REDACTED]', queryId: '[REDACTED]', accountId: 'U123' });
  });
});
