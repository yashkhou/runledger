# Agent flight recorder
RunLedger records intent, decisions, tool calls/results, checkpoints, errors and recovery events in a tamper-evident SHA-256 chain.

Long-running agents now cross shells, browsers, APIs and model vendors. Logs show what printed; a flight recorder preserves the causal execution trail needed to audit a run, compare two runs and resume after the last known-good checkpoint.

```ts
const r = new FlightRecorder();
r.record({ kind: 'intent', action: 'upgrade dependencies' });
r.checkpoint('tests green');
r.record({ kind: 'tool_call', action: 'npm update' });
console.log(r.verify());
console.log(r.recoveryPlan());
```

`compareRuns(a, b)` highlights semantic divergence by event sequence, kind, action and output. The format is vendor-neutral so Codex, Claude Code, MCP, browser agents and local harnesses can emit the same ledger.
