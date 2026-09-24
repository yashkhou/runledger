#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { Command } from "commander";
import { makeEvent, verifyLedger } from "./core.js";
import { appendLedger, readLedger } from "./io.js";
import { renderLedger } from "./report.js";
import { McpJsonRpcAdapter, ingestRuntime, parseJsonRecords } from "./adapters.js";
import { FlightRecorder } from "./flight-recorder.js";
import { evaluateRunPolicy, type RunPolicy } from "./policy.js";
import { createRunAttestationPayload, signRunAttestation, verifyRunAttestation, type SignedRunAttestation } from "./attestation.js";
import { createRunStatement, signRunStatement, verifyRunStatement, type DsseEnvelope } from "./dsse.js";

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

program.command("attest")
  .argument("<run>", "Flight run JSON").argument("<policy>", "Policy JSON").argument("<privateKey>", "Ed25519 private key PEM")
  .option("-o, --out <file>", "Signed attestation JSON", "runledger-attestation.json").option("--issuer <name>", "Attestation issuer")
  .action(async (runFile, policyFile, keyFile, options) => {
    const recorder = await FlightRecorder.load(runFile);
    if (!recorder.verify().ok) throw new Error("Cannot attest a broken flight-run hash chain");
    const policy = JSON.parse(await readFile(policyFile, "utf8")) as RunPolicy;
    const payload = createRunAttestationPayload(recorder.run, policy, { issuer: options.issuer });
    const attestation = signRunAttestation(payload, await readFile(keyFile, "utf8"));
    await writeFile(options.out, JSON.stringify(attestation, null, 2));
    console.log(`${options.out} (${payload.policyOk ? "POLICY OK" : "POLICY DENIED"})`);
  });

program.command("attestation-verify")
  .argument("<attestation>", "Signed attestation JSON").option("--run <file>", "Expected flight run JSON").option("--policy <file>", "Expected policy JSON").option("--public-key <file>", "Trusted Ed25519 public key PEM")
  .action(async (attestationFile, options) => {
    const attestation = JSON.parse(await readFile(attestationFile, "utf8")) as SignedRunAttestation;
    const run = options.run ? (await FlightRecorder.load(options.run)).run : undefined;
    const policy = options.policy ? JSON.parse(await readFile(options.policy, "utf8")) as RunPolicy : undefined;
    const publicKey = options.publicKey ? await readFile(options.publicKey, "utf8") : undefined;
    const result = verifyRunAttestation(attestation, { run, policy, publicKey });
    console.log(result.ok ? "ATTESTATION VERIFIED" : `ATTESTATION INVALID: ${result.reason}`);
    process.exitCode = result.ok ? 0 : 3;
  });


program.command("attest-in-toto")
  .argument("<run>", "Flight run JSON")
  .argument("<policy>", "Policy JSON")
  .argument("<privateKey>", "Ed25519 private key PEM")
  .option("-o, --out <file>", "DSSE envelope JSON", "runledger-attestation.dsse.json")
  .option("--public-key-out <file>", "Public key PEM", "runledger-attestation.pub.pem")
  .option("--issuer <name>", "Attestation issuer")
  .option("--keyid <id>", "Override DSSE keyid")
  .action(async (runFile, policyFile, keyFile, options) => {
    const recorder = await FlightRecorder.load(runFile);
    if (!recorder.verify().ok) throw new Error("Cannot attest a broken flight-run hash chain");
    const policy = JSON.parse(await readFile(policyFile, "utf8")) as RunPolicy;
    const payload = createRunAttestationPayload(recorder.run, policy, { issuer: options.issuer });
    const signed = signRunStatement(createRunStatement(payload), await readFile(keyFile, "utf8"), { keyid: options.keyid });
    await writeFile(options.out, JSON.stringify(signed.envelope, null, 2));
    await writeFile(options.publicKeyOut, signed.publicKey);
    console.log(`${options.out} (${payload.policyOk ? "POLICY OK" : "POLICY DENIED"}, in-toto/DSSE)`);
  });

program.command("in-toto-verify")
  .argument("<envelope>", "DSSE envelope JSON")
  .requiredOption("--public-key <file>", "Trusted Ed25519 public key PEM")
  .option("--run <file>", "Expected flight run JSON")
  .option("--policy <file>", "Expected policy JSON")
  .action(async (envelopeFile, options) => {
    const envelope = JSON.parse(await readFile(envelopeFile, "utf8")) as DsseEnvelope;
    const run = options.run ? (await FlightRecorder.load(options.run)).run : undefined;
    const policy = options.policy ? JSON.parse(await readFile(options.policy, "utf8")) as RunPolicy : undefined;
    const publicKey = await readFile(options.publicKey, "utf8");
    const result = verifyRunStatement(envelope, publicKey, { run, policy });
    console.log(result.ok ? "IN-TOTO ATTESTATION VERIFIED" : `IN-TOTO ATTESTATION INVALID: ${result.reason}`);
    process.exitCode = result.ok ? 0 : 4;
  });

await program.parseAsync();
