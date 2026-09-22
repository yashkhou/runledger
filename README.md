<p align="center">
  <img src="./assets/brand.svg" width="720" alt="RunLedger — A tamper-evident flight recorder for AI agent runs.">
</p>

<p align="center">
  <a href="https://github.com/yashkhou/runledger/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/yashkhou/runledger/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/yashkhou/runledger/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/yashkhou/runledger?style=flat-square"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <a href="https://yashkhou.github.io/runledger/"><img alt="Live docs" src="https://img.shields.io/badge/live-docs-c6ff4a?style=flat-square"></a>
</p>

<p align="center">
  <strong>A tamper-evident flight recorder for AI agent runs.</strong><br>
  RunLedger records tool calls, decisions, retries, results and evidence in an append-only JSONL hash chain—then verifies whether the history was altered.
</p>

<p align="center">
  <a href="https://yashkhou.github.io/runledger/"><strong>Live docs</strong></a> ·
  <a href="https://yashkhou.github.io/runledger/real-report.html"><strong>Open the real verified ledger report</strong></a> ·
  <a href="https://yashkhou.com/projects/runledger"><strong>Project page</strong></a> ·
  <a href="https://github.com/yashkhou/runledger/releases/latest"><strong>Latest release</strong></a>
</p>


## Why I built this

When an autonomous run fails, ordinary logs are often incomplete, mutable, or scattered across providers. RunLedger keeps a deliberately boring local record: one event per line, linked to the previous event by SHA-256, with a human-readable report when you need to inspect it.

## What ships today

- Append-only JSONL event ledger
- SHA-256 hash chain across every event
- Tool call, result, decision and retry events
- Tamper detection for edits, removals and reordering
- Human-readable HTML report
- Zero database or hosted telemetry required

## Real demo


**[Open the real verified ledger report →](https://yashkhou.github.io/runledger/real-report.html)**

## Quick start

```bash
git clone https://github.com/yashkhou/runledger.git
cd runledger
npm install
npm run build

node dist/cli.js add tool.call '{"name":"browser.open","url":"https://example.com"}'
node dist/cli.js add decision '{"choice":"verify","confidence":0.94}'
node dist/cli.js add tool.result '{"ok":true,"title":"Example Domain"}'
node dist/cli.js verify
node dist/cli.js report
```

## Small example

```json
{
  "seq": 2,
  "type": "tool.result",
  "data": { "ok": true, "title": "Example Domain" },
  "previousHash": "ff0d9397…",
  "hash": "b14a4b94…"
}
```

## Architecture

```mermaid
flowchart LR
    A[Agent runtime] --> B[tool.call]
    A --> C[decision / retry]
    A --> D[tool.result]
    B --> E[RunLedger]
    C --> E
    D --> E
    E --> F[JSONL event n]
    F --> G[SHA-256 previous + event]
    G --> H[event n+1]
    H --> I[verify]
    I --> J[HTML report]
```

The design rule is intentionally narrow: **the event ledger stays local, append-only and independently verifiable.**

## Good fits

- Debug autonomous workflows without depending on a SaaS console
- Keep provenance beside browser/computer-use runs
- Compare retry and decision behavior between agent versions
- Attach verifiable execution history to incidents and QA


## FAQ

### What is RunLedger?

RunLedger is a local TypeScript execution ledger for AI-agent runs. It stores structured events in JSONL and links them with SHA-256 so later tampering can be detected.

### What does tamper-evident mean?

Each event includes the previous event hash. Editing, deleting or reordering recorded events breaks chain verification.

### Does RunLedger require a hosted observability service?

No. The core ledger, verification and HTML reporting workflow is local-first and does not require a database or SaaS telemetry backend.

### What can RunLedger record?

It can record tool calls, tool results, decisions, retries and other structured execution events from an autonomous workflow.

## Roadmap

- [ ] Optional Ed25519 signatures
- [ ] OpenTelemetry exporter
- [ ] Screenshot and file evidence manifests
- [ ] Diff reports between two runs
- [ ] Runtime adapters

## Related tools

- [BrowserProof](https://github.com/yashkhou/browserproof) - browser-state verification for AI agents and Playwright workflows.
- [RunLedger](https://github.com/yashkhou/runledger) - tamper-evident execution history for AI-agent runs.
- [ActionMesh](https://github.com/yashkhou/actionmesh) - typed action contracts for tools, HTTP and CLI.

## Development

```bash
npm install
npm test
npm run build
```

CI runs tests and the TypeScript build on every push and pull request.

## Project links

- **Docs:** https://yashkhou.github.io/runledger/
- **Portfolio:** https://yashkhou.com/projects/runledger
- **Source:** https://github.com/yashkhou/runledger
- **Author:** [Yash](https://github.com/yashkhou) / [@yashkhou](https://x.com/yashkhou)

## License

MIT. See [LICENSE](./LICENSE).


## Agent flight recorder

RunLedger now includes a vendor-neutral **flight recorder** for autonomous agent runs. It captures intent, decisions, tool calls/results, checkpoints, errors and recovery events in a tamper-evident chain, then supports verification, semantic run comparison and recovery from the last known-good checkpoint.

See [`docs/flight-recorder.md`](docs/flight-recorder.md).
