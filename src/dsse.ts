import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type { FlightRun } from "./flight-recorder.js";
import type { RunPolicy } from "./policy.js";
import { canonicalize, sha256Canonical, type RunAttestationPayload } from "./attestation.js";
import { evaluateRunPolicy } from "./policy.js";

export const DSSE_PAYLOAD_TYPE = "application/vnd.in-toto+json";
export const IN_TOTO_STATEMENT_V1 = "https://in-toto.io/Statement/v1";
export const RUNLEDGER_PREDICATE_V1 = "https://runledger.dev/attestation/v1";

export interface InTotoSubject {
  name: string;
  digest: { sha256: string };
}

export interface RunLedgerPredicate {
  attestation: RunAttestationPayload;
}

export interface InTotoStatement<T = unknown> {
  _type: typeof IN_TOTO_STATEMENT_V1;
  subject: InTotoSubject[];
  predicateType: string;
  predicate: T;
}

export interface DsseSignature {
  keyid: string;
  sig: string;
}

export interface DsseEnvelope {
  payloadType: string;
  payload: string;
  signatures: DsseSignature[];
}

export interface SignedRunStatement {
  envelope: DsseEnvelope;
  publicKey: string;
}

export function dssePreAuthEncoding(payloadType: string, payload: Buffer): Buffer {
  const type = Buffer.from(payloadType, "utf8");
  const prefix = Buffer.from(`DSSEv1 ${type.length} ${payloadType} ${payload.length} `, "utf8");
  return Buffer.concat([prefix, payload]);
}

export function createRunStatement(payload: RunAttestationPayload): InTotoStatement<RunLedgerPredicate> {
  return {
    _type: IN_TOTO_STATEMENT_V1,
    subject: [{ name: `runledger:${payload.runId}`, digest: { sha256: payload.runDigest } }],
    predicateType: RUNLEDGER_PREDICATE_V1,
    predicate: { attestation: payload },
  };
}

function keyId(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

export function signRunStatement(
  statement: InTotoStatement<RunLedgerPredicate>,
  privateKeyPem: string,
  options: { keyid?: string } = {},
): SignedRunStatement {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  const payload = Buffer.from(canonicalize(statement), "utf8");
  const pae = dssePreAuthEncoding(DSSE_PAYLOAD_TYPE, payload);
  const signature = sign(null, pae, privateKey).toString("base64");
  return {
    envelope: {
      payloadType: DSSE_PAYLOAD_TYPE,
      payload: payload.toString("base64"),
      signatures: [{ keyid: options.keyid ?? keyId(publicKey), sig: signature }],
    },
    publicKey,
  };
}

export function decodeRunStatement(envelope: DsseEnvelope): InTotoStatement<RunLedgerPredicate> {
  if (envelope.payloadType !== DSSE_PAYLOAD_TYPE) throw new Error("unsupported-payload-type");
  const statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8")) as InTotoStatement<RunLedgerPredicate>;
  if (statement._type !== IN_TOTO_STATEMENT_V1) throw new Error("unsupported-statement");
  if (statement.predicateType !== RUNLEDGER_PREDICATE_V1) throw new Error("unsupported-predicate");
  if (statement.predicate?.attestation?.schema !== "runledger.attestation/v1") throw new Error("unsupported-runledger-attestation");
  return statement;
}

export function verifyRunStatement(
  envelope: DsseEnvelope,
  publicKeyPem: string,
  expected: { run?: FlightRun; policy?: RunPolicy } = {},
): { ok: true; statement: InTotoStatement<RunLedgerPredicate> } | { ok: false; reason: string } {
  let statement: InTotoStatement<RunLedgerPredicate>;
  try {
    statement = decodeRunStatement(envelope);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid-statement" };
  }
  const payload = Buffer.from(envelope.payload, "base64");
  const pae = dssePreAuthEncoding(envelope.payloadType, payload);
  const signatureOk = envelope.signatures.some(entry =>
    verify(null, pae, createPublicKey(publicKeyPem), Buffer.from(entry.sig, "base64")),
  );
  if (!signatureOk) return { ok: false, reason: "bad-signature" };

  const attestation = statement.predicate.attestation;
  const subject = statement.subject.find(item => item.name === `runledger:${attestation.runId}`);
  if (!subject || subject.digest.sha256 !== attestation.runDigest) return { ok: false, reason: "subject-digest-mismatch" };

  if (expected.run) {
    if (sha256Canonical(expected.run) !== attestation.runDigest) return { ok: false, reason: "run-digest-mismatch" };
    if ((expected.run.events.at(-1)?.hash ?? "GENESIS") !== attestation.finalEventHash) return { ok: false, reason: "run-head-mismatch" };
  }
  if (expected.policy) {
    if (sha256Canonical(expected.policy) !== attestation.policyDigest) return { ok: false, reason: "policy-digest-mismatch" };
    if (expected.run) {
      const result = evaluateRunPolicy(expected.run, expected.policy);
      if (result.ok !== attestation.policyOk || result.violations.length !== attestation.violations) {
        return { ok: false, reason: "policy-result-mismatch" };
      }
    }
  }
  return { ok: true, statement };
}
