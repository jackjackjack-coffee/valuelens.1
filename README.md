# MyTrade — US Stock Fair Value Analysis

## How to run locally

**Step 1 — Get a free API key**
Go to https://www.alphavantage.co/support/#api-key and sign up (free, instant)

**Step 2 — Create a `.env` file** in this folder:
```
AV_API_KEY=paste_your_key_here
```

**Step 3 — Install and run** (only need to do `npm install` once):
```
npm install
node server.js
```

**Step 4 — Open your browser:**
```
http://localhost:3000
```

That's it! ✅

---

## Notes
- The `.env` file is NOT uploaded to GitHub (it's in .gitignore) — keep your key safe
- Free Alpha Vantage key allows 25 requests/day and 5 requests/minute
- The 7 preset stocks (AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA) work without an API key
