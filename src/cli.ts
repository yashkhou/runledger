#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { makeEvent, verifyLedger } from "./core.js";
import { appendLedger, readLedger } from "./io.js";
import { renderLedger } from "./report.js";

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
await program.parseAsync();
