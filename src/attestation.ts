import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type { FlightRun } from "./flight-recorder.js";
import { evaluateRunPolicy, type RunPolicy } from "./policy.js";

export interface RunAttestationPayload {
  schema: "runledger.attestation/v1";
  runId: string;
  runDigest: string;
  policyDigest: string;
  policyOk: boolean;
  violations: number;
  finalEventHash: string;
  issuedAt: string;
  issuer?: string;
}

export interface SignedRunAttestation {
  payload: RunAttestationPayload;
  algorithm: "Ed25519";
  publicKey: string;
  signature: string;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function createRunAttestationPayload(run: FlightRun, policy: RunPolicy, options: { issuer?: string; issuedAt?: string } = {}): RunAttestationPayload {
  const result = evaluateRunPolicy(run, policy);
  return {
    schema: "runledger.attestation/v1",
    runId: run.runId,
    runDigest: sha256(run),
    policyDigest: sha256(policy),
    policyOk: result.ok,
    violations: result.violations.length,
    finalEventHash: run.events.at(-1)?.hash ?? "GENESIS",
    issuedAt: options.issuedAt ?? new Date().toISOString(),
    issuer: options.issuer,
  };
}

export function signRunAttestation(payload: RunAttestationPayload, privateKeyPem: string): SignedRunAttestation {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const signature = sign(null, Buffer.from(canonical(payload)), privateKey).toString("base64");
  return { payload, algorithm: "Ed25519", publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(), signature };
}
export function verifyRunAttestation(attestation: SignedRunAttestation, expected?: { run?: FlightRun; policy?: RunPolicy; publicKey?: string }) {
  if (attestation.algorithm !== "Ed25519" || attestation.payload.schema !== "runledger.attestation/v1") return { ok: false, reason: "unsupported-attestation" };
  const publicKeyPem = expected?.publicKey ?? attestation.publicKey;
  const signatureOk = verify(null, Buffer.from(canonical(attestation.payload)), createPublicKey(publicKeyPem), Buffer.from(attestation.signature, "base64"));
  if (!signatureOk) return { ok: false, reason: "bad-signature" };
  if (expected?.run) {
    if (sha256(expected.run) !== attestation.payload.runDigest) return { ok: false, reason: "run-digest-mismatch" };
    if ((expected.run.events.at(-1)?.hash ?? "GENESIS") !== attestation.payload.finalEventHash) return { ok: false, reason: "run-head-mismatch" };
  }
  if (expected?.policy) {
    if (sha256(expected.policy) !== attestation.payload.policyDigest) return { ok: false, reason: "policy-digest-mismatch" };
    if (expected.run) {
      const result = evaluateRunPolicy(expected.run, expected.policy);
      if (result.ok !== attestation.payload.policyOk || result.violations.length !== attestation.payload.violations) return { ok: false, reason: "policy-result-mismatch" };
    }
  }
  return { ok: true as const };
}
