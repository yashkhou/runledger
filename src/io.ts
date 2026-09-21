import { appendFile, readFile } from "node:fs/promises";
import type { LedgerEvent } from "./core.js";

export async function readLedger(file: string): Promise<LedgerEvent[]> {
  try {
    const text = await readFile(file, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as LedgerEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendLedger(file: string, event: LedgerEvent): Promise<void> {
  await appendFile(file, JSON.stringify(event) + "\n", "utf8");
}
