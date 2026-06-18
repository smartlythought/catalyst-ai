const SEC_BASE = "https://data.sec.gov";
const EFTS_BASE = "https://efts.sec.gov/LATEST";
const USER_AGENT = process.env.SEC_EDGAR_USER_AGENT || "Catalyst research@claudeo.ai";

const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
};

async function secFetch(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`SEC API ${res.status}: ${url}`);
  return res.json();
}

// Rate limit: 10 req/sec max
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface Form4Filing {
  accessionNumber: string;
  filerName: string;
  filerRole: string;
  ticker: string;
  cik: string;
  transactionType: string; // P=Purchase, S=Sale
  shares: number;
  pricePerShare: number;
  totalValue: number;
  sharesOwnedAfter: number;
  transactionDate: string;
  filingDate: string;
}

export interface Filing8K {
  accessionNumber: string;
  entityName: string;
  cik: string;
  filingDate: string;
  description: string;
  items: string[];
  url: string;
}

/**
 * Get recent Form 4 filings for a CIK (insider trades)
 */
export async function getRecentForm4(cik: string): Promise<Form4Filing[]> {
  const paddedCik = cik.padStart(10, "0");
  const data = await secFetch(
    `${SEC_BASE}/submissions/CIK${paddedCik}.json`
  );

  const recent = data.filings?.recent;
  if (!recent) return [];

  const filings: Form4Filing[] = [];

  for (let i = 0; i < recent.form.length && i < 50; i++) {
    if (recent.form[i] !== "4") continue;

    const accession = recent.accessionNumber[i];
    const filingDate = recent.filingDate[i];

    try {
      await delay(120); // Stay under 10 req/sec
      const filing = await parseForm4(paddedCik, accession);
      if (filing) {
        filing.filingDate = filingDate;
        filings.push(filing);
      }
    } catch {
      // Skip unparseable filings
    }
  }

  return filings;
}

async function parseForm4(
  cik: string,
  accession: string
): Promise<Form4Filing | null> {
  const accessionClean = accession.replace(/-/g, "");
  const url = `${SEC_BASE}/Archives/edgar/data/${cik}/${accessionClean}/${accession}-index.json`;

  try {
    const indexData = await secFetch(url);
    const xmlFile = indexData.directory?.item?.find(
      (f: { name: string }) => f.name.endsWith(".xml") && !f.name.includes("R")
    );
    if (!xmlFile) return null;

    const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionClean}/${xmlFile.name}`;
    const xmlRes = await fetch(xmlUrl, { headers: HEADERS });
    const xmlText = await xmlRes.text();

    return extractForm4Data(xmlText, accession);
  } catch {
    return null;
  }
}

function extractForm4Data(xml: string, accession: string): Form4Filing | null {
  const getTag = (tag: string) => {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
    return match?.[1]?.trim() || "";
  };

  const filerName = getTag("rptOwnerName");
  if (!filerName) return null;

  const isDirector = xml.includes("<isDirector>1</isDirector>") || xml.includes("<isDirector>true</isDirector>");
  const isOfficer = xml.includes("<isOfficer>1</isOfficer>") || xml.includes("<isOfficer>true</isOfficer>");
  const officerTitle = getTag("officerTitle");

  let filerRole = "Insider";
  if (isOfficer && officerTitle) filerRole = officerTitle;
  else if (isDirector) filerRole = "Director";

  const transactionCode = getTag("transactionCode");
  const sharesStr = getTag("transactionShares") || getTag("value");
  const priceStr = getTag("transactionPricePerShare") || getTag("value");
  const afterStr = getTag("sharesOwnedFollowingTransaction") || getTag("value");

  const shares = parseFloat(sharesStr) || 0;
  const price = parseFloat(priceStr) || 0;

  return {
    accessionNumber: accession,
    filerName,
    filerRole,
    ticker: getTag("issuerTradingSymbol"),
    cik: getTag("issuerCik"),
    transactionType: transactionCode || "U",
    shares,
    pricePerShare: price,
    totalValue: shares * price,
    sharesOwnedAfter: parseFloat(afterStr) || 0,
    transactionDate: getTag("transactionDate") || getTag("value"),
    filingDate: "",
  };
}

/**
 * Get recent 8-K filings for a CIK
 */
export async function getRecent8K(cik: string): Promise<Filing8K[]> {
  const paddedCik = cik.padStart(10, "0");
  const data = await secFetch(
    `${SEC_BASE}/submissions/CIK${paddedCik}.json`
  );

  const recent = data.filings?.recent;
  if (!recent) return [];

  const filings: Filing8K[] = [];

  for (let i = 0; i < recent.form.length && i < 50; i++) {
    if (recent.form[i] !== "8-K" && recent.form[i] !== "8-K/A") continue;

    filings.push({
      accessionNumber: recent.accessionNumber[i],
      entityName: data.name || "",
      cik,
      filingDate: recent.filingDate[i],
      description: recent.primaryDocDescription?.[i] || "8-K Filing",
      items: [],
      url: `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${recent.accessionNumber[i].replace(/-/g, "")}/${recent.primaryDocument[i]}`,
    });
  }

  return filings;
}

/**
 * Search EDGAR full-text for a query
 */
export async function searchEdgar(
  query: string,
  forms?: string,
  startDate?: string,
  endDate?: string
) {
  const params = new URLSearchParams({ q: `"${query}"` });
  if (forms) params.set("forms", forms);
  if (startDate && endDate) {
    params.set("dateRange", "custom");
    params.set("startdt", startDate);
    params.set("enddt", endDate);
  }

  const data = await secFetch(`${EFTS_BASE}/search-index?${params}`);
  return data.hits?.hits || [];
}

/**
 * Get XBRL financial facts for a company
 */
export async function getCompanyFacts(cik: string) {
  const paddedCik = cik.padStart(10, "0");
  return secFetch(`${SEC_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`);
}

/**
 * Resolve ticker to CIK
 */
export async function tickerToCik(ticker: string): Promise<string | null> {
  const data = await secFetch("https://www.sec.gov/files/company_tickers.json");
  for (const entry of Object.values(data) as { ticker: string; cik_str: string }[]) {
    if (entry.ticker.toUpperCase() === ticker.toUpperCase()) {
      return String(entry.cik_str);
    }
  }
  return null;
}
