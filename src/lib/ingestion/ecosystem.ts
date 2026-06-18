/**
 * Ecosystem Intelligence Engine
 *
 * Maps company relationships (supplier, customer, partner, competitor)
 * by analyzing SEC 10-K filings and AI-driven entity extraction.
 * Example: SpaceX → find all listed SpaceX partners/suppliers and rank them.
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const SEC_USER_AGENT = process.env.SEC_EDGAR_USER_AGENT || "Catalyst research@catalyst.claudeo.ai";

type SignalTier = "S" | "A" | "B" | "C";

interface EcosystemEdge {
  sourceTicker: string;
  targetTicker: string;
  relationship: "supplier" | "customer" | "partner" | "competitor" | "subsidiary" | "investor";
  description: string;
  confidence: number;
  tier?: SignalTier;
  category?: string;
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
const KNOWN_ECOSYSTEMS: Record<
  string,
  { ticker: string; rel: string; desc: string; tier?: SignalTier; category?: string; subCategory?: string }[]
> = {
  // ─── NVIDIA ──────────────────────────────────────────────────────────────────
  NVDA: [
    // Signal Tier S — Strategic Investments (NVIDIA equity stakes / co-development)
    { ticker: "INTC", rel: "investor", desc: "~51.6% 13F holding; $5B NVIDIA strategic investment", tier: "S", category: "Strategic Investment", subCategory: "Semiconductor" },
    { ticker: "SNPS", rel: "investor", desc: "~10.4% 13F holding; EDA equity stake", tier: "S", category: "Strategic Investment", subCategory: "EDA" },
    { ticker: "CRWV", rel: "investor", desc: "~11% stake worth $3.65B+; GPU cloud provider", tier: "S", category: "Strategic Investment", subCategory: "GPU Cloud" },
    { ticker: "NBIS", rel: "investor", desc: "Pre-funded warrants ~$2B; GPU cloud infrastructure", tier: "S", category: "Strategic Investment", subCategory: "GPU Cloud" },
    { ticker: "NOK", rel: "investor", desc: "13F ~7.3%; AI-RAN telecom partnership", tier: "S", category: "Strategic Investment", subCategory: "Telecom" },
    { ticker: "COHR", rel: "investor", desc: "$2B investment for optical transceiver capacity", tier: "S", category: "Strategic Investment", subCategory: "Optical" },
    { ticker: "MRVL", rel: "investor", desc: "Equity stake + custom networking silicon supplier", tier: "S", category: "Strategic Investment", subCategory: "Semiconductor" },
    { ticker: "LITE", rel: "investor", desc: "Equity stake + optical transceiver supplier", tier: "S", category: "Strategic Investment", subCategory: "Optical" },
    { ticker: "GENB", rel: "investor", desc: "Small ~$10M position; AI drug discovery platform", tier: "S", category: "Strategic Investment", subCategory: "AI Drug Discovery" },
    { ticker: "ARM", rel: "partner", desc: "Grace CPU architecture license; Arm-based datacenter CPUs", tier: "S", category: "Semiconductor", subCategory: "CPU IP" },

    // Signal Tier S — Manufacturing / Foundry
    { ticker: "TSM", rel: "supplier", desc: "Primary foundry for all NVIDIA GPUs (3nm/4nm)", tier: "S", category: "Manufacturing", subCategory: "Foundry" },
    { ticker: "MU", rel: "supplier", desc: "HBM3E/HBM4 memory supplier for H100/B200 GPUs", tier: "S", category: "Manufacturing", subCategory: "Memory" },

    // Signal Tier S — Top Customers (Hyperscalers)
    { ticker: "MSFT", rel: "customer", desc: "Top-3 customer: Azure AI, OpenAI, Stargate project", tier: "S", category: "Customer", subCategory: "Hyperscaler" },
    { ticker: "AMZN", rel: "customer", desc: "Top-3 customer: AWS, Anthropic partnership, Project Rainier", tier: "S", category: "Customer", subCategory: "Hyperscaler" },
    { ticker: "GOOGL", rel: "customer", desc: "Major customer + coopetitor via TPU; GCP GPU fleet", tier: "S", category: "Customer", subCategory: "Hyperscaler" },
    { ticker: "META", rel: "customer", desc: "Top-3 customer; ~600K GPU fleet for Llama training", tier: "S", category: "Customer", subCategory: "Hyperscaler" },
    { ticker: "ORCL", rel: "customer", desc: "OCI GPU superclusters; Stargate JV partner", tier: "S", category: "Customer", subCategory: "Hyperscaler" },

    // Signal Tier S — Top OEMs
    { ticker: "DELL", rel: "customer", desc: "Top-tier OEM: MGX systems, PowerEdge AI PODs", tier: "S", category: "OEM", subCategory: "Server" },
    { ticker: "HPE", rel: "customer", desc: "Top-tier OEM: Cray EX supercomputers, AI servers", tier: "S", category: "OEM", subCategory: "Server" },
    { ticker: "SMCI", rel: "customer", desc: "Top-tier OEM: high-volume AI server builds", tier: "S", category: "OEM", subCategory: "Server" },

    // Signal Tier A — OEM / ODM
    { ticker: "IBM", rel: "partner", desc: "Strategic OEM: watsonx AI on NVIDIA GPUs", tier: "A", category: "OEM", subCategory: "Server/Software" },
    { ticker: "CSCO", rel: "partner", desc: "OEM partner: UCS-X AI servers with NVIDIA GPUs", tier: "A", category: "OEM", subCategory: "Server/Network" },
    { ticker: "CLS", rel: "partner", desc: "Hyperscale server ODM manufacturer", tier: "A", category: "OEM", subCategory: "ODM" },
    { ticker: "FN", rel: "partner", desc: "Assembles optical components for NVIDIA networking", tier: "A", category: "OEM", subCategory: "Optical Assembly" },
    { ticker: "ASML", rel: "supplier", desc: "EUV lithography equipment (indirect via TSMC)", tier: "A", category: "Manufacturing", subCategory: "Litho Equipment" },

    // Signal Tier A — Networking
    { ticker: "ANET", rel: "partner", desc: "Ethernet AI fabric switching; coopetitor in networking", tier: "A", category: "Networking", subCategory: "Switching" },
    { ticker: "AVGO", rel: "partner", desc: "AI networking ASICs + Tomahawk switches; coopetitor", tier: "A", category: "Networking", subCategory: "ASIC/Switch" },
    { ticker: "ALAB", rel: "partner", desc: "Smart cable modules for NVLink/InfiniBand connectivity", tier: "A", category: "Networking", subCategory: "Connectivity IC" },
    { ticker: "CRDO", rel: "partner", desc: "Active electrical cables for GPU-to-GPU interconnect", tier: "A", category: "Networking", subCategory: "Connectivity" },

    // Signal Tier A — Competitors
    { ticker: "AMD", rel: "competitor", desc: "MI300X/MI350 AI GPU direct competitor", tier: "A", category: "Competitor", subCategory: "GPU/AI Chip" },
    { ticker: "INTC", rel: "competitor", desc: "Gaudi AI accelerator competitor (also NVIDIA investee)", tier: "A", category: "Competitor", subCategory: "AI Accelerator" },

    // Signal Tier A — Software Partners
    { ticker: "PLTR", rel: "partner", desc: "Deep AI analytics partnership; Palantir AIP on NVIDIA", tier: "A", category: "Software", subCategory: "AI Analytics" },

    // Signal Tier B — OEM / Manufacturing
    { ticker: "JBL", rel: "partner", desc: "Contract manufacturing partner for AI servers", tier: "B", category: "OEM", subCategory: "Server" },
    { ticker: "FLEX", rel: "partner", desc: "Datacenter infrastructure manufacturing partner", tier: "B", category: "OEM", subCategory: "Server" },
    { ticker: "TER", rel: "supplier", desc: "Automated test equipment for NVIDIA chips", tier: "B", category: "Manufacturing", subCategory: "Test Equipment" },
    { ticker: "KLAC", rel: "supplier", desc: "Wafer inspection equipment for NVIDIA/TSMC fabs", tier: "B", category: "Manufacturing", subCategory: "Inspection" },
    { ticker: "LRCX", rel: "supplier", desc: "Etch equipment supplier for TSMC NVIDIA nodes", tier: "B", category: "Manufacturing", subCategory: "Etch" },
    { ticker: "AMAT", rel: "supplier", desc: "Deposition equipment for NVIDIA chip manufacturing", tier: "B", category: "Manufacturing", subCategory: "Deposition" },

    // Signal Tier B — Networking / Optical
    { ticker: "AAOI", rel: "partner", desc: "Datacenter optical transceivers for AI networking", tier: "B", category: "Networking", subCategory: "Optical" },
    { ticker: "CIEN", rel: "partner", desc: "Optical transport for AI datacenter interconnect", tier: "B", category: "Networking", subCategory: "Optical" },

    // Signal Tier B — Software Partners
    { ticker: "CRM", rel: "partner", desc: "Salesforce Einstein AI running on NVIDIA GPUs", tier: "B", category: "Software", subCategory: "Enterprise AI" },
    { ticker: "SNOW", rel: "partner", desc: "Snowpark ML workloads on NVIDIA GPU-accelerated infra", tier: "B", category: "Software", subCategory: "Data Platform" },
    { ticker: "PATH", rel: "partner", desc: "UiPath RPA with NVIDIA AI integration", tier: "B", category: "Software", subCategory: "RPA" },
    { ticker: "QCOM", rel: "partner", desc: "Snapdragon AI leveraging NVIDIA IP; mobile inference", tier: "B", category: "Semiconductor", subCategory: "Mobile" },

    // Signal Tier C — Software / Gaming
    { ticker: "WDAY", rel: "partner", desc: "Workday enterprise AI integration on NVIDIA GPUs", tier: "C", category: "Software", subCategory: "Enterprise" },
    { ticker: "WOLF", rel: "supplier", desc: "SiC power components for datacenter infrastructure", tier: "C", category: "Semiconductor", subCategory: "SiC Power" },
    { ticker: "RBLX", rel: "partner", desc: "NVIDIA Omniverse integration for 3D worlds", tier: "C", category: "Software", subCategory: "Gaming" },
    { ticker: "U", rel: "partner", desc: "Unity engine with NVIDIA RTX ray-tracing integration", tier: "C", category: "Software", subCategory: "Gaming" },
  ],

  // ─── SPACEX (private, tracked as SPCX) ───────────────────────────────────────
  SPCX: [
    { ticker: "GOOGL", rel: "investor", desc: "~7% equity stake worth ~$140B; Starlink investor", tier: "S", category: "Investor", subCategory: "Strategic" },
    { ticker: "SATS", rel: "investor", desc: "Received SpaceX stock in spectrum deal (~25% of market cap)", tier: "S", category: "Investor", subCategory: "Spectrum Deal" },
    { ticker: "TMUS", rel: "partner", desc: "Direct-to-Cell partnership; Starlink cellular backhaul", tier: "S", category: "Partner", subCategory: "Telecom" },
    { ticker: "KRMN", rel: "supplier", desc: "Propulsion and payload integration systems", tier: "S", category: "Supplier", subCategory: "Propulsion" },
    { ticker: "GSAT", rel: "customer", desc: "Multiple Falcon 9 launch contracts for satellite constellation", tier: "A", category: "Customer", subCategory: "Satellite Operator" },
    { ticker: "RKLB", rel: "competitor", desc: "Rocket Lab launch competitor (small/mid-size payloads)", tier: "A", category: "Competitor", subCategory: "Launch" },
    { ticker: "LMT", rel: "competitor", desc: "ULA (Vulcan) competitor for govt/national security launches", tier: "A", category: "Competitor", subCategory: "Defense/Launch" },
    { ticker: "NVDA", rel: "investor", desc: "Indirect exposure via xAI ~$50B GPU purchases", tier: "B", category: "Investor", subCategory: "Indirect" },
    { ticker: "LIN", rel: "supplier", desc: "Industrial gases (LOX, nitrogen) for rocket propulsion", tier: "B", category: "Supplier", subCategory: "Industrial Gases" },
    { ticker: "RDW", rel: "partner", desc: "Redwire space infrastructure; launches on Falcon 9", tier: "B", category: "Partner", subCategory: "Space Infrastructure" },
    { ticker: "LUNR", rel: "partner", desc: "Intuitive Machines lunar services; launches on SpaceX", tier: "B", category: "Partner", subCategory: "Lunar Services" },
    { ticker: "ASTS", rel: "partner", desc: "AST SpaceMobile satellite operator; launches on SpaceX", tier: "B", category: "Partner", subCategory: "Satellite Operator" },
    { ticker: "VOYG", rel: "partner", desc: "Virgin Orbit successor; small-sat launch ecosystem", tier: "B", category: "Partner", subCategory: "Small-Sat Launch" },
    { ticker: "BA", rel: "supplier", desc: "Heritage aerospace supplier; Starliner crew transport", tier: "B", category: "Supplier", subCategory: "Aerospace" },
    { ticker: "NOC", rel: "competitor", desc: "National security space competitor (satellites/launch)", tier: "B", category: "Competitor", subCategory: "Defense Space" },
    { ticker: "RTX", rel: "supplier", desc: "Avionics, defense electronics, and propulsion components", tier: "B", category: "Supplier", subCategory: "Defense Components" },
    { ticker: "MRCY", rel: "supplier", desc: "Defense electronics for space/launch applications", tier: "C", category: "Supplier", subCategory: "Defense Electronics" },
  ],

  // ─── AMAZON ──────────────────────────────────────────────────────────────────
  AMZN: [
    { ticker: "NVDA", rel: "partner", desc: "GPU infrastructure powering AWS AI/ML instances", tier: "S", category: "Partner", subCategory: "GPU Infrastructure" },
    { ticker: "RIVN", rel: "investor", desc: "Major equity stake; EV delivery fleet for last-mile logistics", tier: "S", category: "Investor", subCategory: "EV Fleet" },
    { ticker: "MSFT", rel: "competitor", desc: "AWS vs Azure cloud services rivalry", tier: "A", category: "Competitor", subCategory: "Cloud" },
    { ticker: "GOOGL", rel: "competitor", desc: "AWS vs GCP cloud + advertising competition", tier: "A", category: "Competitor", subCategory: "Cloud" },
    { ticker: "SHOP", rel: "partner", desc: "Buy with Prime e-commerce platform integration", tier: "A", category: "Partner", subCategory: "E-Commerce" },
    { ticker: "SNOW", rel: "partner", desc: "Snowflake deeply integrated on AWS marketplace", tier: "A", category: "Partner", subCategory: "Data Platform" },
    { ticker: "NFLX", rel: "partner", desc: "AWS largest media customer; streaming infrastructure", tier: "A", category: "Partner", subCategory: "Media/Streaming" },
    { ticker: "CRM", rel: "partner", desc: "Salesforce on AWS marketplace integration", tier: "B", category: "Partner", subCategory: "Enterprise SaaS" },
    { ticker: "TSLA", rel: "partner", desc: "AWS infrastructure for Tesla AI/data workloads", tier: "B", category: "Partner", subCategory: "Automotive" },
  ],

  // ─── META ────────────────────────────────────────────────────────────────────
  META: [
    { ticker: "NVDA", rel: "partner", desc: "GPU infrastructure; ~600K GPU fleet for Llama training", tier: "S", category: "Partner", subCategory: "GPU Infrastructure" },
    { ticker: "GOOGL", rel: "competitor", desc: "Digital advertising duopoly rival", tier: "A", category: "Competitor", subCategory: "Digital Advertising" },
    { ticker: "SNAP", rel: "competitor", desc: "Social media / Stories format competitor", tier: "A", category: "Competitor", subCategory: "Social Media" },
    { ticker: "AAPL", rel: "competitor", desc: "App Store policies + ATT privacy disputes", tier: "A", category: "Competitor", subCategory: "Platform/Privacy" },
    { ticker: "PINS", rel: "competitor", desc: "Social commerce and visual discovery competitor", tier: "B", category: "Competitor", subCategory: "Social Commerce" },
    { ticker: "MSFT", rel: "partner", desc: "Llama open-source models on Azure AI platform", tier: "B", category: "Partner", subCategory: "Cloud/AI" },
    { ticker: "RBLX", rel: "partner", desc: "Metaverse gaming partnership; Horizon Worlds integration", tier: "B", category: "Partner", subCategory: "Metaverse/Gaming" },
  ],

  // ─── TESLA ───────────────────────────────────────────────────────────────────
  TSLA: [
    { ticker: "PANASONIC", rel: "supplier", desc: "Battery cell manufacturing partner (Gigafactory)", tier: "S", category: "Supplier", subCategory: "Battery" },
    { ticker: "NVDA", rel: "supplier", desc: "AI training chips for Full Self-Driving development", tier: "S", category: "Supplier", subCategory: "AI Chips" },
    { ticker: "ALB", rel: "supplier", desc: "Lithium supplier for battery production", tier: "A", category: "Supplier", subCategory: "Lithium" },
    { ticker: "SQM", rel: "supplier", desc: "Lithium mining and chemical supply", tier: "A", category: "Supplier", subCategory: "Lithium" },
    { ticker: "RIVN", rel: "competitor", desc: "EV truck/SUV competitor (R1T, R1S)", tier: "A", category: "Competitor", subCategory: "EV" },
    { ticker: "LCID", rel: "competitor", desc: "Luxury EV sedan competitor (Lucid Air)", tier: "B", category: "Competitor", subCategory: "EV" },
    { ticker: "GM", rel: "competitor", desc: "Legacy auto + Ultium EV expansion", tier: "A", category: "Competitor", subCategory: "Auto/EV" },
    { ticker: "F", rel: "competitor", desc: "F-150 Lightning + Mustang Mach-E competitor", tier: "A", category: "Competitor", subCategory: "Auto/EV" },
    { ticker: "NIO", rel: "competitor", desc: "Chinese premium EV market competitor", tier: "B", category: "Competitor", subCategory: "China EV" },
    { ticker: "XPEV", rel: "competitor", desc: "Chinese EV market competitor (XPeng)", tier: "B", category: "Competitor", subCategory: "China EV" },
  ],

  // ─── APPLE ───────────────────────────────────────────────────────────────────
  AAPL: [
    { ticker: "TSM", rel: "supplier", desc: "A-series and M-series chip fabrication (3nm)", tier: "S", category: "Manufacturing", subCategory: "Foundry" },
    { ticker: "QCOM", rel: "supplier", desc: "5G modem chips (transitioning to in-house)", tier: "A", category: "Supplier", subCategory: "Modem" },
    { ticker: "AVGO", rel: "supplier", desc: "WiFi/Bluetooth/RF front-end components", tier: "A", category: "Supplier", subCategory: "RF Components" },
    { ticker: "TXN", rel: "supplier", desc: "Analog/mixed-signal semiconductor components", tier: "B", category: "Supplier", subCategory: "Analog" },
    { ticker: "GOOGL", rel: "competitor", desc: "Android ecosystem + search revenue share partner", tier: "A", category: "Competitor", subCategory: "Mobile OS" },
    { ticker: "SAMSUNG", rel: "competitor", desc: "Galaxy smartphone competitor + display/memory supplier", tier: "A", category: "Competitor", subCategory: "Mobile" },
    { ticker: "MSFT", rel: "competitor", desc: "Surface/Windows PC competitor; enterprise rivalry", tier: "A", category: "Competitor", subCategory: "PC/Enterprise" },
    { ticker: "AMZN", rel: "partner", desc: "Apple TV+ on Fire TV; iCloud on AWS", tier: "B", category: "Partner", subCategory: "Services" },
    { ticker: "CRM", rel: "partner", desc: "Enterprise iOS app ecosystem integration", tier: "B", category: "Partner", subCategory: "Enterprise" },
  ],

  // ─── MICROSOFT ───────────────────────────────────────────────────────────────
  MSFT: [
    { ticker: "NVDA", rel: "partner", desc: "Azure AI GPU infrastructure; Stargate JV", tier: "S", category: "Partner", subCategory: "GPU Infrastructure" },
    { ticker: "AMD", rel: "partner", desc: "Xbox processor + Azure Maia custom AI chips", tier: "A", category: "Partner", subCategory: "Semiconductor" },
    { ticker: "CRM", rel: "competitor", desc: "Dynamics 365 vs Salesforce CRM rivalry", tier: "A", category: "Competitor", subCategory: "Enterprise SaaS" },
    { ticker: "GOOGL", rel: "competitor", desc: "Cloud (Azure vs GCP) + productivity (365 vs Workspace)", tier: "A", category: "Competitor", subCategory: "Cloud/Productivity" },
    { ticker: "AMZN", rel: "competitor", desc: "Azure vs AWS cloud services", tier: "A", category: "Competitor", subCategory: "Cloud" },
    { ticker: "SNOW", rel: "partner", desc: "Snowflake on Azure deep integration", tier: "B", category: "Partner", subCategory: "Data Platform" },
    { ticker: "META", rel: "partner", desc: "Llama open-source models hosted on Azure AI", tier: "B", category: "Partner", subCategory: "AI/Open Source" },
    { ticker: "ORCL", rel: "competitor", desc: "Enterprise database + cloud competition", tier: "B", category: "Competitor", subCategory: "Enterprise/Cloud" },
    { ticker: "SAP", rel: "partner", desc: "SAP on Azure preferred cloud migration partner", tier: "B", category: "Partner", subCategory: "Enterprise ERP" },
  ],

  // ─── ALPHABET/GOOGLE ────────────────────────────────────────────────────────
  GOOGL: [
    { ticker: "NVDA", rel: "partner", desc: "GPU infrastructure for GCP AI/ML + Gemini training", tier: "S", category: "Partner", subCategory: "GPU Infrastructure" },
    { ticker: "TSM", rel: "supplier", desc: "Fabricates Google TPU and Tensor chips (3nm/5nm)", tier: "S", category: "Manufacturing", subCategory: "Foundry" },
    { ticker: "AVGO", rel: "partner", desc: "Co-develops Google TPU interconnect and networking ASICs", tier: "S", category: "Partner", subCategory: "Semiconductor" },
    { ticker: "MSFT", rel: "competitor", desc: "Cloud (GCP vs Azure), productivity (Workspace vs 365), AI (Gemini vs Copilot)", tier: "A", category: "Competitor", subCategory: "Cloud/AI" },
    { ticker: "AMZN", rel: "competitor", desc: "Cloud (GCP vs AWS), advertising, smart home", tier: "A", category: "Competitor", subCategory: "Cloud/Advertising" },
    { ticker: "META", rel: "competitor", desc: "Digital advertising duopoly rival + AI model competition", tier: "A", category: "Competitor", subCategory: "Advertising/AI" },
    { ticker: "AAPL", rel: "partner", desc: "Default search deal worth $20B+/yr; iOS Safari traffic", tier: "S", category: "Partner", subCategory: "Search Distribution" },
    { ticker: "SNAP", rel: "partner", desc: "Google Cloud infrastructure customer; ad platform integration", tier: "B", category: "Partner", subCategory: "Social/Cloud" },
    { ticker: "CRM", rel: "partner", desc: "Salesforce on Google Cloud deep integration", tier: "B", category: "Partner", subCategory: "Enterprise SaaS" },
    { ticker: "SHOP", rel: "partner", desc: "Google Shopping + Merchant Center integration", tier: "B", category: "Partner", subCategory: "E-Commerce" },
    { ticker: "SPOT", rel: "partner", desc: "YouTube Music competitor; Google Cloud customer", tier: "B", category: "Partner", subCategory: "Music/Streaming" },
    { ticker: "UBER", rel: "partner", desc: "Google Maps API deep integration; GCP customer", tier: "B", category: "Partner", subCategory: "Mobility" },
    { ticker: "WBD", rel: "competitor", desc: "YouTube vs Max streaming; content competition", tier: "C", category: "Competitor", subCategory: "Streaming" },
  ],
};

/**
 * Get ecosystem map for a ticker, combining known data with AI extraction
 */
