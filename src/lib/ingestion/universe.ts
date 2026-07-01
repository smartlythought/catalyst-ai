// The stock universe scanned for Daily Picks.
//
// CRITERIA for the curated base:
//   - Liquid US large/mega-cap leaders across ALL 11 GICS sectors (so picks
//     aren't concentrated in tech), PLUS
//   - High-interest growth / thematic names (AI, semis, space, quantum,
//     fintech, nuclear/clean energy) that retail actively trades.
// On top of that the universe is made DYNAMIC each day by unioning in:
//   - today's biggest gainers / losers / most-active (FMP) — what's in play now
//   - the account's current Alpaca holdings — always analyze what you own
const FMP_KEY = process.env.FMP_API_KEY || "";

export const CURATED_UNIVERSE: string[] = [
  // Mega-cap tech / comms
  "AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META","TSLA","AVGO","NFLX",
  "ORCL","ADBE","CRM","AMD","INTC","QCOM","CSCO","TXN","IBM","NOW",
  "INTU","AMAT","LRCX","KLAC","MU","ADI","SNPS","CDNS","MRVL","PANW",
  "CRWD","FTNT","ZS","DDOG","SNOW","NET","MDB","TEAM","WDAY","HUBS",
  "PLTR","UBER","ABNB","SHOP","SQ","COIN","DELL","HPQ","HPE","ARM",
  // Financials
  "JPM","BAC","WFC","C","GS","MS","BLK","SCHW","AXP","V",
  "MA","PYPL","SPGI","CB","PGR","MMC","ICE","CME","COF","USB",
  // Healthcare
  "LLY","UNH","JNJ","MRK","ABBV","PFE","TMO","ABT","DHR","AMGN",
  "BMY","GILD","VRTX","REGN","ISRG","MDT","CI","CVS","HCA","MRNA",
  // Consumer
  "WMT","COST","HD","LOW","TGT","MCD","SBUX","NKE","TJX","BKNG",
  "PG","KO","PEP","PM","MO","MDLZ","CL","EL","KHC","STZ",
  "DIS","CMCSA","F","GM","CVNA","LULU","CMG","ORLY","YUM","DPZ",
  // Industrials / defense / transport
  "CAT","DE","GE","HON","RTX","LMT","BA","UNP","UPS","FDX",
  "MMM","EMR","ETN","ITW","GD","NOC","CSX","NSC","WM","PH",
  // Energy / materials / utilities
  "XOM","CVX","COP","SLB","EOG","OXY","PSX","VLO","MPC","WMB",
  "LIN","FCX","NEM","NUE","DOW","APD","NEE","DUK","SO","CEG",
  // Communication / media / internet
  "TMUS","VZ","T","SPOT","RBLX","PINS","SNAP","RDDT","DASH","TTD",
  // High-interest growth / thematic small & mid caps
  "RKLB","ASTS","LUNR","RDW","KTOS","AVAV","ACHR","JOBY","BBAI","SOUN",
  "QUBT","QBTS","RGTI","IONQ","NVTS","INDI","CRDO","ALAB","NBIS","CRWV",
  "COHR","LITE","AMBA","SITM","POWI","MPWR","ON","WOLF","ALGM","SMCI",
  "AFRM","SOFI","UPST","HOOD","NU","TOST","BILL","GTLB","S","APP",
  "OKLO","SMR","VST","TLN","GEV","FSLR","ENPH","RUN","MELI","SE",
];

// FMP daily-movers, cached in-memory for an hour (they change intraday).
let moverCache: { at: number; symbols: string[] } | null = null;
const MOVER_TTL_MS = 60 * 60 * 1000;

async function fetchMoverSet(kind: "gainers" | "losers" | "actives"): Promise<string[]> {
  if (!FMP_KEY) return [];
  const stablePath =
    kind === "gainers" ? "biggest-gainers" : kind === "losers" ? "biggest-losers" : "most-active";
  const urls = [
    `https://financialmodelingprep.com/stable/${stablePath}?apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/api/v3/stock_market/${kind}?apikey=${FMP_KEY}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) continue;
      return data
        .map((d: any) => String(d.symbol || "").toUpperCase())
        .filter((s: string) => s && !s.includes("."))
        .slice(0, 25);
    } catch {
      /* try next */
    }
  }
  return [];
}

export async function getDailyMoverSymbols(): Promise<string[]> {
  if (moverCache && Date.now() - moverCache.at < MOVER_TTL_MS) {
    return moverCache.symbols;
  }
  const [g, l, a] = await Promise.all([
    fetchMoverSet("gainers"),
    fetchMoverSet("losers"),
    fetchMoverSet("actives"),
  ]);
  const symbols = Array.from(new Set([...g, ...l, ...a]));
  moverCache = { at: Date.now(), symbols };
  return symbols;
}

export interface DynamicUniverse {
  symbols: string[]; // full deduped scan list
  priority: Set<string>; // holdings + today's movers — always keep in the prompt
}

/**
 * Build the day's scan universe = curated base ∪ today's movers ∪ held.
 * `priority` = movers + holdings, so the prompt builder can guarantee they're
 * never dropped when it caps the list. Fail-soft: movers/holdings are best
 * effort; the curated base always stands.
 */
export async function buildScanUniverse(
  heldSymbols: string[] = []
): Promise<DynamicUniverse> {
  const movers = await getDailyMoverSymbols().catch(() => []);
  const held = heldSymbols.map((s) => s.toUpperCase());
  const priority = new Set<string>([...movers, ...held]);
  const symbols = Array.from(
    new Set([...CURATED_UNIVERSE, ...movers, ...held].map((s) => s.toUpperCase()))
  );
  return { symbols, priority };
}
