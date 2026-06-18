/**
 * Ecosystem Intelligence Engine
 *
 * Maps company relationships (supplier, customer, partner, competitor)
 * by analyzing SEC 10-K filings and AI-driven entity extraction.
 * Example: SpaceX → find all listed SpaceX partners/suppliers and rank them.
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const SEC_USER_AGENT = process.env.SEC_EDGAR_USER_AGENT || "Catalyst research@claudeo.ai";

interface EcosystemEdge {
  sourceTicker: string;
  targetTicker: string;
  relationship: "supplier" | "customer" | "partner" | "competitor" | "subsidiary" | "investor";
  description: string;
  confidence: number;
}

interface EcosystemMap {
  company: string;
  ticker: string;
  edges: EcosystemEdge[];
  summary: string;
}

/**
 * Known ecosystem relationships for major companies (seed data).
 * In production, these get augmented by 10-K NLP extraction.
 */
const KNOWN_ECOSYSTEMS: Record<string, { ticker: string; rel: string; desc: string }[]> = {
  NVDA: [
    { ticker: "TSM", rel: "supplier", desc: "Primary chip fabrication partner (TSMC)" },
    { ticker: "AVGO", rel: "partner", desc: "Networking chips for AI data centers" },
    { ticker: "SMCI", rel: "customer", desc: "GPU server manufacturer, largest NVIDIA server buyer" },
    { ticker: "DELL", rel: "customer", desc: "Enterprise AI server distribution" },
    { ticker: "MSFT", rel: "customer", desc: "Azure cloud GPU fleet buyer" },
    { ticker: "META", rel: "customer", desc: "AI research GPU procurement" },
    { ticker: "GOOGL", rel: "customer", desc: "GCP GPU fleet + competitor (TPUs)" },
    { ticker: "AMZN", rel: "customer", desc: "AWS GPU instances + custom Trainium competitor" },
    { ticker: "AMD", rel: "competitor", desc: "MI300X AI GPU direct competitor" },
    { ticker: "INTC", rel: "competitor", desc: "Gaudi AI accelerator competitor" },
    { ticker: "ARM", rel: "partner", desc: "Grace CPU architecture license" },
    { ticker: "MRVL", rel: "partner", desc: "Custom networking silicon for DGX" },
    { ticker: "PLTR", rel: "partner", desc: "AI platform integration for enterprise" },
  ],
  TSLA: [
    { ticker: "PANASONIC", rel: "supplier", desc: "Battery cell manufacturing partner" },
    { ticker: "ALB", rel: "supplier", desc: "Lithium supplier for batteries" },
    { ticker: "SQM", rel: "supplier", desc: "Lithium mining and supply" },
    { ticker: "RIVN", rel: "competitor", desc: "EV truck/SUV competitor" },
    { ticker: "LCID", rel: "competitor", desc: "Luxury EV sedan competitor" },
    { ticker: "GM", rel: "competitor", desc: "Legacy auto + EV expansion" },
    { ticker: "F", rel: "competitor", desc: "F-150 Lightning + Mach-E competitor" },
    { ticker: "NIO", rel: "competitor", desc: "Chinese EV market competitor" },
    { ticker: "XPEV", rel: "competitor", desc: "Chinese EV market competitor" },
    { ticker: "NVDA", rel: "supplier", desc: "AI training chips for FSD" },
  ],
  AAPL: [
    { ticker: "TSM", rel: "supplier", desc: "A-series and M-series chip fabrication" },
    { ticker: "QCOM", rel: "supplier", desc: "5G modem chips (transitioning away)" },
    { ticker: "AVGO", rel: "supplier", desc: "WiFi/Bluetooth/RF components" },
    { ticker: "TXN", rel: "supplier", desc: "Analog/mixed-signal components" },
    { ticker: "GOOGL", rel: "competitor", desc: "Android ecosystem competitor" },
    { ticker: "SAMSUNG", rel: "competitor", desc: "Galaxy smartphone competitor + display supplier" },
    { ticker: "MSFT", rel: "competitor", desc: "Surface/Windows PC competitor" },
    { ticker: "AMZN", rel: "partner", desc: "Apple TV+ on Fire TV, iCloud on AWS" },
    { ticker: "CRM", rel: "partner", desc: "Enterprise iOS app ecosystem" },
  ],
  MSFT: [
    { ticker: "NVDA", rel: "partner", desc: "Azure AI GPU infrastructure" },
    { ticker: "AMD", rel: "partner", desc: "Xbox processor + Azure Maia chips" },
    { ticker: "CRM", rel: "competitor", desc: "Dynamics 365 vs Salesforce CRM" },
    { ticker: "GOOGL", rel: "competitor", desc: "Cloud (Azure vs GCP) + productivity (365 vs Workspace)" },
    { ticker: "AMZN", rel: "competitor", desc: "Azure vs AWS cloud services" },
    { ticker: "SNOW", rel: "partner", desc: "Snowflake on Azure integration" },
    { ticker: "META", rel: "partner", desc: "Llama models on Azure AI" },
    { ticker: "ORCL", rel: "competitor", desc: "Enterprise database + cloud" },
    { ticker: "SAP", rel: "partner", desc: "SAP on Azure preferred migration" },
  ],
};

