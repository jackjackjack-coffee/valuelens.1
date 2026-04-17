const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const { action, ticker, period } = params;

  const key = process.env.FMP_API_KEY;
  if (!key) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'FMP_API_KEY not set' }) };
  }
  if (!ticker && action !== 'test') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticker required' }) };
  }

  try {
    if (action === 'test') {
      const data = await httpsGet(
        `https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=${key}`
      );
      const ok = data && data[0] && data[0].symbol === 'AAPL';
      return { statusCode: 200, headers, body: JSON.stringify({ ok }) };
    }

    if (action === 'history') {
      const from = new Date();
      if (period === '1m') from.setMonth(from.getMonth() - 1);
      else if (period === '3m') from.setMonth(from.getMonth() - 3);
      else from.setFullYear(from.getFullYear() - 1);
      const fromStr = from.toISOString().split('T')[0];
      const data = await httpsGet(
        `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?from=${fromStr}&apikey=${key}`
      );
      return {
        statusCode: 200, headers,
        body: JSON.stringify(data.historical ? data.historical.reverse() : [])
      };
    }

    const [profile, metrics, income, cash] = await Promise.all([
      httpsGet(`https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${key}`),
      httpsGet(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${ticker}?apikey=${key}`),
      httpsGet(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${key}`),
      httpsGet(`https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?limit=1&apikey=${key}`)
    ]);

    if (!profile || !profile[0]) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'ticker not found' }) };
    }

    const p = profile[0];
    const m = metrics[0] || {};
    const ic = income[0] || {};
    const cf = cash[0] || {};

    const shares = p.sharesOutstanding ? p.sharesOutstanding / 1e6 : 0;
    const fcf = cf.freeCashFlow ? cf.freeCashFlow / 1e6 : 0;
    const debt = (ic.totalDebt || 0) / 1e6 - (p.cash || 0) / 1e6;

    const result = {
      name: p.companyName || ticker,
      price: p.price || 0,
      eps: p.eps || 0,
      div: p.lastDiv || 0,
      fcf: Math.abs(fcf),
      shares,
      debt,
      beta: p.beta || 1.2,
      sector: p.sector || '',
      industry: p.industry || '',
      g1: Math.min(Math.max((m.revenueGrowthTTM || 0) * 100, 2), 25) || 8,
      g2: Math.min(Math.max((m.revenueGrowthTTM || 0) * 50, 2), 15) || 5,
      tg: 2.5, wacc: 9, fcfm: 22,
      perT: Math.min(Math.max(m.peRatioTTM || 25, 10), 80),
      perG: 10,
      evM: Math.min(Math.max(m.evToEbitda || 15, 5), 50),
      evMg: 30, grG: 8, grY: 4.5, ddmG: 5, ddmR: 8,
      fromApi: true,
      fetchedAt: Date.now()
    };

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
