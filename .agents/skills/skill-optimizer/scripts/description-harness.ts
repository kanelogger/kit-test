#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

type Split = "dev" | "holdout" | "regression" | "flaky";

type HarnessCase = {
  id: string;
  query: string;
  should_trigger: boolean;
  reason: string;
  split: Split;
  type?: "should-trigger" | "should-not-trigger" | "adjacent-confusion";
};

type HarnessSuite = {
  skill_name: string;
  description?: string;
  previous_descriptions?: string[];
  skill_md?: string;
  skill_md_path?: string;
  cases: HarnessCase[];
};

type HarnessRun = {
  case_id: string;
  run: number;
  triggered: boolean;
  evidence: string;
};

type HarnessResults = {
  runs: HarnessRun[];
};

type CaseOutcome = {
  id: string;
  split: Split;
  type: string;
  expected: boolean;
  observed: boolean | null;
  pass: boolean | null;
  triggered_runs: number;
  total_runs: number;
  evidence: string[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    casesPath: "",
    resultsPath: "",
    outputPath: "",
    packetPath: "",
    skillMdPath: "",
    threshold: 0.5,
  };

  for (const arg of args) {
    if (arg.startsWith("--cases=")) options.casesPath = arg.slice("--cases=".length);
    else if (arg.startsWith("--results=")) options.resultsPath = arg.slice("--results=".length);
    else if (arg.startsWith("--output=")) options.outputPath = arg.slice("--output=".length);
    else if (arg.startsWith("--packet=")) options.packetPath = arg.slice("--packet=".length);
    else if (arg.startsWith("--skill-md=")) options.skillMdPath = arg.slice("--skill-md=".length);
    else if (arg.startsWith("--threshold=")) {
      const value = Number(arg.slice("--threshold=".length));
      if (!Number.isFinite(value) || value <= 0 || value > 1) fail("--threshold must be > 0 and <= 1");
      options.threshold = value;
    } else {
      fail(`Unexpected argument: ${arg}`);
    }
  }

  if (!options.casesPath) {
    fail(
      "Usage: bun scripts/description-harness.ts --cases=cases.json [--results=results.json] [--output=summary.json] [--packet=failure-packet.md] [--threshold=0.5]"
    );
  }

  return options;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function readJson<T>(path: string): T {
  const resolved = resolve(path);
  if (!existsSync(resolved)) fail(`File not found: ${resolved}`);
  return JSON.parse(readFileSync(resolved, "utf-8")) as T;
}

function writeJson(path: string, value: unknown) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeText(path: string, value: string) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, value.endsWith("\n") ? value : `${value}\n`, "utf-8");
}

function validateSuite(suite: HarnessSuite) {
  const errors: string[] = [];
  if (!suite || typeof suite !== "object") errors.push("suite must be a JSON object");
  if (!suite.skill_name || typeof suite.skill_name !== "string") errors.push("skill_name is required");
  if (!Array.isArray(suite.cases)) errors.push("cases must be an array");
  if (suite.previous_descriptions !== undefined && !Array.isArray(suite.previous_descriptions)) {
    errors.push("previous_descriptions must be an array when provided");
  }

  const ids = new Set<string>();
  const validSplits = new Set<Split>(["dev", "holdout", "regression", "flaky"]);
  for (const item of suite.cases ?? []) {
    if (!item.id) errors.push("case.id is required");
    if (ids.has(item.id)) errors.push(`duplicate case id: ${item.id}`);
    ids.add(item.id);
    if (!item.query || typeof item.query !== "string") errors.push(`${item.id}: query is required`);
    if (typeof item.should_trigger !== "boolean") errors.push(`${item.id}: should_trigger must be boolean`);
    if (!item.reason || typeof item.reason !== "string") errors.push(`${item.id}: reason is required`);
    if (!validSplits.has(item.split)) errors.push(`${item.id}: split must be dev, holdout, regression, or flaky`);
  }

  const devCount = suite.cases?.filter((item) => item.split === "dev").length ?? 0;
  const holdoutCount = suite.cases?.filter((item) => item.split === "holdout").length ?? 0;
  if ((suite.cases?.length ?? 0) >= 6 && (devCount === 0 || holdoutCount === 0)) {
    errors.push("case set with 6+ cases should include both dev and holdout splits");
  }

  if (errors.length > 0) fail(`Invalid description harness suite:\n- ${errors.join("\n- ")}`);
}

function validateResults(results: HarnessResults, suite: HarnessSuite) {
  const errors: string[] = [];
  if (!results || typeof results !== "object") errors.push("results must be a JSON object");
  if (!Array.isArray(results.runs)) errors.push("runs must be an array");

  const caseIds = new Set(suite.cases.map((item) => item.id));
  for (const run of results.runs ?? []) {
    if (!run.case_id || typeof run.case_id !== "string") errors.push("run.case_id is required");
    else if (!caseIds.has(run.case_id)) errors.push(`run references unknown case_id: ${run.case_id}`);
    if (!Number.isInteger(run.run) || run.run <= 0) errors.push(`${run.case_id}: run must be a positive integer`);
    if (typeof run.triggered !== "boolean") errors.push(`${run.case_id}: triggered must be boolean`);
    if (!run.evidence || typeof run.evidence !== "string") errors.push(`${run.case_id}: evidence is required`);
  }

  if (errors.length > 0) fail(`Invalid description harness results:\n- ${errors.join("\n- ")}`);
}

function caseType(item: HarnessCase): string {
  if (item.type) return item.type;
  return item.should_trigger ? "should-trigger" : "should-not-trigger";
}

function decideObserved(runs: HarnessRun[], threshold: number): boolean | null {
  if (runs.length === 0) return null;
  const triggered = runs.filter((run) => run.triggered).length;
  return triggered / runs.length >= threshold;
}

