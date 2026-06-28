#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type CheckpointRecord = {
  iteration: string;
  timestamp: string;
  mutation_layer: string;
  changed_files: string[];
  parent_checkpoint: string;
  target_metric: string;
  expected_improvement: string;
  proposer_summary: string;
  snapshot_path: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    workspace: "",
    iteration: "",
    mutationLayer: "",
    targetMetric: "",
    expectedImprovement: "",
    proposerSummary: "",
  };

  for (const arg of args) {
    if (arg.startsWith("--iteration=")) options.iteration = arg.slice("--iteration=".length);
    else if (arg.startsWith("--mutation-layer=")) options.mutationLayer = arg.slice("--mutation-layer=".length);
    else if (arg.startsWith("--target-metric=")) options.targetMetric = arg.slice("--target-metric=".length);
    else if (arg.startsWith("--expected-improvement=")) options.expectedImprovement = arg.slice("--expected-improvement=".length);
    else if (arg.startsWith("--summary=")) options.proposerSummary = arg.slice("--summary=".length);
    else if (!options.workspace) options.workspace = arg;
    else fail(`Unexpected argument: ${arg}`);
  }

  if (!options.workspace) {
    fail(
      "Usage: bun scripts/checkpoint.ts <optimizer-workspace> --iteration=iteration-001 --mutation-layer=SKILL.md [--target-metric=...] [--expected-improvement=...] [--summary=...]"
    );
  }

  if (!options.iteration) options.iteration = nextIteration(resolve(options.workspace));
  if (!options.mutationLayer) options.mutationLayer = "unknown";
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
    .map((line) => basename(line.trim()))
    .filter(Boolean)
    .map((name) => Number(name.replace(/^iteration-/, "")))
    .filter((num) => Number.isFinite(num));
  const next = ids.length ? Math.max(...ids) + 1 : 1;
  return `iteration-${String(next).padStart(3, "0")}`;
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const proc = Bun.spawnSync(["find", root, "-type", "f"], { stdout: "pipe" });
  return proc.stdout
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => path.slice(root.length + 1))
    .sort();
}

function changedFiles(workspace: string): string[] {
  const original = join(workspace, "source", "original");
  const working = join(workspace, "source", "working");
  const originalFiles = new Set(listFiles(original));
  const workingFiles = new Set(listFiles(working));
  const all = [...new Set([...originalFiles, ...workingFiles])].sort();
  return all.filter((file) => {
    const originalPath = join(original, file);
    const workingPath = join(working, file);
    if (!existsSync(originalPath) || !existsSync(workingPath)) return true;
    const originalStat = statSync(originalPath);
    const workingStat = statSync(workingPath);
    if (originalStat.size !== workingStat.size) return true;
    return readFileSync(originalPath, "utf-8") !== readFileSync(workingPath, "utf-8");
  });
}

function latestCheckpoint(workspace: string): string {
  const logPath = join(workspace, "logs", "checkpoints.jsonl");
  if (!existsSync(logPath)) return "";
  const lines = readFileSync(logPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  try {
    const record = JSON.parse(lines[lines.length - 1]) as CheckpointRecord;
    return record.iteration || "";
  } catch {
    return "";
  }
}

function main() {
  const options = parseArgs();
  const workspace = resolve(options.workspace);
  const working = join(workspace, "source", "working");
  if (!existsSync(working)) fail(`Working skill not found: ${working}`);

  const snapshotDir = join(workspace, "checkpoints", options.iteration, "working");
  if (existsSync(snapshotDir)) fail(`Checkpoint already exists: ${snapshotDir}`);
  mkdirSync(snapshotDir, { recursive: true });
  const copyFilter = (source: string) => {
    const name = basename(source);
    return name !== ".DS_Store" && name !== ".git" && name !== "node_modules";
  };
  cpSync(working, snapshotDir, { recursive: true, filter: copyFilter });

  const record: CheckpointRecord = {
    iteration: options.iteration,
    timestamp: new Date().toISOString(),
    mutation_layer: options.mutationLayer,
    changed_files: changedFiles(workspace),
    parent_checkpoint: latestCheckpoint(workspace),
    target_metric: options.targetMetric || "",
    expected_improvement: options.expectedImprovement || "",
    proposer_summary: options.proposerSummary || "",
    snapshot_path: snapshotDir,
  };

  const logsDir = join(workspace, "logs");
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(join(logsDir, "checkpoints.jsonl"), `${JSON.stringify(record)}\n`, { flag: "a" });
  writeFileSync(join(workspace, "checkpoints", options.iteration, "checkpoint.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
}

main();
