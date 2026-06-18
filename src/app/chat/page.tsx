"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TabBar } from "@/components/tab-bar";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  const searchParams = useSearchParams();
  const tickerParam = searchParams.get("ticker");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      setUser(u);
    }
    checkAuth();
  }, []);

  useEffect(() => {
    if (tickerParam && messages.length === 0) {
      setInput(`Tell me about ${tickerParam}`);
    }
  }, [tickerParam, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, ticker: tickerParam }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || data.error || "Something went wrong." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to connect. Please try again." },
      ]);
    }
    setLoading(false);
  }

  if (!user) {
    return (
      <div className="min-h-dvh pb-24 safe-top flex flex-col items-center justify-center px-5">
        <h1 className="text-[22px] font-extrabold mb-2">Catalyst AI Chat</h1>
        <p className="text-text-muted text-[14px] mb-4 text-center">
          Sign in to chat with our AI about any stock
        </p>
        <a
          href="/auth/login"
          className="px-6 py-3 rounded-[14px] bg-accent-brand text-white font-bold text-[15px]"
        >
          Sign in
        </a>
        <TabBar />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col safe-top">
      {/* Header */}
      <header className="px-5 pt-4 pb-3 border-b border-border-hairline">
        <div className="flex items-center gap-2">
          <div className="w-[32px] h-[32px] rounded-full bg-accent-brand/15 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2L12.5 7.5L18.5 8L14 12.5L15.5 18.5L10 15.5L4.5 18.5L6 12.5L1.5 8L7.5 7.5L10 2Z"
                fill="var(--accent-brand)"
                opacity="0.8"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-[17px] font-bold">
              Catalyst AI
              {tickerParam && (
                <span className="text-accent-brand ml-1.5 font-mono">
                  {tickerParam}
                </span>
              )}
            </h1>
            <p className="text-[11px] text-text-faint">
              AI-powered market intelligence
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 pb-32">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-text-muted text-[14px] mb-4">
              Ask me anything about stocks, market trends, or your portfolio.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                tickerParam ? `Analyze ${tickerParam}` : "What's moving today?",
                "Top AI stocks",
                "Explain P/E ratio",
                "Market outlook",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                  }}
                  className="text-[12px] font-medium text-accent-brand px-3 py-1.5 rounded-full bg-accent-brand/10 border border-accent-brand/20"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-4 ${m.role === "user" ? "flex justify-end" : ""}`}
          >
            <div
              className={`max-w-[85%] rounded-[16px] px-4 py-3 ${
                m.role === "user"
                  ? "bg-accent-brand text-white rounded-br-[4px]"
                  : "bg-surface-1 border border-border-1 text-text-primary rounded-bl-[4px]"
              }`}
            >
              <div
                className="text-[14px] leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: m.content
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                    .replace(/\n/g, "<br />"),
                }}
              />
            </div>
          </div>
        ))}

        {loading && (
          <div className="mb-4">
            <div className="inline-block bg-surface-1 border border-border-1 rounded-[16px] rounded-bl-[4px] px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-text-faint rounded-full animate-bounce" />
                <span
                  className="w-2 h-2 bg-text-faint rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <span
                  className="w-2 h-2 bg-text-faint rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="fixed bottom-[60px] left-0 right-0 p-3 bg-background/80 backdrop-blur-xl border-t border-border-hairline">
        <div className="flex gap-2 max-w-lg mx-auto">
          <input
            type="text"
            placeholder="Ask about any stock..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="flex-1 h-[44px] rounded-[14px] border border-border-1 bg-surface-1 px-4 text-[14px] text-text-primary placeholder:text-text-faint outline-none focus:border-accent-brand transition-colors"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="w-[44px] h-[44px] rounded-[14px] bg-accent-brand text-white flex items-center justify-center disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 10L17 3L10 17L9 11L3 10Z"
                fill="white"
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <TabBar />
    </div>
  );
}
