// ─── VERCEL SERVERLESS FUNCTION: Full Fetch Pipeline ────────────────────────
// Searches Reddit with all keywords, processes results, and returns scored posts.
// GET /api/fetch?sort=top&time=month&quick=true

const KEYWORDS = {
  "Direct Idea Signals": ["startup idea", "ai startup", "business idea", "saas idea", "app idea", "micro saas"],
  "Problem Signals": ["I wish there was", "someone should build", "why isn't there", "I'd pay for", "frustrated with", "looking for a tool"],
  "Validation Signals": ["validate my idea", "roast my startup", "need beta testers", "looking for feedback"],
  "Market Gap Signals": ["alternative to", "open source alternative", "cheaper than", "replacement for"],
};

const CLUSTERS = [
  { name: "AI/Automation Tools", terms: ["ai ", "artificial intelligence", "machine learning", "automat", "chatgpt", "llm", "gpt", "neural", "nlp"] },
  { name: "Developer Tools", terms: ["developer", "dev tool", "api", "sdk", "open source", "github", "code", "programming", "i18n"] },
  { name: "Finance/Fintech", terms: ["fintech", "finance", "payment", "invoice", "banking", "expense", "tax", "accounting", "invest"] },
  { name: "Health & Wellness", terms: ["health", "fitness", "wellness", "workout", "medical", "wearable", "bloodwork", "supplement", "gym"] },
  { name: "Education/Learning", terms: ["education", "learning", "study", "course", "quiz", "teach", "tutor", "student"] },
  { name: "Creator Economy", terms: ["creator", "youtube", "content", "social media", "influencer", "podcast", "newsletter", "social proof"] },
  { name: "SMB/Operations", terms: ["small business", "smb", "crm", "warehouse", "inventory", "operations", "service business", "agency"] },
  { name: "Marketplace/Platform", terms: ["marketplace", "platform", "matching", "connect", "freelancer", "co-founder"] },
  { name: "Productivity", terms: ["productivity", "project management", "scheduling", "calendar", "meeting", "notion", "airtable", "task", "jira"] },
  { name: "Data & Analytics", terms: ["analytics", "data", "intelligence", "dashboard", "insights", "monitoring", "competitive", "tracking"] },
];

const POS_SIGNALS = ["i'd pay", "shut up and take my money", "would pay", "need this", "please build", "take my money", "game changer", "brilliant", "love this", "great idea", "underserved", "huge opportunity"];
const NEG_SIGNALS = ["already exists", "been done", "won't work", "bad idea", "oversaturated", "too crowded", "dead market"];
const COMP_SIGNALS = ["already exists", "competitor", "similar to", "alternative", "but better", "does this but", "currently using"];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { sort = "top", time = "month", quick = "true" } = req.query;
    const isQuick = quick === "true";

    // Build keyword list
    let searches = [];
    for (const [category, keywords] of Object.entries(KEYWORDS)) {
      for (const keyword of keywords) {
        searches.push({ keyword, category });
      }
    }

    // Quick mode: limit keywords
    if (isQuick) searches = searches.slice(0, 10);

    const allPosts = new Map();
    const errors = [];
    let requestCount = 0;

    for (const { keyword, category } of searches) {
      try {
        const params = new URLSearchParams({
          q: keyword,
          sort,
          t: time,
          limit: isQuick ? "15" : "25",
          type: "link",
        });

        const response = await fetch(`https://www.reddit.com/search.json?${params}`, {
          headers: { "User-Agent": "RedditMarketIntel/2.0 (personal research tool)" },
        });

        if (response.status === 429) {
          await sleep(10000);
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const posts = data?.data?.children || [];

        for (const raw of posts) {
          if (raw.kind !== "t3") continue;
          const d = raw.data;
          if (allPosts.has(d.id)) continue;

          const text = `${d.title} ${d.selftext || ""}`.toLowerCase();

          // Sentiment
          let posH = 0, negH = 0, hasComp = false;
          POS_SIGNALS.forEach(s => { if (text.includes(s)) posH++; });
          NEG_SIGNALS.forEach(s => { if (text.includes(s)) negH++; });
          COMP_SIGNALS.forEach(s => { if (text.includes(s)) hasComp = true; });
          const tot = posH + negH;
          let sent = tot === 0 ? ((d.upvote_ratio || 0.5) >= 0.7 ? 0.65 : 0.45) : Math.min(0.95, Math.max(0.15, posH / tot));
          if ((d.upvote_ratio || 0.5) >= 0.9) sent = Math.min(0.95, sent + 0.1);

          // Cluster
          let cluster = "Other";
          for (const cl of CLUSTERS) {
            if (cl.terms.some(t => text.includes(t))) { cluster = cl.name; break; }
          }

          // Build post
          const post = {
            id: d.id,
            title: d.title,
            subreddit: `r/${d.subreddit}`,
            author: `u/${d.author}`,
            date: new Date(d.created_utc * 1000).toISOString().split("T")[0],
            upvotes: d.ups || d.score || 0,
            comments: d.num_comments || 0,
            url: `https://reddit.com${d.permalink}`,
            snippet: d.selftext ? d.selftext.substring(0, 250) + (d.selftext.length > 250 ? "..." : "") : "",
            sentimentPositive: Math.round(sent * 100) / 100,
            hasCompetitors: hasComp,
            cluster,
            category,
            keywordMatch: keyword,
          };

          // Score
          const up = Math.min(post.upvotes / 500, 1) * 30;
          const co = Math.min(post.comments / 100, 1) * 25;
          const se = post.sentimentPositive * 20;
          const days = (Date.now() - new Date(post.date).getTime()) / 86400000;
          const re = Math.max(0, 1 - days / 365) * 15;
          const cp = post.hasCompetitors ? 5 : 10;
          post.validationScore = Math.round(up + co + se + re + cp);

          allPosts.set(d.id, post);
        }

        requestCount++;

        // Rate limit: wait between requests
        if (requestCount < searches.length) {
          await sleep(1500);
        }

      } catch (err) {
        errors.push({ keyword, error: err.message });
      }
    }

    const results = Array.from(allPosts.values())
      .sort((a, b) => b.validationScore - a.validationScore)
      .slice(0, 500);

    // Cache on Vercel edge for 5 minutes
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

    return res.status(200).json({
      posts: results,
      meta: {
        totalFetched: results.length,
        keywordsSearched: requestCount,
        errors: errors.length,
        fetchedAt: new Date().toISOString(),
        sort,
        time,
        fromCache: false,
      },
    });

  } catch (err) {
    return res.status(500).json({ error: "Fetch pipeline failed", details: err.message });
  }
}
