# Reddit Market Intel — Vercel Deployment

Deploy this to Vercel via GitHub and access your dashboard from anywhere.

## Deployment Steps

### 1. Create a GitHub Repository

Go to [github.com/new](https://github.com/new) and create a new repo called `reddit-market-intel` (public or private — your choice).

### 2. Push This Code to GitHub

Open Terminal on your Mac:

```bash
cd ~/Downloads/reddit-market-intel-vercel

git init
git add .
git commit -m "Initial commit — Reddit Market Intel Dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/reddit-market-intel.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### 3. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click **"Add New Project"**
3. Select your `reddit-market-intel` repository
4. Leave all settings as default — Vercel auto-detects the config
5. Click **"Deploy"**
6. Wait ~30 seconds. Done.

Vercel gives you a URL like `https://reddit-market-intel-yourname.vercel.app`

That's your live dashboard. Open it from any device, any browser.

### 4. (Optional) Custom Domain

In Vercel dashboard → Settings → Domains, you can add a custom domain if you have one.

## How It Works on Vercel

```
You open your-app.vercel.app
        ↓
Frontend loads (public/index.html — served as static file)
        ↓
Dashboard calls /api/fetch
        ↓
Vercel runs api/fetch.js as a serverless function
        ↓
Function searches Reddit's public JSON with all keywords
        ↓
Scores, clusters, and returns processed posts
        ↓
Vercel caches the response for 5 minutes (edge cache)
        ↓
Dashboard renders everything
```

**No server to manage. No costs (Vercel free tier is plenty). Auto-scales.**

## File Structure

```
reddit-market-intel-vercel/
├── api/
│   ├── search.js      → Serverless: Reddit search proxy
│   └── fetch.js       → Serverless: Full fetch + score pipeline
├── public/
│   └── index.html     → Complete dashboard UI
├── vercel.json        → Routing config
├── package.json       → Project metadata
├── .gitignore         → Git ignore rules
└── README.md          → This file
```

## Updating Keywords / Config

To change keywords, subreddits, or scoring:

1. Edit `api/fetch.js` — the keywords, clusters, and signals are defined at the top
2. Commit and push to GitHub
3. Vercel auto-deploys in ~15 seconds

## Limits

- **Vercel free tier**: 100GB bandwidth/month, 100 hours serverless — way more than you'll ever use
- **Reddit rate limits**: ~10 requests/min unauthenticated. The function spaces requests 1.5s apart
- **Serverless timeout**: Vercel free tier allows 10 seconds per function. Quick mode (10 keywords) completes well within this. For full fetches, consider upgrading to Pro ($20/mo) which gives 60 second timeout.

## Troubleshooting

**Dashboard loads but no posts:**
- The serverless function may have timed out. Click Refresh.
- Check Vercel dashboard → Functions tab for error logs.

**"502 Bad Gateway":**
- Reddit may be rate-limiting. Wait 60 seconds and retry.

**Want to run locally too?**
```bash
npm i -g vercel
vercel dev
```
This runs the same setup locally at `localhost:3000`.
