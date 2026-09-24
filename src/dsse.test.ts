import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { FlightRecorder } from "./flight-recorder.js";
import type { RunPolicy } from "./policy.js";
import { createRunAttestationPayload } from "./attestation.js";
import { createRunStatement, decodeRunStatement, signRunStatement, verifyRunStatement } from "./dsse.js";

function fixture() {
  const recorder = new FlightRecorder("dsse-test");
  recorder.record({ kind: "tool_call", actor: "agent", action: "fs.read" });
  recorder.record({ kind: "tool_result", actor: "agent", action: "fs.read", output: { ok: true } });
  const policy: RunPolicy = { default: "deny", rules: [{ id: "read", effect: "allow", action: "fs.read" }] };
  const keys = generateKeyPairSync("ed25519");
  return {
    recorder,
    policy,
    privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

test("signs a DSSE in-toto statement for a RunLedger attestation", () => {
  const { recorder, policy, privateKey, publicKey } = fixture();
  const payload = createRunAttestationPayload(recorder.run, policy, { issuer: "ci", issuedAt: "2026-09-24T00:00:00.000Z" });
  const signed = signRunStatement(createRunStatement(payload), privateKey);
  const result = verifyRunStatement(signed.envelope, publicKey, { run: recorder.run, policy });
  assert.equal(result.ok, true);
  const statement = decodeRunStatement(signed.envelope);
  assert.equal(statement.subject[0]?.digest.sha256, payload.runDigest);
  assert.equal(statement.predicate.attestation.policyOk, true);
});

test("rejects tampered DSSE payload bytes", () => {
  const { recorder, policy, privateKey, publicKey } = fixture();
  const signed = signRunStatement(createRunStatement(createRunAttestationPayload(recorder.run, policy)), privateKey);
  const statement = decodeRunStatement(signed.envelope);
  statement.predicate.attestation.issuer = "tampered";
  const tampered = { ...signed.envelope, payload: Buffer.from(JSON.stringify(statement)).toString("base64") };
  const tamperedResult = verifyRunStatement(tampered, publicKey);
  assert.equal(tamperedResult.ok, false);
  if (!tamperedResult.ok) assert.equal(tamperedResult.reason, "bad-signature");
});

test("binds the statement to expected run and policy evidence", () => {
  const { recorder, policy, privateKey, publicKey } = fixture();
  const signed = signRunStatement(createRunStatement(createRunAttestationPayload(recorder.run, policy)), privateKey);
  const other = new FlightRecorder("other");
  other.record({ kind: "tool_call", actor: "agent", action: "fs.write" });
  const mismatch = verifyRunStatement(signed.envelope, publicKey, { run: other.run, policy });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.reason, "run-digest-mismatch");
});


test("accepts opaque DSSE key identifiers", () => {
  const { recorder, policy, privateKey, publicKey } = fixture();
  const signed = signRunStatement(createRunStatement(createRunAttestationPayload(recorder.run, policy)), privateKey, { keyid: "ci-prod-key" });
  assert.equal(signed.envelope.signatures[0]?.keyid, "ci-prod-key");
  assert.equal(verifyRunStatement(signed.envelope, publicKey, { run: recorder.run, policy }).ok, true);
});