function summarize(suite: HarnessSuite, results: HarnessResults | null, threshold: number) {
  const byCase = new Map<string, HarnessRun[]>();
  for (const run of results?.runs ?? []) {
    byCase.set(run.case_id, [...(byCase.get(run.case_id) ?? []), run]);
  }

  const outcomes: CaseOutcome[] = suite.cases.map((item) => {
    const runs = byCase.get(item.id) ?? [];
    const observed = decideObserved(runs, threshold);
    const pass = observed === null ? null : observed === item.should_trigger;
    return {
      id: item.id,
      split: item.split,
      type: caseType(item),
      expected: item.should_trigger,
      observed,
      pass,
      triggered_runs: runs.filter((run) => run.triggered).length,
      total_runs: runs.length,
      evidence: runs.map((run) => `run ${run.run}: ${run.evidence}`),
    };
  });

  const completed = outcomes.filter((item) => item.pass !== null);
  const passCount = completed.filter((item) => item.pass).length;
  const falseNegatives = outcomes.filter((item) => item.pass === false && item.expected);
  const falsePositives = outcomes.filter((item) => item.pass === false && !item.expected);
  const adjacentFailures = outcomes.filter((item) => item.pass === false && item.type === "adjacent-confusion");

  const splitSummary = (split: Split) => {
    const rows = outcomes.filter((item) => item.split === split);
    const done = rows.filter((item) => item.pass !== null);
    const passed = done.filter((item) => item.pass).length;
    return {
      cases: rows.length,
      completed: done.length,
      pass_rate: done.length === 0 ? null : Number((passed / done.length).toFixed(3)),
      pending: rows.length - done.length,
    };
  };

  return {
    skill_name: suite.skill_name,
    description: suite.description ?? "",
    threshold,
    case_count: suite.cases.length,
    completed_cases: completed.length,
    pass_rate: completed.length === 0 ? null : Number((passCount / completed.length).toFixed(3)),
    splits: {
      dev: splitSummary("dev"),
      holdout: splitSummary("holdout"),
      regression: splitSummary("regression"),
      flaky: splitSummary("flaky"),
    },
    false_negatives: falseNegatives.map((item) => item.id),
    false_positives: falsePositives.map((item) => item.id),
    adjacent_confusion_failures: adjacentFailures.map((item) => item.id),
    outcomes,
  };
}

function resolveMaybeRelative(path: string, baseFile: string): string {
  if (isAbsolute(path)) return path;
  return resolve(dirname(resolve(baseFile)), path);
}

function readSkillMdForPacket(suite: HarnessSuite, casesPath: string, argPath: string): string {
  if (argPath) {
    const resolved = resolve(argPath);
    if (!existsSync(resolved)) fail(`SKILL.md file not found: ${resolved}`);
    return readFileSync(resolved, "utf-8");
  }
  if (suite.skill_md !== undefined) return suite.skill_md;
  if (suite.skill_md_path) {
    const resolved = resolveMaybeRelative(suite.skill_md_path, casesPath);
    if (!existsSync(resolved)) fail(`skill_md_path file not found: ${resolved}`);
    return readFileSync(resolved, "utf-8");
  }
  return "";
}

function renderPacket(suite: HarnessSuite, summary: ReturnType<typeof summarize>, skillMd: string): string {
  const failed = summary.outcomes.filter((item) => item.pass === false);
  const lines = [
    "# Description Trigger Failure Packet",
    "",
    `Target skill: ${suite.skill_name}`,
    `Current description: ${suite.description ?? ""}`,
    `Case count: ${summary.case_count}`,
    `Completed cases: ${summary.completed_cases}`,
    `Pass rate: ${summary.pass_rate ?? "n/a"}`,
    "",
    "## False Negatives",
    ...(summary.false_negatives.length ? summary.false_negatives.map((id) => `- ${id}`) : ["- none"]),
    "",
    "## False Positives",
    ...(summary.false_positives.length ? summary.false_positives.map((id) => `- ${id}`) : ["- none"]),
    "",
    "## Adjacent-Confusion Failures",
    ...(summary.adjacent_confusion_failures.length ? summary.adjacent_confusion_failures.map((id) => `- ${id}`) : ["- none"]),
    "",
    "## Failed Evidence",
  ];

  if (failed.length === 0) {
    lines.push("- none");
  } else {
    for (const item of failed) {
      lines.push(`- ${item.id}: expected=${item.expected}, observed=${item.observed}, triggered=${item.triggered_runs}/${item.total_runs}`);
      for (const evidence of item.evidence) lines.push(`  - ${evidence}`);
    }
  }

  lines.push(
    "",
    "## Previous Descriptions",
    ...(suite.previous_descriptions?.length ? suite.previous_descriptions.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Full SKILL.md",
    "",
    "```markdown",
    skillMd || "(not supplied)",
    "```",
    "",
    "## Proposal Fields To Fill",
    "",
    "Hypothesis:",
    "Proposed description:",
    "Expected metric movement:",
    "Regression guard:"
  );

  return lines.join("\n");
}

function main() {
  const options = parseArgs();
  const suite = readJson<HarnessSuite>(options.casesPath);
  validateSuite(suite);

  const results = options.resultsPath ? readJson<HarnessResults>(options.resultsPath) : null;
  if (results) validateResults(results, suite);

  const summary = summarize(suite, results, options.threshold);
  if (options.outputPath) writeJson(options.outputPath, summary);
  if (options.packetPath) writeText(options.packetPath, renderPacket(suite, summary, readSkillMdForPacket(suite, options.casesPath, options.skillMdPath)));
  console.log(JSON.stringify(summary, null, 2));
}

main();