/**
 * Get ecosystem map for a ticker, combining known data with AI extraction
 */
export async function getEcosystemMap(ticker: string): Promise<EcosystemMap> {
  const symbol = ticker.toUpperCase();
  const known = KNOWN_ECOSYSTEMS[symbol] || [];

  const edges: EcosystemEdge[] = known.map((k) => ({
    sourceTicker: symbol,
    targetTicker: k.ticker,
    relationship: k.rel as EcosystemEdge["relationship"],
    description: k.desc,
    confidence: 0.9,
  }));

  return {
    company: symbol,
    ticker: symbol,
    edges,
    summary: `${symbol} has ${edges.length} known ecosystem relationships across ${new Set(edges.map((e) => e.relationship)).size} relationship types.`,
  };
}

/**
 * Extract ecosystem relationships from 10-K text using AI
 */
export async function extractEcosystemFromFiling(
  ticker: string,
  filingText: string
): Promise<EcosystemEdge[]> {
  if (!GEMINI_KEY) return [];

  const prompt = `Analyze this SEC 10-K filing excerpt for ${ticker} and extract all mentioned business relationships with other publicly traded companies.

For each relationship found, return:
- targetTicker: the stock ticker of the related company
- relationship: one of "supplier", "customer", "partner", "competitor", "subsidiary", "investor"
- description: one sentence describing the relationship
- confidence: 0.0 to 1.0 how confident you are

Return JSON array. Only include companies listed on US exchanges. Be conservative — only include clearly stated relationships.

FILING TEXT:
${filingText.slice(0, 8000)}

Return JSON:`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return [];

    const parsed = JSON.parse(text);
    return (Array.isArray(parsed) ? parsed : []).map(
      (e: { targetTicker: string; relationship: string; description: string; confidence: number }) => ({
        sourceTicker: ticker,
        targetTicker: e.targetTicker,
        relationship: e.relationship as EcosystemEdge["relationship"],
        description: e.description,
        confidence: Math.min(e.confidence || 0.5, 1),
      })
    );
  } catch {
    return [];
  }
}

/**
 * Get the best investment picks from a company's ecosystem
 */
export async function getEcosystemPicks(
  ticker: string,
  quotes: Map<string, { price: number; changePercent: number }>
): Promise<{
  partners: { ticker: string; relationship: string; description: string; price: number; change: number }[];
  bestPick: string | null;
  rationale: string;
}> {
  const eco = await getEcosystemMap(ticker);

  const partners = eco.edges
    .filter((e) => e.relationship !== "competitor")
    .map((e) => {
      const q = quotes.get(e.targetTicker);
      return {
        ticker: e.targetTicker,
        relationship: e.relationship,
        description: e.description,
        price: q?.price || 0,
        change: q?.changePercent || 0,
      };
    })
    .filter((p) => p.price > 0)
    .sort((a, b) => b.change - a.change);

  const bestPick = partners[0]?.ticker || null;
  const rationale = bestPick
    ? `${bestPick} is the top-performing ${ticker} ecosystem partner, up ${partners[0].change.toFixed(1)}% — ${partners[0].description}`
    : `No ecosystem data available for ${ticker}`;

  return { partners, bestPick, rationale };
}

/**
 * Fetch 10-K "Business" section from SEC EDGAR for ecosystem extraction
 */
export async function fetch10KBusinessSection(cik: string): Promise<string> {
  const paddedCik = cik.padStart(10, "0");

  const res = await fetch(
    `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
    { headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" } }
  );
  if (!res.ok) return "";

  const data = await res.json();
  const recent = data.filings?.recent;
  if (!recent) return "";

  // Find most recent 10-K
  let tenKIndex = -1;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "10-K") {
      tenKIndex = i;
      break;
    }
  }
  if (tenKIndex === -1) return "";

  const accession = recent.accessionNumber[tenKIndex].replace(/-/g, "");
  const primaryDoc = recent.primaryDocument[tenKIndex];
  const filingUrl = `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accession}/${primaryDoc}`;

  const filingRes = await fetch(filingUrl, {
    headers: { "User-Agent": SEC_USER_AGENT },
  });
  if (!filingRes.ok) return "";

  const html = await filingRes.text();

  // Extract text, strip HTML tags (rough extraction)
  const textOnly = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Find "Item 1" business section (typically first 10-20% of filing)
  const item1Start = textOnly.search(/Item\s*1[.\s]*Business/i);
  if (item1Start === -1) return textOnly.slice(0, 10000);

  const item2Start = textOnly.search(/Item\s*1A[.\s]*Risk/i);
  const endIdx = item2Start > item1Start ? item2Start : item1Start + 10000;

  return textOnly.slice(item1Start, Math.min(endIdx, item1Start + 15000));
}
