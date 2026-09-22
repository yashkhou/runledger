import test from "node:test";
import assert from "node:assert/strict";
import {
  McpJsonRpcAdapter,
  ingestRuntime,
  parseJsonRecords,
} from "./adapters.js";
import { FlightRecorder } from "./flight-recorder.js";

test("MCP tool calls and results become linked flight events", () => {
  const recorder = new FlightRecorder("mcp-demo");
  const adapter = new McpJsonRpcAdapter();

  ingestRuntime(recorder, adapter, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "browser.open",
      arguments: { url: "https://example.com" },
    },
  });

  ingestRuntime(recorder, adapter, {
    jsonrpc: "2.0",
    id: 7,
    result: { content: [{ type: "text", text: "ok" }] },
  });

  assert.equal(recorder.run.events.length, 2);
  assert.equal(recorder.run.events[0].kind, "tool_call");
  assert.equal(recorder.run.events[0].action, "browser.open");
  assert.equal(recorder.run.events[1].kind, "tool_result");
  assert.equal(recorder.run.events[1].action, "browser.open");
  assert.deepEqual(recorder.verify(), { ok: true });
});

test("MCP errors preserve the originating tool action", () => {
  const recorder = new FlightRecorder("mcp-error");
  const adapter = new McpJsonRpcAdapter();

  ingestRuntime(recorder, adapter, {
    jsonrpc: "2.0",
    id: "req-1",
    method: "tools/call",
    params: { name: "files.read", arguments: { path: "/missing" } },
  });
  ingestRuntime(recorder, adapter, {
    jsonrpc: "2.0",
    id: "req-1",
    error: { code: -32000, message: "not found" },
  });

  assert.equal(recorder.run.events[1].kind, "error");
  assert.equal(recorder.run.events[1].action, "files.read");
  assert.match(recorder.run.events[1].error ?? "", /not found/);
});

test("wrapped and batched MCP records are supported", () => {
  const recorder = new FlightRecorder();
  const adapter = new McpJsonRpcAdapter();

  ingestRuntime(recorder, adapter, [
    {
      direction: "client_to_server",
      message: {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "shell.run", arguments: { command: "npm test" } },
      },
    },
    { direction: "server_to_client", message: { jsonrpc: "2.0", id: 9, result: { ok: true } } },
  ]);

  assert.equal(recorder.run.events.length, 2);
  assert.equal(recorder.run.events[1].action, "shell.run");
});

test("parseJsonRecords accepts arrays, single objects and JSONL", () => {
  assert.equal(parseJsonRecords('[{"a":1},{"a":2}]').length, 2);
  assert.equal(parseJsonRecords('{"a":1}').length, 1);
  assert.deepEqual(parseJsonRecords('{"a":1}\n{"a":2}'), [{ a: 1 }, { a: 2 }]);
});

test("parseJsonRecords reports the bad JSONL line", () => {
  assert.throws(
    () => parseJsonRecords('{"a":1}\nnot-json'),
    /Invalid JSON on line 2/,
  );
});
