import type { FlightEvent } from "./flight-recorder.js";
import { FlightRecorder } from "./flight-recorder.js";

export type FlightEventDraft = Omit<
  FlightEvent,
  "id" | "runId" | "seq" | "at" | "prevHash" | "hash"
>;

export interface RuntimeAdapter<T = unknown> {
  readonly name: string;
  ingest(input: T): FlightEventDraft[];
}

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: JsonRpcId;
  result?: unknown;
  error?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requestId(value: unknown): JsonRpcId | undefined {
  return typeof value === "string" || typeof value === "number" || value === null
    ? value
    : undefined;
}

function unwrapMessage(input: unknown): unknown {
  const record = asRecord(input);
  return record && "message" in record ? record.message : input;
}

function toolCallDetails(params: unknown): { name: string; input: unknown } {
  const record = asRecord(params);
  const name = typeof record?.name === "string" ? record.name : "unknown-tool";
  return { name, input: record?.arguments };
}

export class McpJsonRpcAdapter implements RuntimeAdapter<unknown> {
  readonly name = "mcp";
  private readonly pendingTools = new Map<string | number, string>();

  ingest(input: unknown): FlightEventDraft[] {
    if (Array.isArray(input)) return input.flatMap((item) => this.ingest(item));

    const message = unwrapMessage(input);
    const record = asRecord(message);
    if (!record) return [];

    const request = record as JsonRpcRequest;
    if (request.method === "tools/call") {
      const { name, input: toolInput } = toolCallDetails(request.params);
      const id = requestId(request.id);
      if (typeof id === "string" || typeof id === "number") {
        this.pendingTools.set(id, name);
      }
      return [{ kind: "tool_call", actor: "mcp", action: name, input: toolInput }];
    }

    const response = record as JsonRpcResponse;
    const id = requestId(response.id);
    if (typeof id !== "string" && typeof id !== "number") return [];
    const action = this.pendingTools.get(id);
    if (!action) return [];

    this.pendingTools.delete(id);
    if ("error" in record) {
      return [{
        kind: "error",
        actor: "mcp",
        action,
        error: JSON.stringify(response.error),
      }];
    }

    if ("result" in record) {
      return [{ kind: "tool_result", actor: "mcp", action, output: response.result }];
    }

    return [];
  }
}

export function ingestRuntime<T>(
  recorder: FlightRecorder,
  adapter: RuntimeAdapter<T>,
  input: T,
): FlightEvent[] {
  return adapter.ingest(input).map((event) => recorder.record(event));
}

export function parseJsonRecords(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line) as unknown;
        } catch (error) {
          throw new Error(`Invalid JSON on line ${index + 1}: ${(error as Error).message}`);
        }
      });
  }
}
