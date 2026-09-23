import test from "node:test";
import assert from "node:assert/strict";
import { FlightRecorder } from "./flight-recorder.js";
import { evaluateRunPolicy } from "./policy.js";

test("policy blocks denied tool actions", () => {
  const recorder = new FlightRecorder("policy-test");
  recorder.record({ kind: "tool_call", actor: "agent-1", action: "shell.rm", input: { path: "/tmp/a" } });
  recorder.record({ kind: "tool_call", actor: "agent-1", action: "fs.read", input: { path: "README.md" } });
  const result = evaluateRunPolicy(recorder.run, { rules: [{ id: "no-delete", effect: "deny", kind: "tool_call", action: "shell.rm" }] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map(v => [v.seq, v.ruleId]), [[0, "no-delete"]]);
});

test("default deny supports explicit allow globs", () => {
  const recorder = new FlightRecorder("allow-test");
  recorder.record({ kind: "tool_call", action: "github.read.repo" });
  recorder.record({ kind: "tool_call", action: "github.write.repo" });
  const result = evaluateRunPolicy(recorder.run, { default: "deny", rules: [{ id: "github-read", effect: "allow", kind: "tool_call", action: "github.read.*" }] });
  assert.deepEqual(result.violations.map(v => v.seq), [1]);
});
