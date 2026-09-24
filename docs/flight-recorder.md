# Agent flight recorder

RunLedger records intent, decisions, tool calls/results, checkpoints, errors and recovery events in a tamper-evident SHA-256 chain.

Long-running agents cross shells, browsers, APIs and model vendors. Logs show what printed; a flight recorder preserves the causal execution trail needed to audit a run, compare two runs and resume after the last known-good checkpoint.

## Direct recording

```ts
import { FlightRecorder } from "runledger";

const r = new FlightRecorder();
r.record({ kind: "intent", action: "upgrade dependencies" });
r.checkpoint("tests green");
r.record({ kind: "tool_call", action: "npm update" });
console.log(r.verify());
console.log(r.recoveryPlan());
```

`compareRuns(a, b)` highlights semantic divergence by event sequence, kind, action and output.

## Runtime adapters

The adapter API translates runtime-native events into the same `FlightEvent` format:

```ts
interface RuntimeAdapter<T> {
  readonly name: string;
  ingest(input: T): FlightEventDraft[];
}
```

RunLedger v0.4 ships `McpJsonRpcAdapter` as the first built-in adapter. It understands MCP JSON-RPC `tools/call` requests, correlates request IDs with responses, and emits `tool_call`, `tool_result`, or `error` events.

```ts
import {
  FlightRecorder,
  McpJsonRpcAdapter,
  ingestRuntime,
} from "runledger";

const recorder = new FlightRecorder();
const mcp = new McpJsonRpcAdapter();

ingestRuntime(recorder, mcp, {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "browser.open", arguments: { url: "https://example.com" } },
});
```

Wrapped records such as `{ direction, message }`, batches, JSON arrays and JSONL transcripts are supported.

## CLI import

```bash
node dist/cli.js ingest mcp examples/mcp-session.jsonl -o mcp-flight.json
```

The resulting file is a normal verified `FlightRun`; it can be loaded with `FlightRecorder.load()`, compared with another run, or used to produce a recovery plan.

The format remains vendor-neutral so Codex, Claude Code, MCP, browser agents and local harnesses can converge on the same execution ledger without requiring a hosted observability service.


## Trusted completion gate

RunLedger 0.7 can reduce chain, policy, and signed-provenance verification to one deterministic gate:

```bash
runledger gate run.json policy.json run.dsse.json --public-key run.pub.pem
```

The gate fails closed. It checks the flight-run hash chain first, verifies the DSSE/in-toto statement against the trusted Ed25519 key and the exact run/policy digests, then requires the recomputed policy result to allow the run. This makes the same local evidence usable as a CI promotion condition or an agent-runtime completion contract.
