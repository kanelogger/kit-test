#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type GateOutcome = "keep" | "discard" | "keep-with-warning" | "needs-human-review" | "bad-gt-suspected" | "flaky-suspected";

type GateRecord = {
  iteration: string;
  timestamp: string;
  outcome: GateOutcome;
  gate: {
    intent_metric: boolean;
    boundary: boolean;
    regression: boolean;
    cost: boolean;
    safety: boolean;
  };
  pending: number;
  failed: number;
  passed: number;
  errored: number;
  evidence: string[];
  recommendation: string;
};

type Trace = {
  case_id?: string;
  failure_mode?: string;
  assertions?: Array<{ status?: string; evidence?: string; method?: string }>;
  cost?: { tokens?: number; seconds?: number };
};

type RunStats = {
  pending: number;
  failed: number;
  passed: number;
  errored: number;
  boundaryFailed: boolean;
  regressionFailed: boolean;
  seconds: number;
  tokens: number;
  evidence: string[];
  passRate: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    workspace: "",
    iteration: "baseline",
    maxSeconds: 300,
    maxTokens: 0,
    allowPending: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--iteration=")) options.iteration = arg.slice("--iteration=".length);
    else if (arg.startsWith("--max-seconds=")) options.maxSeconds = Number(arg.slice("--max-seconds=".length));
    else if (arg.startsWith("--max-tokens=")) options.maxTokens = Number(arg.slice("--max-tokens=".length));
    else if (arg === "--allow-pending") options.allowPending = true;
    else if (!options.workspace) options.workspace = arg;
    else fail(`Unexpected argument: ${arg}`);
  }

  if (!options.workspace) {
    fail("Usage: bun scripts/gate.ts <optimizer-workspace> [--iteration=baseline] [--max-seconds=300] [--max-tokens=0] [--allow-pending]");
  }

  if (!Number.isFinite(options.maxSeconds)) fail("--max-seconds must be a number");
  if (!Number.isFinite(options.maxTokens)) fail("--max-tokens must be a number");
  return options;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function listTracePaths(runDir: string): string[] {
  if (!existsSync(runDir)) return [];
  const proc = Bun.spawnSync(["find", runDir, "-name", "trace.json", "-type", "f"], { stdout: "pipe" });
  return proc.stdout
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function readTrace(path: string): Trace {
  return JSON.parse(readFileSync(path, "utf-8")) as Trace;
}

function isBoundaryCase(caseId: string): boolean {
  return caseId.includes("negative") || caseId.includes("adjacent") || caseId.includes("boundary");
}

function isRegressionCase(caseId: string): boolean {
  return caseId.includes("regression") || caseId.includes("negative") || caseId.includes("adjacent");
}

function hasDangerousContent(workspace: string): string[] {
  const working = join(workspace, "source", "working");
  if (!existsSync(working)) return ["source/working is missing"];
  const proc = Bun.spawnSync(["find", working, "-type", "f"], { stdout: "pipe" });
  const files = proc.stdout
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const problems: string[] = [];
  for (const file of files) {
    if (basename(file) === ".DS_Store") continue;
    const content = readFileSync(file, "utf-8");
    if (/AKIA[0-9A-Z]{16}/.test(content)) problems.push(`${file}: looks like AWS key`);
    if (/-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/.test(content)) problems.push(`${file}: private key`);
    if (/\brm\s+-rf\s+\/(?:\s|$)/.test(content)) problems.push(`${file}: destructive rm pattern`);
  }
  return problems;
}

function collectRunStats(runDir: string): RunStats {
  const tracePaths = listTracePaths(runDir);
  if (tracePaths.length === 0) fail(`No trace.json files found under ${runDir}`);

  let pending = 0;
  let failed = 0;
  let passed = 0;
  let errored = 0;
  let boundaryFailed = false;
  let regressionFailed = false;
  let seconds = 0;
  let tokens = 0;
  const evidence: string[] = [];

  for (const path of tracePaths) {
    const trace = readTrace(path);
    const caseId = trace.case_id || basename(path);
    const assertionStatuses = trace.assertions?.map((item) => item.status || "pending") ?? ["pending"];
    const caseFailed = assertionStatuses.includes("fail");
    const caseErrored = assertionStatuses.includes("error");
    const casePending = assertionStatuses.includes("pending");
    seconds += Number(trace.cost?.seconds || 0);
    tokens += Number(trace.cost?.tokens || 0);

    if (caseErrored) errored += 1;
    else if (caseFailed) failed += 1;
    else if (casePending) pending += 1;
    else passed += 1;

    if ((caseFailed || caseErrored) && isBoundaryCase(caseId)) boundaryFailed = true;
    if ((caseFailed || caseErrored) && isRegressionCase(caseId)) regressionFailed = true;
    evidence.push(`${caseId}: ${caseErrored ? "error" : caseFailed ? "fail" : casePending ? "pending" : "pass"}`);
  }

  const total = pending + failed + passed + errored;
  return {
    pending,
    failed,
    passed,
    errored,
    boundaryFailed,
    regressionFailed,
    seconds,
    tokens,
    evidence,
    passRate: total === 0 ? 0 : passed / total,
  };
}

function decide(record: Omit<GateRecord, "outcome" | "recommendation">, allowPending: boolean): Pick<GateRecord, "outcome" | "recommendation"> {
  const gate = record.gate;
  if (!gate.safety) {
    return { outcome: "discard", recommendation: "Discard or repair safety/structure before further evaluation." };
  }
  if (!gate.boundary || !gate.regression) {
    return { outcome: "discard", recommendation: "Discard mutation because boundary or regression gate failed." };
  }
  if (!gate.cost) {
    return { outcome: "keep-with-warning", recommendation: "Cost gate failed; keep only if the cost increase is justified by user value." };
  }
  if (record.failed > 0 || record.errored > 0) {
    return { outcome: "discard", recommendation: "Discard mutation because one or more assertions failed or errored." };
  }
  if (record.pending > 0 && !allowPending) {
    return { outcome: "needs-human-review", recommendation: "Resolve pending external judgment or trace assertions before keep/discard." };
  }
  if (!gate.intent_metric) {
    return { outcome: "needs-human-review", recommendation: "Intent metric is not proven; inspect traces before keeping the mutation." };
  }
  return { outcome: "keep", recommendation: "All gate dimensions passed." };
}

function main() {
  const options = parseArgs();
  const workspace = resolve(options.workspace);
  const runDir = join(workspace, "runs", options.iteration);
  const current = collectRunStats(runDir);
  const baselineDir = join(workspace, "runs", "baseline");
  const baseline = options.iteration === "baseline" || !existsSync(baselineDir) ? null : collectRunStats(baselineDir);
  const metricDeltaOk = !baseline || current.passRate >= baseline.passRate;
  const metricEvidence = baseline
    ? [`primary_metric baseline=${baseline.passRate.toFixed(3)} current=${current.passRate.toFixed(3)} delta=${(current.passRate - baseline.passRate).toFixed(3)}`]
    : [`primary_metric current=${current.passRate.toFixed(3)} baseline=n/a`];

  const safetyProblems = hasDangerousContent(workspace);
  const gateBase = {
    iteration: options.iteration,
    timestamp: new Date().toISOString(),
    gate: {
      intent_metric: metricDeltaOk && current.failed === 0 && current.errored === 0 && (current.pending === 0 || options.allowPending),
      boundary: !current.boundaryFailed,
      regression: !current.regressionFailed,
      cost: current.seconds <= options.maxSeconds && (options.maxTokens === 0 || current.tokens <= options.maxTokens),
      safety: safetyProblems.length === 0,
    },
    pending: current.pending,
    failed: current.failed,
    passed: current.passed,
    errored: current.errored,
    evidence: [...metricEvidence, ...current.evidence, ...safetyProblems],
  };
  const decision = decide(gateBase, options.allowPending);
  const record: GateRecord = {
    ...gateBase,
    ...decision,
  };

  const logsDir = join(workspace, "logs");
  writeFileSync(join(logsDir, "gates.jsonl"), `${JSON.stringify(record)}\n`, { flag: "a" });
  writeFileSync(join(logsDir, "last-gate.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
}

main();
