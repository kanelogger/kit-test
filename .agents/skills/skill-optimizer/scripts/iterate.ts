#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type GateRecord = {
  iteration: string;
  outcome: string;
  recommendation: string;
  pending: number;
  failed: number;
  passed: number;
  errored: number;
};

type IterationRecord = {
  iteration: string;
  timestamp: string;
  workspace: string;
  suite: string;
  checkpoint: "ok" | "skipped";
  evals: "ok";
  gate: GateRecord;
  restore: "restored" | "skipped";
  restore_from: string;
  mutation_layer: string;
  summary: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    workspace: "",
    iteration: "",
    suite: "",
    responseFile: "",
    judgmentsFile: "",
    mutationLayer: "unknown",
    targetMetric: "",
    expectedImprovement: "",
    summary: "",
    allowPending: false,
    noRestore: false,
    skipCheckpoint: false,
    restoreFrom: "",
    maxSeconds: "300",
    maxTokens: "0",
  };

  for (const arg of args) {
    if (arg.startsWith("--iteration=")) options.iteration = arg.slice("--iteration=".length);
    else if (arg.startsWith("--suite=")) options.suite = arg.slice("--suite=".length);
    else if (arg.startsWith("--response-file=")) options.responseFile = arg.slice("--response-file=".length);
    else if (arg.startsWith("--judgments-file=")) options.judgmentsFile = arg.slice("--judgments-file=".length);
    else if (arg.startsWith("--mutation-layer=")) options.mutationLayer = arg.slice("--mutation-layer=".length);
    else if (arg.startsWith("--target-metric=")) options.targetMetric = arg.slice("--target-metric=".length);
    else if (arg.startsWith("--expected-improvement=")) options.expectedImprovement = arg.slice("--expected-improvement=".length);
    else if (arg.startsWith("--summary=")) options.summary = arg.slice("--summary=".length);
    else if (arg.startsWith("--max-seconds=")) options.maxSeconds = arg.slice("--max-seconds=".length);
    else if (arg.startsWith("--max-tokens=")) options.maxTokens = arg.slice("--max-tokens=".length);
    else if (arg === "--allow-pending") options.allowPending = true;
    else if (arg === "--no-restore") options.noRestore = true;
    else if (arg === "--skip-checkpoint") options.skipCheckpoint = true;
    else if (arg.startsWith("--restore-from=")) options.restoreFrom = arg.slice("--restore-from=".length);
    else if (!options.workspace) options.workspace = arg;
    else fail(`Unexpected argument: ${arg}`);
  }

  if (!options.workspace) {
    fail(
      "Usage: bun scripts/iterate.ts <optimizer-workspace> --iteration=iteration-001 [--suite=evals/dev.json] [--mutation-layer=SKILL.md] [--response-file=output.txt] [--restore-from=pre-mutation] [--allow-pending] [--no-restore]"
    );
  }
  if (!options.iteration) options.iteration = nextIteration(resolve(options.workspace));
  return options;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function nextIteration(workspace: string): string {
  const checkpoints = join(workspace, "checkpoints");
  if (!existsSync(checkpoints)) return "iteration-001";
  const proc = Bun.spawnSync(["find", checkpoints, "-maxdepth", "1", "-type", "d", "-name", "iteration-*"], { stdout: "pipe" });
  const ids = proc.stdout
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim().split("/").at(-1) || "")
    .filter(Boolean)
    .map((name) => Number(name.replace(/^iteration-/, "")))
    .filter((num) => Number.isFinite(num));
  const next = ids.length ? Math.max(...ids) + 1 : 1;
  return `iteration-${String(next).padStart(3, "0")}`;
}

function scriptPath(name: string): string {
  return join(dirname(new URL(import.meta.url).pathname), name);
}

function runScript(args: string[]) {
  const proc = Bun.spawnSync(["bun", ...args], { stdout: "pipe", stderr: "pipe" });
  const stdout = proc.stdout.toString();
  const stderr = proc.stderr.toString();
  if (proc.exitCode !== 0) {
    fail([`Command failed: bun ${args.join(" ")}`, stdout, stderr].filter(Boolean).join("\n"));
  }
  return stdout.trim();
}

