import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSignalToWhatsApp } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("whatsapp_number")
    .eq("id", user.id)
    .single();

  if (!profile?.whatsapp_number) {
    return NextResponse.json(
      { error: "No WhatsApp number configured" },
      { status: 400 }
    );
  }

  const body = await request.json();

  const sent = await sendSignalToWhatsApp(profile.whatsapp_number, {
    ticker: body.ticker,
    call: body.call,
    conviction: body.conviction,
    price: body.price,
    entry: body.entry,
    target: body.target,
    stop: body.stop,
    why: body.why,
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Failed to send WhatsApp message" },
      { status: 500 }
    );
  }

  return NextResponse.json({ sent: true });
}
