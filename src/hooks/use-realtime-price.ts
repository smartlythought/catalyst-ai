"use client";

import { useEffect, useRef, useState } from "react";

interface RealtimePrice {
  price: number;
  volume: number;
  timestamp: number;
}

const WS_URL = "wss://ws.finnhub.io";

let sharedSocket: WebSocket | null = null;
let subscribers = new Map<string, Set<(p: RealtimePrice) => void>>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let apiKey = "";

function getSocket(key: string): WebSocket {
  apiKey = key;
  if (sharedSocket && sharedSocket.readyState === WebSocket.OPEN) {
    return sharedSocket;
  }

  if (sharedSocket) {
    try { sharedSocket.close(); } catch {}
  }

  const ws = new WebSocket(`${WS_URL}?token=${key}`);
  sharedSocket = ws;

  ws.onopen = () => {
    for (const symbol of subscribers.keys()) {
      ws.send(JSON.stringify({ type: "subscribe", symbol }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "trade" && Array.isArray(msg.data)) {
        for (const trade of msg.data) {
          const cbs = subscribers.get(trade.s);
          if (cbs) {
            const update: RealtimePrice = {
              price: trade.p,
              volume: trade.v,
              timestamp: trade.t,
            };
            for (const cb of cbs) cb(update);
          }
        }
      }
    } catch {}
  };

  ws.onclose = () => {
    if (subscribers.size > 0 && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (subscribers.size > 0) getSocket(apiKey);
      }, 3000);
    }
  };

  ws.onerror = () => {
    try { ws.close(); } catch {}
  };

  return ws;
}

function subscribe(symbol: string, callback: (p: RealtimePrice) => void, key: string) {
  if (!subscribers.has(symbol)) {
    subscribers.set(symbol, new Set());
  }
  subscribers.get(symbol)!.add(callback);

  const ws = getSocket(key);
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "subscribe", symbol }));
  }
}

function unsubscribe(symbol: string, callback: (p: RealtimePrice) => void) {
  const cbs = subscribers.get(symbol);
  if (cbs) {
    cbs.delete(callback);
    if (cbs.size === 0) {
      subscribers.delete(symbol);
      if (sharedSocket?.readyState === WebSocket.OPEN) {
        sharedSocket.send(JSON.stringify({ type: "unsubscribe", symbol }));
      }
    }
  }

  if (subscribers.size === 0 && sharedSocket) {
    try { sharedSocket.close(); } catch {}
    sharedSocket = null;
  }
}

export function useRealtimePrice(symbol: string | null) {
  const [price, setPrice] = useState<RealtimePrice | null>(null);
  const callbackRef = useRef<((p: RealtimePrice) => void) | null>(null);

  callbackRef.current = (p: RealtimePrice) => {
    setPrice(p);
  };

  useEffect(() => {
    if (!symbol) return;

    const key = process.env.NEXT_PUBLIC_FINNHUB_KEY;
    if (!key) return;

    const cb = (p: RealtimePrice) => callbackRef.current?.(p);
    subscribe(symbol, cb, key);

    return () => {
      unsubscribe(symbol, cb);
    };
  }, [symbol]);

  return price;
}