function readGate(workspace: string): GateRecord {
  const path = join(workspace, "logs", "last-gate.json");
  if (!existsSync(path)) fail(`Gate output not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as GateRecord;
}

function latestCheckpoint(workspace: string): string {
  const path = join(workspace, "logs", "last-restorable-checkpoint.txt");
  if (existsSync(path)) return readFileSync(path, "utf-8").trim();

  const logPath = join(workspace, "logs", "checkpoints.jsonl");
  if (!existsSync(logPath)) return "";
  const lines = readFileSync(logPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const record = JSON.parse(lines[i]) as { iteration?: string };
      if (record.iteration) return record.iteration;
    } catch {
      // Ignore malformed historical log lines.
    }
  }
  return "";
}

function markRestorableCheckpoint(workspace: string, iteration: string) {
  const logsDir = join(workspace, "logs");
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(join(logsDir, "last-restorable-checkpoint.txt"), `${iteration}\n`, "utf-8");
}

function main() {
  const options = parseArgs();
  const workspace = resolve(options.workspace);
  const suite = resolve(options.suite || join(workspace, "evals", "dev.json"));
  if (!existsSync(workspace)) fail(`Workspace not found: ${workspace}`);
  if (!existsSync(suite)) fail(`Eval suite not found: ${suite}`);

  const restoreFromBeforeVerification = options.restoreFrom || latestCheckpoint(workspace);
  let checkpoint: IterationRecord["checkpoint"] = "skipped";
  if (!options.skipCheckpoint) {
    runScript([
      scriptPath("checkpoint.ts"),
      workspace,
      `--iteration=${options.iteration}`,
      `--mutation-layer=${options.mutationLayer}`,
      `--target-metric=${options.targetMetric}`,
      `--expected-improvement=${options.expectedImprovement}`,
      `--summary=${options.summary}`,
    ]);
    checkpoint = "ok";
  }

  const runEvalArgs = [
    scriptPath("run-evals.ts"),
    suite,
    `--output-dir=${join(workspace, "runs", options.iteration)}`,
    `--iteration=${options.iteration}`,
    `--target-skill-dir=${join(workspace, "source", "working")}`,
  ];
  if (options.responseFile) runEvalArgs.push(`--response-file=${resolve(options.responseFile)}`);
  if (options.judgmentsFile) runEvalArgs.push(`--judgments-file=${resolve(options.judgmentsFile)}`);
  runScript(runEvalArgs);

  const gateArgs = [
    scriptPath("gate.ts"),
    workspace,
    `--iteration=${options.iteration}`,
    `--max-seconds=${options.maxSeconds}`,
    `--max-tokens=${options.maxTokens}`,
  ];
  if (options.allowPending) gateArgs.push("--allow-pending");
  runScript(gateArgs);
  const gate = readGate(workspace);

  let restore: IterationRecord["restore"] = "skipped";
  if (gate.outcome === "discard" && !options.noRestore) {
    const restoreIteration = restoreFromBeforeVerification;
    if (!restoreIteration) {
      fail("No pre-mutation checkpoint is available for restore. Run workspace-init again or pass --restore-from=<checkpoint-iteration>.");
    }
    runScript([
      scriptPath("restore.ts"),
      workspace,
      `--iteration=${restoreIteration}`,
      `--gate-iteration=${options.iteration}`,
      "--require-discard",
      `--reason=${gate.recommendation}`,
    ]);
    restore = "restored";
  } else if (gate.outcome === "keep" && !options.skipCheckpoint) {
    markRestorableCheckpoint(workspace, options.iteration);
  }

  const record: IterationRecord = {
    iteration: options.iteration,
    timestamp: new Date().toISOString(),
    workspace,
    suite,
    checkpoint,
    evals: "ok",
    gate,
    restore,
    restore_from: restore === "restored" ? restoreFromBeforeVerification : "",
    mutation_layer: options.mutationLayer,
    summary: options.summary,
  };
  const logsDir = join(workspace, "logs");
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(join(logsDir, "iterations.jsonl"), `${JSON.stringify(record)}\n`, { flag: "a" });
  writeFileSync(join(logsDir, "last-iteration.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
}

main();
