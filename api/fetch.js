// ─── VERCEL SERVERLESS FUNCTION: Full Fetch Pipeline ────────────────────────
// Optimized for Vercel free tier (10 second timeout)
// Searches Reddit with top keywords, scores, and returns processed posts.
// GET /api/fetch?sort=top&time=month

const KEYWORDS = [
  { keyword: "startup idea", category: "Direct Idea Signals" },
  { keyword: "someone should build", category: "Problem Signals" },
  { keyword: "I wish there was", category: "Problem Signals" },
  { keyword: "I'd pay for", category: "Problem Signals" },
  { keyword: "saas idea", category: "Direct Idea Signals" },
  { keyword: "alternative to", category: "Market Gap Signals" },
];

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { sort = "top", time = "month" } = req.query;

    // Fetch ALL keywords in parallel (no sequential delays — much faster)
    const fetchPromises = KEYWORDS.map(async ({ keyword, category }) => {
      try {
        const params = new URLSearchParams({
          q: keyword, sort, t: time, limit: "20", type: "link",
        });

        const response = await fetch(`https://www.reddit.com/search.json?${params}`, {
          headers: { "User-Agent": "RedditMarketIntel/2.0 (personal use)" },
        });

        if (!response.ok) return { posts: [], category, keyword, error: response.status };

        const data = await response.json();
        return {
          posts: data?.data?.children || [],
          category,
          keyword,
          error: null,
        };
      } catch (err) {
        return { posts: [], category, keyword, error: err.message };
      }
    });

    // Wait for all fetches (parallel = fast)
    const results = await Promise.all(fetchPromises);

    // Process all posts
    const allPosts = new Map();
    let errorCount = 0;

    for (const { posts, category, keyword, error } of results) {
      if (error) { errorCount++; continue; }

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
        let sent = tot === 0
          ? ((d.upvote_ratio || 0.5) >= 0.7 ? 0.65 : 0.45)
          : Math.min(0.95, Math.max(0.15, posH / tot));
        if ((d.upvote_ratio || 0.5) >= 0.9) sent = Math.min(0.95, sent + 0.1);

        // Cluster
        let cluster = "Other";
        for (const cl of CLUSTERS) {
          if (cl.terms.some(t => text.includes(t))) { cluster = cl.name; break; }
        }

        const post = {
          id: d.id,
          title: d.title,
          subreddit: `r/${d.subreddit}`,
          author: `u/${d.author}`,
          date: new Date(d.created_utc * 1000).toISOString().split("T")[0],
          upvotes: d.ups || d.score || 0,
          comments: d.num_comments || 0,
          url: `https://reddit.com${d.permalink}`,
          snippet: d.selftext
            ? d.selftext.substring(0, 250) + (d.selftext.length > 250 ? "..." : "")
            : "",
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
    }

    const sorted = Array.from(allPosts.values())
      .sort((a, b) => b.validationScore - a.validationScore)
      .slice(0, 300);

    // Cache on Vercel edge for 5 minutes
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

    return res.status(200).json({
      posts: sorted,
      meta: {
        totalFetched: sorted.length,
        keywordsSearched: KEYWORDS.length,
        errors: errorCount,
        fetchedAt: new Date().toISOString(),
        sort,
        time,
        fromCache: false,
      },
    });

  } catch (err) {
    return res.status(500).json({ error: "Fetch failed", details: err.message });
  }
}
