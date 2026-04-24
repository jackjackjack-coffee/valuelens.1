require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname)));

async function avFetch(url) {
  const fetch = require('node-fetch');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from Alpha Vantage`);
  return res.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/fmp', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/json');

  const key = process.env.AV_API_KEY;
  if (!key) return res.status(500).json({ error: 'AV_API_KEY not set in .env file' });

  const action = req.query.action || '';
  const ticker = (req.query.ticker || '').toUpperCase().trim();
  const period = req.query.period || '3m';

  try {
    // Connection test
    if (action === 'test') {
      const data = await avFetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${key}`
      );
      const ok = !!(data?.['Global Quote']?.['05. price']);
      return res.json({ ok });
    }

    // Price history
    if (action === 'history') {
      if (!ticker) return res.status(400).json({ error: 'ticker required' });
      const outputsize = period === '1m' ? 'compact' : 'full';
      const data = await avFetch(
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=${outputsize}&apikey=${key}`
      );
      const ts = data?.['Time Series (Daily)'];
      if (!ts) return res.json([]);
      const days = period === '1m' ? 30 : period === '3m' ? 90 : 365;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const result = Object.entries(ts)
        .filter(([date]) => new Date(date) >= cutoff)
        .map(([date, v]) => ({ date, close: parseFloat(v['4. close']) }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      return res.json(result);
    }

    // Full fundamentals
    if (!ticker) return res.status(400).json({ error: 'ticker required' });

    console.log(`[MyTrade] Fetching ${ticker}...`);
    const quoteData = await avFetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${key}`
    );

    const quote = quoteData?.['Global Quote'];
    if (!quote?.['05. price']) {
      if (quoteData?.['Note'] || quoteData?.['Information'])
        return res.status(429).json({ error: 'Rate limit reached. Wait 1 minute and try again.' });
      return res.status(404).json({ error: 'Ticker not found' });
    }

    await sleep(300);
    const overviewData = await avFetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${key}`
    );

    await sleep(300);
    const cashFlowData = await avFetch(
      `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${ticker}&apikey=${key}`
    );

    const ov = overviewData || {};
    const cf = cashFlowData?.annualReports?.[0] || {};

    const price    = parseFloat(quote['05. price'])               || 0;
    const eps      = parseFloat(ov['EPS'])                        || 0;
    const div      = parseFloat(ov['DividendPerShare'])           || 0;
    const beta     = parseFloat(ov['Beta'])                       || 1.2;
    const shares   = (parseFloat(ov['SharesOutstanding']) / 1e6) || 0;
    const pe       = parseFloat(ov['PERatio'])                    || 25;
    const evEbitda = parseFloat(ov['EVToEBITDA'])                 || 15;

    const revGrowthRaw = parseFloat(ov['QuarterlyRevenueGrowthYOY']) || 0.08;
    const revGrowthPct = Math.abs(revGrowthRaw) < 2 ? revGrowthRaw * 100 : revGrowthRaw;

    const operatingCF = parseFloat(cf['operatingCashflow'])       || 0;
    const capex       = Math.abs(parseFloat(cf['capitalExpenditures']) || 0);
    const fcf         = Math.max((operatingCF - capex) / 1e6, 0);

    const longTermDebt  = parseFloat(cf['longTermDebt'])          || 0;
    const shortTermDebt = parseFloat(cf['shortLongTermDebtTotal']) || 0;
    const cashAndEq     = parseFloat(ov['CashAndCashEquivalentsAtCarryingValue']) || 0;
    const netDebt       = Math.max(longTermDebt + shortTermDebt - cashAndEq, 0) / 1e6;

    const g1 = Math.min(Math.max(revGrowthPct, 2), 30);
    const g2 = Math.min(Math.max(revGrowthPct * 0.6, 2), 20);

    console.log(`[MyTrade] OK — ${ticker} $${price}`);

    return res.json({
      name: ov['Name'] || ticker,
      sector: ov['Sector'] || '',
      industry: ov['Industry'] || '',
      price, eps, div, fcf, shares,
      debt: netDebt, beta, g1, g2,
      tg: 2.5, wacc: 9, fcfm: 22,
      perT: Math.min(Math.max(pe, 10), 80),
      perG: Math.round(g1),
      evM: Math.min(Math.max(evEbitda, 5), 50),
      evMg: 30,
      grG: Math.round(g1 * 0.8),
      grY: 4.5,
      ddmG: div > 0 ? Math.min(g1 * 0.5, 8) : 0,
      ddmR: 8,
      fromApi: true,
      fetchedAt: Date.now(),
    });

  } catch (err) {
    console.error('[MyTrade] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅  MyTrade running at http://localhost:${PORT}`);
  console.log(`    AV_API_KEY: ${process.env.AV_API_KEY ? '✓ loaded' : '✗ NOT SET — add it to your .env file'}\n`);
});
