import type { FlightEvent, FlightRun } from "./flight-recorder.js";

export interface PolicyRule {
  id: string;
  effect: "allow" | "deny";
  kind?: FlightEvent["kind"] | "*";
  action?: string;
  actor?: string;
}

export interface RunPolicy { default?: "allow" | "deny"; rules: PolicyRule[] }
export interface PolicyViolation { seq: number; ruleId: string; kind: FlightEvent["kind"]; action?: string; actor?: string }

function glob(pattern: string | undefined, value: string | undefined): boolean {
  if (!pattern || pattern === "*") return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(value ?? "");
}

export function evaluateRunPolicy(run: FlightRun, policy: RunPolicy) {
  const violations: PolicyViolation[] = [];
  for (const event of run.events) {
    const matches = policy.rules.filter(rule =>
      (rule.kind === undefined || rule.kind === "*" || rule.kind === event.kind) && glob(rule.action, event.action) && glob(rule.actor, event.actor));
    const deny = matches.find(rule => rule.effect === "deny");
    const allowed = matches.some(rule => rule.effect === "allow");
    const rejected = deny ?? (policy.default === "deny" && !allowed ? { id: "default-deny" } : undefined);
    if (rejected) violations.push({ seq: event.seq, ruleId: rejected.id, kind: event.kind, action: event.action, actor: event.actor });
  }
  return { ok: violations.length === 0, violations };
}
