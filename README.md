# RunLedger

**A tamper-evident flight recorder for AI agent runs.**

RunLedger records tool calls, decisions, retries, outputs, and evidence as an append-only JSONL hash chain. It gives agent builders a local provenance trail that is easy to diff, archive, verify, and render.

## Why

When an autonomous run fails, a normal console log often cannot answer what the agent actually called, what changed between retries, whether the log was modified, or which evidence supported the final claim.

RunLedger keeps the format deliberately boring: JSONL + SHA-256 + HTML.

## Quick start

~~~bash
git clone https://github.com/yashkhou/runledger.git
cd runledger
npm install
npm test

node dist/cli.js add tool.call '{"name":"browser.open","url":"https://example.com"}'
node dist/cli.js add tool.result '{"ok":true}'
node dist/cli.js verify
node dist/cli.js report
~~~

## Event model

Each event contains seq, timestamp, type, data, previousHash, and hash. The hash covers the complete event payload plus the previous hash, so edits, removals, and reordering break verification.

## Designed for

Browser/computer-use agents, MCP hosts, coding agents, background automations, evaluation harnesses, incident reports, and QA evidence.

## Philosophy

RunLedger is not another observability SaaS. It is a local primitive you can embed anywhere and export later.

## Roadmap

Ed25519 signatures, OpenTelemetry export, file evidence manifests, run diffs, and agent-runtime adapters.

## License

MIT
