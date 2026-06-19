import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";

const FROM_EMAIL = process.env.EMAIL_FROM || "Catalyst <alerts@claudeo.ai>";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

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

function buildSignalHTML(signal: SignalMessage): string {
  const color =
    signal.call === "BUY" ? "#16C784" : signal.call === "REDUCE" ? "#EA3943" : "#9CA3AF";
  const emoji = signal.call === "BUY" ? "🟢" : signal.call === "REDUCE" ? "🔴" : "⚪";

  const levels =
    signal.entry && signal.target && signal.stop
      ? `<tr>
          <td style="padding:8px 0;color:#9CA3AF;font-size:13px">Entry</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;font-family:monospace">$${signal.entry.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9CA3AF;font-size:13px">Target</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;color:#16C784;font-family:monospace">$${signal.target.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9CA3AF;font-size:13px">Stop Loss</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;color:#EA3943;font-family:monospace">$${signal.stop.toFixed(2)}</td>
        </tr>`
      : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0E14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px">
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:20px;font-weight:800;color:#E8743B;letter-spacing:-0.5px">Catalyst</span>
    </div>
    <div style="background:#111827;border:1px solid #1F2937;border-radius:16px;padding:24px;margin-bottom:16px">
      <div style="display:flex;align-items:center;margin-bottom:16px">
        <span style="font-size:24px;margin-right:8px">${emoji}</span>
        <span style="font-size:28px;font-weight:800;color:white;font-family:monospace;letter-spacing:-1px">${signal.ticker}</span>
        <span style="margin-left:12px;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;font-family:monospace;color:${color};background:${color}1A;letter-spacing:1px">${signal.call}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;color:white">
        <tr>
          <td style="padding:8px 0;color:#9CA3AF;font-size:13px">Price</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;font-size:18px;font-family:monospace">$${signal.price.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9CA3AF;font-size:13px">Conviction</td>
          <td style="padding:8px 0;text-align:right">
            <span style="font-weight:700;font-size:18px;font-family:monospace;color:${color}">${signal.conviction}%</span>
          </td>
        </tr>
        ${levels}
      </table>
    </div>
    <div style="background:#111827;border:1px solid #1F2937;border-radius:16px;padding:20px;margin-bottom:16px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;margin-bottom:8px;font-family:monospace">AI Analysis</div>
      <p style="color:#D1D5DB;font-size:14px;line-height:1.6;margin:0">${signal.why}</p>
    </div>
    <div style="text-align:center;padding:16px 0">
      <a href="https://catalyst.claudeo.ai/stock/${signal.ticker}" style="display:inline-block;padding:12px 32px;background:#E8743B;color:white;font-weight:700;font-size:14px;border-radius:10px;text-decoration:none">View Full Analysis →</a>
    </div>
    <p style="text-align:center;color:#4B5563;font-size:10px;margin-top:24px;font-family:monospace">
      Catalyst AI — Not financial advice. Past performance does not guarantee future results.
    </p>
  </div>
</body>
</html>`;
}

export async function sendSignalEmail(
  email: string,
  signal: SignalMessage
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${signal.call === "BUY" ? "🟢" : signal.call === "REDUCE" ? "🔴" : "⚪"} ${signal.call} ${signal.ticker} @ $${signal.price.toFixed(2)} — ${signal.conviction}% conviction`,
      html: buildSignalHTML(signal),
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

export async function dispatchEmailAlerts(signal: SignalMessage): Promise<number> {
  if (!process.env.RESEND_API_KEY) return 0;

  const supabase = createServiceClient();

  const { data: subscribers } = await supabase
    .from("user_alerts")
    .select("user_id, min_conviction")
    .eq("email_enabled", true);

  if (!subscribers?.length) return 0;

  const eligible = subscribers.filter(
    (s: { user_id: string; min_conviction: number }) =>
      signal.conviction >= (s.min_conviction || 70)
  );

  let sent = 0;
  for (const sub of eligible) {
    const { data: user } = await supabase.auth.admin.getUserById(sub.user_id);
    const email = user?.user?.email;

    if (email) {
      const result = await sendSignalEmail(email, signal);
      if (result.ok) sent++;
    }
  }

  return sent;
}
