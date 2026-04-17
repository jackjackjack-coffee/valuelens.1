const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('RAW RESPONSE:', data.substring(0, 200));
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

  const params = event.queryStringParameters || {};
  const { action, ticker } = params;
  const key = process.env.FMP_API_KEY;

  console.log('ACTION:', action, 'TICKER:', ticker, 'KEY EXISTS:', !!key, 'KEY PREFIX:', key ? key.substring(0,4) : 'none');

  try {
    const url = `https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=${key}`;
    console.log('Calling URL:', url.replace(key, 'HIDDEN'));
    const data = await httpsGet(url);
    console.log('RESPONSE TYPE:', typeof data, 'IS ARRAY:', Array.isArray(data), 'LENGTH:', data?.length);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: !!(data && data[0]), data: data }) };
  } catch(e) {
    console.log('ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
