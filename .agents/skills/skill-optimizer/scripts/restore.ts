#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type RestoreRecord = {
  timestamp: string;
  iteration: string;
  checkpoint_path: string;
  restored_to: string;
  backup_path: string;
  reason: string;
  gate_outcome: string;
};

type GateRecord = {
  iteration?: string;
  outcome?: string;
  recommendation?: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    workspace: "",
    iteration: "",
    gateIteration: "",
    reason: "",
    requireDiscard: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--iteration=")) options.iteration = arg.slice("--iteration=".length);
    else if (arg.startsWith("--gate-iteration=")) options.gateIteration = arg.slice("--gate-iteration=".length);
    else if (arg.startsWith("--reason=")) options.reason = arg.slice("--reason=".length);
    else if (arg === "--require-discard") options.requireDiscard = true;
    else if (!options.workspace) options.workspace = arg;
    else fail(`Unexpected argument: ${arg}`);
  }

  if (!options.workspace || !options.iteration) {
    fail("Usage: bun scripts/restore.ts <optimizer-workspace> --iteration=iteration-001 [--gate-iteration=iteration-002] [--require-discard] [--reason=...]");
  }

  return options;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function copyFilter(source: string) {
  const name = basename(source);
  return name !== ".DS_Store" && name !== ".git" && name !== "node_modules";
}

function latestGate(workspace: string, iteration: string): GateRecord | null {
  const lastGate = join(workspace, "logs", "last-gate.json");
  if (existsSync(lastGate)) {
    const record = JSON.parse(readFileSync(lastGate, "utf-8")) as GateRecord;
    if (!record.iteration || record.iteration === iteration) return record;
  }

  const gates = join(workspace, "logs", "gates.jsonl");
  if (!existsSync(gates)) return null;
  const records = readFileSync(gates, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GateRecord)
    .filter((record) => record.iteration === iteration);
  return records.at(-1) ?? null;
}

function main() {
  const options = parseArgs();
  const workspace = resolve(options.workspace);
  const checkpoint = join(workspace, "checkpoints", options.iteration, "working");
  const working = join(workspace, "source", "working");
  if (!existsSync(checkpoint)) fail(`Checkpoint working snapshot not found: ${checkpoint}`);
  if (!existsSync(working)) fail(`Workspace working directory not found: ${working}`);

  const gateIteration = options.gateIteration || options.iteration;
  const gate = latestGate(workspace, gateIteration);
  if (options.requireDiscard && gate?.outcome !== "discard") {
    fail(`Refusing restore because latest gate outcome for ${gateIteration} is ${gate?.outcome || "missing"}, not discard.`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(workspace, "restore-backups", `${options.iteration}-${timestamp}`, "working");
  mkdirSync(backup, { recursive: true });
  cpSync(working, backup, { recursive: true, filter: copyFilter });

  rmSync(working, { recursive: true, force: true });
  cpSync(checkpoint, working, { recursive: true, filter: copyFilter });

  const record: RestoreRecord = {
    timestamp: new Date().toISOString(),
    iteration: options.iteration,
    checkpoint_path: checkpoint,
    restored_to: working,
    backup_path: backup,
    reason: options.reason || gate?.recommendation || "",
    gate_outcome: gate?.outcome || "",
  };

  const logsDir = join(workspace, "logs");
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(join(logsDir, "restores.jsonl"), `${JSON.stringify(record)}\n`, { flag: "a" });
  writeFileSync(
    join(logsDir, "experiments.jsonl"),
    `${JSON.stringify({
      iteration: options.iteration,
      gate_iteration: gateIteration,
      mutation_layer: "restore",
      target_cases: [],
      hypothesis: "Restore source/working from checkpoint after failed or rejected mutation.",
      change: `Restored ${checkpoint} to ${working}.`,
      evidence: [join(logsDir, "last-gate.json")],
      decision: "discard",
      restore: record,
    })}\n`,
    { flag: "a" }
  );
  console.log(JSON.stringify(record, null, 2));
}

main();
