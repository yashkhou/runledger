import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { FlightRecorder } from "./flight-recorder.js";
import type { RunPolicy } from "./policy.js";
import { createRunAttestationPayload } from "./attestation.js";
import { createRunStatement, signRunStatement } from "./dsse.js";
import { verifyRunGate } from "./gate.js";

function fixture(policy?: RunPolicy) {
  const recorder = new FlightRecorder("gate-test");
  recorder.record({ kind: "tool_call", actor: "agent", action: "fs.read" });
  recorder.record({ kind: "tool_result", actor: "agent", action: "fs.read", output: { ok: true } });
  const runPolicy = policy ?? { default: "deny", rules: [{ id: "read", effect: "allow", action: "fs.read" }] };
  const keys = generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const envelope = signRunStatement(createRunStatement(createRunAttestationPayload(recorder.run, runPolicy)), privateKey).envelope;
  return { recorder, policy: runPolicy, envelope, publicKey };
}

test("passes only when chain, attestation and policy all verify", () => {
  const { recorder, policy, envelope, publicKey } = fixture();
  const result = verifyRunGate(recorder.run, policy, envelope, publicKey);
  assert.equal(result.ok, true);
});

test("fails at the chain stage for tampered flight evidence", () => {
  const { recorder, policy, envelope, publicKey } = fixture();
  recorder.run.events[0]!.action = "fs.write";
  const result = verifyRunGate(recorder.run, policy, envelope, publicKey);
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual({ stage: result.stage, reason: result.reason }, { stage: "chain", reason: "broken-run-chain" });
});

test("fails at attestation stage for a signature that is not trusted", () => {
  const { recorder, policy, envelope } = fixture();
  const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  const result = verifyRunGate(recorder.run, policy, envelope, other);
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual({ stage: result.stage, reason: result.reason }, { stage: "attestation", reason: "bad-signature" });
});

test("fails a valid signed run when policy denies execution", () => {
  const policy: RunPolicy = { default: "deny", rules: [] };
  const { recorder, envelope, publicKey } = fixture(policy);
  const result = verifyRunGate(recorder.run, policy, envelope, publicKey);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.stage, "policy");
    assert.equal(result.reason, "policy-denied");
    assert.equal(result.policy?.violations.length, 2);
  }
});
