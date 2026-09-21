import test from "node:test";
import assert from "node:assert/strict";
import { makeEvent, verifyLedger } from "./core.js";

test("verifies valid chain and detects tampering", () => {
  const a = makeEvent(0, "tool.call", { name: "browser.open" }, null, "2026-01-01T00:00:00.000Z");
  const b = makeEvent(1, "tool.result", { ok: true }, a.hash, "2026-01-01T00:00:01.000Z");
  assert.equal(verifyLedger([a,b]).ok, true);
  const bad = { ...b, data: { ok: false } };
  assert.equal(verifyLedger([a,bad]).ok, false);
});
