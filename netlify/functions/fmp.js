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
  const key = process.env.AV_API_KEY;

  if (!key) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AV_API_KEY not set' }) };
  }

  try {
    if (action === 'test') {
      const data = await httpsGet(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${key}`
      );
      const ok = data && data['Global Quote'] && data['Global Quote']['05. price'];
      return { statusCode: 200, headers, body: JSON.stringify({ ok: !!ok }) };
    }

    if (action === 'history') {
      const size = period === '1m' ? 'compact' : 'full';
      const data = await httpsGet(
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=${size}&apikey=${key}`
      );
      const ts = data['Time Series (Daily)'];
      if (!ts) return { statusCode: 200, headers, body: JSON.stringify([]) };

      const days = period === '1m' ? 30 : period === '3m' ? 90 : 365;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = Object.entries(ts)
        .filter(([date]) => new Date(date) >= cutoff)
        .map(([date, v]) => ({ date, close: parseFloat(v['4. close']) }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    if (!ticker) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticker required' }) };
    }

    const [quoteData, overviewData] = await Promise.all([
      httpsGet(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${key}`),
      httpsGet(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${key}`)
    ]);

    const quote = quoteData['Global Quote'];
    const ov = overviewData;

    if (!quote || !quote['05. price']) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'ticker not found' }) };
    }

    const price = parseFloat(quote['05. price']) || 0;
    const eps = parseFloat(ov['EPS']) || 0;
    const div = parseFloat(ov['DividendPerShare']) || 0;
    const beta = parseFloat(ov['Beta']) || 1.2;
    const shares = parseFloat(ov['SharesOutstanding']) / 1e6 || 0;
    const pe = parseFloat(ov['PERatio']) || 25;
    const evEbitda = parseFloat(ov['EVToEBITDA']) || 15;
    const revenueGrowth = parseFloat(ov['QuarterlyRevenueGrowthYOY']) || 0.08;

    const result = {
      name: ov['Name'] || ticker,
      price,
      eps,
      div,
      fcf: Math.abs(parseFloat(ov['OperatingCashflowTTM']) / 1e6) || 0,
      shares,
      debt: (parseFloat(ov['TotalDebt']) - parseFloat(ov['CashAndCashEquivalentsAtCarryingValue'])) / 1e6 || 0,
      beta,
      sector: ov['Sector'] || '',
      industry: ov['Industry'] || '',
      g1: Math.min(Math.max(revenueGrowth * 100, 2), 25) || 8,
      g2: Math.min(Math.max(revenueGrowth * 50, 2), 15) || 5,
      tg: 2.5, wacc: 9, fcfm: 22,
      perT: Math.min(Math.max(pe, 10), 80),
      perG: 10,
      evM: Math.min(Math.max(evEbitda, 5), 50),
      evMg: 30, grG: 8, grY: 4.5, ddmG: 5, ddmR: 8,
      fromApi: true,
      fetchedAt: Date.now()
    };

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
