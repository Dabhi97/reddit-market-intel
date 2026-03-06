// ─── VERCEL SERVERLESS FUNCTION: Reddit Search Proxy ────────────────────────
// Replaces the Express server. Vercel calls this function when
// the frontend hits /api/search
//
// Usage: GET /api/search?q=startup+idea&sort=top&t=month&limit=25

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { q, sort = "top", t = "month", limit = "25", subreddit } = req.query;

    if (!q) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    const base = subreddit
      ? `https://www.reddit.com/r/${subreddit}/search.json`
      : `https://www.reddit.com/search.json`;

    const params = new URLSearchParams({
      q,
      sort,
      t,
      limit,
      restrict_sr: subreddit ? "true" : "false",
      type: "link",
    });

    const url = `${base}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "RedditMarketIntel/2.0 (personal research tool)",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Reddit API error: ${response.status}`,
        retryAfter: response.status === 429 ? 60 : null,
      });
    }

    const data = await response.json();

    // Cache for 5 minutes on Vercel's edge
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch from Reddit", details: err.message });
  }
}
