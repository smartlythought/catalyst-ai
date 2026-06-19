import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSignalEmail } from "@/lib/email";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const result = await sendSignalEmail(user.email, {
    ticker: "NVDA",
    call: "BUY",
    conviction: 92,
    price: 210.69,
    entry: 208.0,
    target: 235.0,
    stop: 195.0,
    why: "This is a test alert from Catalyst. If you received this email, your email alerts are working correctly!",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ sent: true, to: user.email });
}
