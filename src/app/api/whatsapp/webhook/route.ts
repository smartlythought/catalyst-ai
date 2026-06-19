import { NextRequest, NextResponse } from "next/server";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (messages) {
    for (const msg of messages) {
      console.log(
        `[WhatsApp] Incoming from ${msg.from}: ${msg.text?.body || msg.type}`
      );
    }
  }

  return NextResponse.json({ status: "ok" });
}