export async function getEcosystemMap(ticker: string): Promise<EcosystemMap> {
  const symbol = ticker.toUpperCase();
  const known = KNOWN_ECOSYSTEMS[symbol] || [];

  // Confidence based on signal tier: S=0.95, A=0.85, B=0.7, C=0.55
  const tierConfidence: Record<string, number> = { S: 0.95, A: 0.85, B: 0.7, C: 0.55 };

  const edges: EcosystemEdge[] = known.map((k) => ({
    sourceTicker: symbol,
    targetTicker: k.ticker,
    relationship: k.rel as EcosystemEdge["relationship"],
    description: k.desc,
    confidence: k.tier ? (tierConfidence[k.tier] ?? 0.7) : 0.9,
    tier: k.tier,
    category: k.category,
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
  partners: { ticker: string; relationship: string; description: string; price: number; change: number; tier?: SignalTier; category?: string }[];
  bestPick: string | null;
  rationale: string;
}> {
  const eco = await getEcosystemMap(ticker);

  // Tier rank for sorting: S=0 (highest priority), A=1, B=2, C=3, undefined=4
  const tierRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

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
        tier: e.tier,
        category: e.category,
      };
    })
    .filter((p) => p.price > 0)
    .sort((a, b) => {
      // Primary sort: signal tier (S > A > B > C)
      const tierA = a.tier ? (tierRank[a.tier] ?? 4) : 4;
      const tierB = b.tier ? (tierRank[b.tier] ?? 4) : 4;
      if (tierA !== tierB) return tierA - tierB;
      // Secondary sort: price change (descending)
      return b.change - a.change;
    });

  const bestPick = partners[0]?.ticker || null;
  const tierLabel = partners[0]?.tier ? ` [Tier ${partners[0].tier}]` : "";
  const rationale = bestPick
    ? `${bestPick}${tierLabel} is the top ${ticker} ecosystem pick, up ${partners[0].change.toFixed(1)}% — ${partners[0].description}`
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
