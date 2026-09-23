#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { Command } from "commander";
import { makeEvent, verifyLedger } from "./core.js";
import { appendLedger, readLedger } from "./io.js";
import { renderLedger } from "./report.js";
import { McpJsonRpcAdapter, ingestRuntime, parseJsonRecords } from "./adapters.js";
import { FlightRecorder } from "./flight-recorder.js";
import { evaluateRunPolicy, type RunPolicy } from "./policy.js";

const program = new Command().name("runledger").description("Tamper-evident execution logs for AI agents.");
program.command("add").argument("<type>").argument("<json>")
  .option("-f, --file <file>", "Ledger JSONL", "runledger.jsonl")
  .action(async (type, json, options) => {
    const events = await readLedger(options.file);
    const event = makeEvent(events.length, type, JSON.parse(json), events.at(-1)?.hash || null);
    await appendLedger(options.file, event);
    console.log(event.hash);
  });
program.command("verify").option("-f, --file <file>", "Ledger JSONL", "runledger.jsonl")
  .action(async (options) => {
    const result = verifyLedger(await readLedger(options.file));
    console.log(result.ok ? "VERIFIED" : "BROKEN at event " + result.brokenAt);
    process.exitCode = result.ok ? 0 : 1;
  });
program.command("report").option("-f, --file <file>", "Ledger JSONL", "runledger.jsonl")
  .option("-o, --out <file>", "HTML report", "runledger-report.html")
  .action(async (options) => {
    await writeFile(options.out, renderLedger(await readLedger(options.file)));
    console.log(options.out);
  });

program.command("ingest")
  .argument("<adapter>", "Runtime adapter (currently: mcp)")
  .argument("<input>", "JSON, JSON array, or JSONL input file")
  .option("-o, --out <file>", "Flight run JSON", "runledger-flight.json")
  .action(async (adapterName, input, options) => {
    if (adapterName !== "mcp") throw new Error(`Unknown adapter: ${adapterName}`);
    const recorder = new FlightRecorder();
    const adapter = new McpJsonRpcAdapter();
    const records = parseJsonRecords(await readFile(input, "utf8"));
    for (const record of records) ingestRuntime(recorder, adapter, record);
    await recorder.save(options.out);
    console.log(`${options.out} (${recorder.run.events.length} events, ${recorder.verify().ok ? "VERIFIED" : "BROKEN"})`);
  });

program.command("policy-check")
  .argument("<run>", "Flight run JSON")
  .argument("<policy>", "Policy JSON")
  .action(async (runFile, policyFile) => {
    const recorder = await FlightRecorder.load(runFile);
    const policy = JSON.parse(await readFile(policyFile, "utf8")) as RunPolicy;
    const result = evaluateRunPolicy(recorder.run, policy);
    console.log(result.ok ? "POLICY OK" : JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 2;
  });

await program.parseAsync();
