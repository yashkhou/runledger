import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { FlightRecorder } from "./flight-recorder.js";
import type { RunPolicy } from "./policy.js";
import { createRunAttestationPayload, signRunAttestation, verifyRunAttestation } from "./attestation.js";

function fixture() {
  const recorder = new FlightRecorder("attestation-test");
  recorder.record({ kind: "tool_call", actor: "agent", action: "fs.read" });
  recorder.record({ kind: "tool_result", actor: "agent", action: "fs.read", output: { ok: true } });
  const policy: RunPolicy = { default: "deny", rules: [{ id: "read", effect: "allow", action: "fs.read" }] };
  const keys = generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { recorder, policy, privateKey };
}

test("signs and verifies a run-policy attestation", () => {
  const { recorder, policy, privateKey } = fixture();
  const payload = createRunAttestationPayload(recorder.run, policy, { issuer: "ci", issuedAt: "2026-09-24T00:00:00.000Z" });
  const attestation = signRunAttestation(payload, privateKey);
  assert.equal(payload.policyOk, true);
  assert.deepEqual(verifyRunAttestation(attestation, { run: recorder.run, policy }), { ok: true });
});
test("detects tampered payloads and mismatched evidence", () => {
  const { recorder, policy, privateKey } = fixture();
  const attestation = signRunAttestation(createRunAttestationPayload(recorder.run, policy), privateKey);
  const tampered = { ...attestation, payload: { ...attestation.payload, issuer: "attacker" } };
  assert.equal(verifyRunAttestation(tampered).ok, false);

  const other = new FlightRecorder("other-run");
  other.record({ kind: "tool_call", actor: "agent", action: "fs.write" });
  assert.equal(verifyRunAttestation(attestation, { run: other.run, policy }).reason, "run-digest-mismatch");
});

test("attests denied policy outcomes without claiming success", () => {
  const { recorder, privateKey } = fixture();
  const policy: RunPolicy = { default: "deny", rules: [] };
  const payload = createRunAttestationPayload(recorder.run, policy);
  const attestation = signRunAttestation(payload, privateKey);
  assert.equal(payload.policyOk, false);
  assert.equal(payload.violations, 2);
  assert.deepEqual(verifyRunAttestation(attestation, { run: recorder.run, policy }), { ok: true });
});
