import type { LedgerEvent } from "./core.js";
import { verifyLedger } from "./core.js";

function esc(value: string): string {
  const map: Record<string,string> = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
  return value.replace(/[&<>"']/g, (c) => map[c] || c);
}

export function renderLedger(events: LedgerEvent[]): string {
  const result = verifyLedger(events);
  const rows = events.map((e) =>
    "<tr><td>" + e.seq + "</td><td>" + esc(e.timestamp) + "</td><td>" + esc(e.type) +
    "</td><td><pre>" + esc(JSON.stringify(e.data, null, 2)) + "</pre></td><td><code>" +
    e.hash.slice(0,16) + "…</code></td></tr>"
  ).join("");
  return "<!doctype html><meta charset=\"utf-8\"><title>RunLedger report</title>" +
    "<style>body{font:14px system-ui;max-width:1200px;margin:40px auto;padding:0 20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;vertical-align:top}pre{margin:0;white-space:pre-wrap}</style>" +
    "<h1>RunLedger</h1><p>Integrity: <b>" + (result.ok ? "VERIFIED" : "BROKEN at event " + result.brokenAt) + "</b></p>" +
    "<table><thead><tr><th>#</th><th>Time</th><th>Type</th><th>Data</th><th>Hash</th></tr></thead><tbody>" + rows + "</tbody></table>";
}
