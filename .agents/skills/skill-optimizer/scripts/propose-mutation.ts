#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type Trace = {
  case_id?: string;
  prompt?: string;
  expected?: string;
  assertions?: Array<{
    name?: string;
    method?: string;
    status?: string;
    evidence?: string;
  }>;
  failure_mode?: string;
};

type Proposal = {
  iteration: string;
  timestamp: string;
  target_case: string;
  observed_failure: string;
  trace_evidence: string[];
  hypothesis: string;
  mutation_layer: string;
  proposed_atomic_change: string;
  expected_metric_movement: string;
  regression_guard: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    workspace: "",
    iteration: "baseline",
    output: "",
  };

  for (const arg of args) {
    if (arg.startsWith("--iteration=")) options.iteration = arg.slice("--iteration=".length);
    else if (arg.startsWith("--output=")) options.output = arg.slice("--output=".length);
    else if (!options.workspace) options.workspace = arg;
    else fail(`Unexpected argument: ${arg}`);
  }

  if (!options.workspace) {
    fail("Usage: bun scripts/propose-mutation.ts <optimizer-workspace> [--iteration=baseline] [--output=reports/mutation-proposal.json]");
  }
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

function chooseLayer(trace: Trace): string {
  const text = `${trace.case_id || ""}\n${trace.prompt || ""}\n${trace.expected || ""}\n${JSON.stringify(trace.assertions || [])}`.toLowerCase();
  if (text.includes("negative") || text.includes("adjacent") || text.includes("trigger")) return "frontmatter";
  if (text.includes("path_hit") || text.includes("fact_coverage") || text.includes("reference")) return "references";
  if (text.includes("script") || text.includes("tool") || text.includes("recovery")) return "scripts";
  if (text.includes("eval") || text.includes("judge") || text.includes("metric")) return "evals";
  return "SKILL.md";
}

function findTargetTrace(paths: string[]): { path: string; trace: Trace } | null {
  for (const path of paths) {
    const trace = readTrace(path);
    const statuses = trace.assertions?.map((assertion) => assertion.status || "pending") ?? ["pending"];
    if (statuses.some((status) => status === "fail" || status === "error" || status === "pending")) {
      return { path, trace };
    }
  }
  return null;
}

function buildProposal(iteration: string, tracePath: string, trace: Trace): Proposal {
  const failedAssertions =
    trace.assertions
      ?.filter((assertion) => assertion.status !== "pass")
      .map((assertion) => `${assertion.name || "assertion"} (${assertion.method || "unknown"}): ${assertion.evidence || assertion.status || "no evidence"}`) ??
    [];
  const layer = chooseLayer(trace);
  return {
    iteration,
    timestamp: new Date().toISOString(),
    target_case: trace.case_id || basename(tracePath),
    observed_failure: trace.failure_mode || failedAssertions[0] || "No failing trace found.",
    trace_evidence: failedAssertions.length ? failedAssertions : [`Trace: ${tracePath}`],
    hypothesis: `The target skill likely needs a focused ${layer} mutation to satisfy ${trace.case_id || "the selected case"}.`,
    mutation_layer: layer,
    proposed_atomic_change:
      layer === "frontmatter"
        ? "Tighten the description trigger boundary with one positive trigger and one adjacent negative exclusion."
        : layer === "references"
          ? "Add or correct the smallest reference routing entry needed by the failed case."
          : layer === "scripts"
            ? "Add validation or recovery output for the failing deterministic operation."
            : layer === "evals"
              ? "Clarify the eval assertion, mark bad ground truth, or add an external judgment for pending cases."
              : "Clarify the workflow step, branch condition, or output contract tied to the failed case.",
    expected_metric_movement: "The selected case should move from fail/pending to pass without reducing boundary, regression, cost, or safety gates.",
    regression_guard: `Keep ${trace.case_id || "the selected case"} in dev/regression and rerun gate before accepting the mutation.`,
  };
}

function main() {
  const options = parseArgs();
  const workspace = resolve(options.workspace);
  const runDir = join(workspace, "runs", options.iteration);
  const paths = listTracePaths(runDir);
  if (paths.length === 0) fail(`No trace.json files found under ${runDir}`);
  const selected = findTargetTrace(paths);
  if (!selected) fail(`No failed, errored, or pending traces found under ${runDir}`);

  const proposal = buildProposal(options.iteration, selected.path, selected.trace);
  const output = resolve(options.output || join(workspace, "reports", "mutation-proposal.json"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(proposal, null, 2)}\n`, "utf-8");

  const logsDir = join(workspace, "logs");
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(
    join(logsDir, "experiments.jsonl"),
    `${JSON.stringify({
      iteration: options.iteration,
      mutation_layer: proposal.mutation_layer,
      target_cases: [proposal.target_case],
      hypothesis: proposal.hypothesis,
      change: proposal.proposed_atomic_change,
      evidence: [selected.path],
      decision: "proposed",
    })}\n`,
    { flag: "a" }
  );

  console.log(JSON.stringify(proposal, null, 2));
}

main();
