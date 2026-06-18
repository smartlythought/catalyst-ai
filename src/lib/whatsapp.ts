const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "";
const GRAPH_API = "https://graph.facebook.com/v19.0";

interface SignalMessage {
  ticker: string;
  call: string;
  conviction: number;
  price: number;
  entry?: number;
  target?: number;
  stop?: number;
  why: string;
}

export async function sendSignalToWhatsApp(
  phoneNumber: string,
  signal: SignalMessage
): Promise<boolean> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return false;

  const emoji =
    signal.call === "BUY" ? "🟢" : signal.call === "REDUCE" ? "🔴" : "⚪";

  let body = `${emoji} *${signal.call} ${signal.ticker}* @ $${signal.price.toFixed(2)}\n`;
  body += `Conviction: ${signal.conviction}%\n\n`;

  if (signal.entry && signal.target && signal.stop) {
    body += `Entry: $${signal.entry.toFixed(2)}\n`;
    body += `Target: $${signal.target.toFixed(2)}\n`;
    body += `Stop: $${signal.stop.toFixed(2)}\n\n`;
  }

  body += `${signal.why}\n\n`;
  body += `_Catalyst AI — Not financial advice_`;

  const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");

  try {
    const res = await fetch(
      `${GRAPH_API}/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body },
        }),
      }
    );

    return res.ok;
  } catch {
    return false;
  }
}

export async function sendWeeklyDigest(
  phoneNumber: string,
  picks: { shortTerm: string[]; longTerm: string[]; summary: string }
): Promise<boolean> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return false;

  let body = `📊 *Catalyst Weekly Picks*\n\n`;
  body += `*Short-term (1-4 weeks):*\n`;
  picks.shortTerm.forEach((t, i) => {
    body += `${i + 1}. ${t}\n`;
  });
  body += `\n*Long-term (1-6 months):*\n`;
  picks.longTerm.forEach((t, i) => {
    body += `${i + 1}. ${t}\n`;
  });
  body += `\n${picks.summary}\n\n`;
  body += `_Catalyst AI — Not financial advice_`;

  const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");

  try {
    const res = await fetch(
      `${GRAPH_API}/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body },
        }),
      }
    );

    return res.ok;
  } catch {
    return false;
  }
}
