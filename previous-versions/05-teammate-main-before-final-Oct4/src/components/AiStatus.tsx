"use client";

import { useEffect, useState } from "react";
import { aiHealth, type AiHealth } from "@/lib/ai/client";

let cached: AiHealth | null = null;
let inflight: Promise<AiHealth> | null = null;

function loadHealth(): Promise<AiHealth> {
  if (!inflight) {
    inflight = aiHealth().then((h) => {
      cached = h;
      return h;
    });
  }
  return inflight;
}

/** Whether the server has an AI key. `null` while it is still being checked. */
export function useAiHealth() {
  const [health, setHealth] = useState<AiHealth | null>(cached);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    loadHealth().then((h) => {
      if (alive) setHealth(h);
    });
    return () => {
      alive = false;
    };
  }, []);
  return health;
}

/** Speech and photo reading need the AI service. Assume they work until we know they do not. */
export function useAiAvailable(): boolean {
  const health = useAiHealth();
  return health == null || health.configured;
}
