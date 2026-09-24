import { verifyFlightRun, type FlightRun } from "./flight-recorder.js";
import { evaluateRunPolicy, type RunPolicy, type PolicyEvaluation } from "./policy.js";
import { verifyRunStatement, type DsseEnvelope, type InTotoStatement, type RunLedgerPredicate } from "./dsse.js";

export type RunGateFailureStage = "chain" | "attestation" | "policy";

export type RunGateResult =
  | {
      ok: true;
      statement: InTotoStatement<RunLedgerPredicate>;
      policy: PolicyEvaluation;
    }
  | {
      ok: false;
      stage: RunGateFailureStage;
      reason: string;
      badSeq?: number;
      policy?: PolicyEvaluation;
    };

export function verifyRunGate(
  run: FlightRun,
  policy: RunPolicy,
  envelope: DsseEnvelope,
  publicKeyPem: string,
): RunGateResult {
  const chain = verifyFlightRun(run);
  if (!chain.ok) return { ok: false, stage: "chain", reason: "broken-run-chain", badSeq: chain.badSeq };

  const attestation = verifyRunStatement(envelope, publicKeyPem, { run, policy });
  if (!attestation.ok) return { ok: false, stage: "attestation", reason: attestation.reason };

  const policyResult = evaluateRunPolicy(run, policy);
  if (!policyResult.ok) return { ok: false, stage: "policy", reason: "policy-denied", policy: policyResult };

  return { ok: true, statement: attestation.statement, policy: policyResult };
}
