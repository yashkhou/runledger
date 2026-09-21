import { createHash } from "node:crypto";

export interface LedgerEvent {
  seq: number;
  timestamp: string;
  type: string;
  data: unknown;
  previousHash: string | null;
  hash: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([k,v]) => JSON.stringify(k) + ":" + stable(v));
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(value);
}

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function makeEvent(seq: number, type: string, data: unknown, previousHash: string | null, timestamp = new Date().toISOString()): LedgerEvent {
  const unsigned = { seq, timestamp, type, data, previousHash };
  return { ...unsigned, hash: digest(stable(unsigned)) };
}

export function verifyLedger(events: LedgerEvent[]): { ok: boolean; brokenAt?: number } {
  let previousHash: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const expected = makeEvent(event.seq, event.type, event.data, previousHash, event.timestamp);
    if (event.previousHash !== previousHash || event.hash !== expected.hash) return { ok: false, brokenAt: i };
    previousHash = event.hash;
  }
  return { ok: true };
}
