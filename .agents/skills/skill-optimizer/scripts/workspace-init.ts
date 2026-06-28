#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse } from "yaml";

type Severity = "blocker" | "warning" | "info";

type EvalAssertion = {
  name: string;
  method:
    | "contains"
    | "not_contains"
    | "regex"
    | "file_exists"
    | "json_path"
    | "script_check"
    | "path_hit"
    | "fact_coverage"
    | "external_judgment"
    // Backward-compatible alias for old eval files. New suites should use external_judgment.
    | "llm_judge"
    | "human_preference";
  expect: string;
  criteria: string;
};

type EvalCase = {
  id: string;
  type: string;
  prompt: string;
  expected_signal: string;
  assertions: EvalAssertion[];
  split: "dev" | "holdout" | "regression" | "flaky";
  source: "generated" | "manual";
  notes: string;
};

type EvalSuite = {
  skill_name: string;
  version: number;
  cases: EvalCase[];
};

type Finding = {
  severity: Severity;
  category: string;
  message: string;
  evidence?: string;
  recommendation?: string;
};

type AuditReport = {
  skillName: string;
  targetPath: string;
  purpose: {
    stated: string;
    inferred: string;
  };
  intent: {
    primary: string;
    secondary: string[];
    confidence: number;
    evidence: string[];
  };
  necessity: {
    judgment: string;
    rationale: string[];
  };
  findings: Finding[];
  evalPlan: Array<{
    id: string;
    type: string;
    prompt: string;
    expectedSignal: string;
    assertionOrJudge: string;
  }>;
  mutationStrategy: {
    firstLayer: string;
    rationale: string;
    avoid: string[];
  };
};

type AssertionResult = {
  name: string;
  method: EvalAssertion["method"];
  status: "pass" | "fail" | "pending" | "error";
  evidence: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    target: "",
    outDir: "",
    force: false,
  };

  for (const arg of args) {
    if (arg === "--force") options.force = true;
    else if (arg.startsWith("--out-dir=")) options.outDir = arg.slice("--out-dir=".length);
    else if (!options.target) options.target = arg;
    else fail(`Unexpected argument: ${arg}`);
  }

  if (!options.target) {
    fail("Usage: bun scripts/workspace-init.ts <skill-dir> [--out-dir=<workspace-dir>] [--force]");
  }

  return options;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseSkillMd(skillDir: string): { name: string; description: string; body: string } {
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) fail(`SKILL.md not found: ${skillMd}`);
  const content = readFileSync(skillMd, "utf-8").trimStart();
  if (!content.startsWith("---")) {
    return { name: basename(skillDir), description: "", body: content };
  }
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { name: basename(skillDir), description: "", body: content };
  }
  const frontmatter = (parse(content.slice(3, endIndex).trim()) ?? {}) as Record<string, unknown>;
  return {
    name: typeof frontmatter.name === "string" ? frontmatter.name : basename(skillDir),
    description: typeof frontmatter.description === "string" ? frontmatter.description : "",
    body: content.slice(endIndex + 4).replace(/^\r?\n/, ""),
  };
}

function includesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word.toLowerCase()));
}

function inferIntent(skillDir: string, description: string, body: string) {
  const text = `${description}\n${body}`;
  const files = Bun.spawnSync(["find", skillDir, "-maxdepth", "2", "-type", "f"], { stdout: "pipe" }).stdout.toString();
  const scores: Record<string, number> = {
    routing: 0,
    "norm-style": 0,
    workflow: 0,
    "tool-script": 0,
    "knowledge-navigation": 0,
    creative: 0,
    governance: 0,
    "meta-optimizer": 0,
  };
  const evidence: string[] = [];
  const add = (intent: string, score: number, reason: string) => {
    scores[intent] += score;
    evidence.push(`${intent}: ${reason}`);
  };

  if (includesAny(description, ["use when", "trigger", "do not use", "when the user", "用于", "不用于"])) {
    add("routing", 2, "description contains trigger or exclusion language");
  }
  if (includesAny(text, ["workflow", "phase", "step", "state", "output contract", "流程", "阶段", "状态机"])) {
    add("workflow", 3, "body uses workflow or state language");
  }
  if (includesAny(text, ["step 1", "step 2", "step 3", "## input", "## output", "### step", "输入", "输出"])) {
    add("workflow", 2, "body defines ordered steps or input/output contract");
  }
  if (files.includes("/scripts/")) add("tool-script", 4, "scripts directory present");
  if (files.includes("/references/")) add("knowledge-navigation", 2, "references directory present");
  if (includesAny(text, ["rubric", "standard", "checklist", "guideline", "规范", "标准", "审阅", "评估"])) {
    add("norm-style", 3, "rubric or standard language present");
  }
  if (includesAny(text, ["style", "brand", "creative", "visual", "image", "风格", "审美", "创作"])) {
    add("creative", 3, "creative/style language present");
  }
  if (includesAny(text, ["compliance", "audit", "risk", "security", "governance", "合规", "审计", "风险", "安全"])) {
    add("governance", 3, "governance/risk language present");
  }
  if (
    includesAny(text, [
      "optimize skill",
      "skill optimizer",
      "eval plan",
      "mutation layer",
      "self-training",
      "优化技能",
      "技能优化",
      "让Skill自己训练",
    ])
  ) {
    add("meta-optimizer", 5, "meta skill optimization language present");
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[0] || "workflow";
  const topScore = ranked[0]?.[1] || 0;
  return {
    primary,
    secondary: ranked
      .slice(1)
      .filter(([, score]) => score > 0 && score >= Math.max(2, topScore - 2))
      .map(([intent]) => intent),
    confidence: Math.min(0.95, Math.max(0.35, topScore / 8)),
    evidence: evidence.slice(0, 8),
  };
}

function auditSkill(skillDir: string): AuditReport {
  const parsed = parseSkillMd(skillDir);
  const firstBodyLine =
    parsed.body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith(">")) || "";
  const findings: Finding[] = [];

  if (!parsed.description) {
    findings.push({
      severity: "blocker",
      category: "trigger",
      message: "Missing description.",
      recommendation: "Add WHEN-focused description with trigger boundary.",
    });
  } else if (!includesAny(parsed.description, ["do not", "don't", "not use", "不用于", "不要用于"])) {
    findings.push({
      severity: "info",
      category: "trigger",
      message: "Description has no explicit negative trigger.",
      recommendation: "Add exclusions when adjacent confusion is likely.",
    });
  }

  const intent = inferIntent(skillDir, parsed.description, parsed.body);
  const evalPlan = buildEvalPlan(parsed.name, parsed.description, intent.primary);
  const blocker = findings.find((finding) => finding.severity === "blocker");
  const mutationStrategy = blocker
    ? {
        firstLayer: blocker.category === "frontmatter" || blocker.category === "trigger" ? "frontmatter" : "SKILL.md",
        rationale: `Fix blocker first: ${blocker.message}`,
        avoid: ["Do not start self-training while blockers exist."],
      }
    : {
        firstLayer:
          intent.primary === "routing"
            ? "frontmatter"
            : intent.primary === "tool-script"
              ? "scripts"
              : intent.primary === "knowledge-navigation"
                ? "references"
                : intent.primary === "meta-optimizer"
                  ? "evals or references"
                  : "SKILL.md",
        rationale: `Primary intent ${intent.primary} suggests this layer is most likely to move the metric.`,
        avoid: ["Do not use a heavier mechanism until the current layer fails.", "Do not mutate without eval guard."],
      };

  return {
    skillName: parsed.name,
    targetPath: skillDir,
    purpose: {
      stated: parsed.description || firstBodyLine || "No stated purpose found.",
      inferred: firstBodyLine || parsed.description || "Needs human review.",
    },
    intent,
    necessity: {
      judgment: findings.some((finding) => finding.severity === "blocker") ? "needs-human-review" : "keep-and-optimize",
      rationale: [
        "Workspace initialization cannot prove baseline increment; run hero queries before deep optimization.",
        `Primary intent inferred as ${intent.primary}.`,
      ],
    },
    findings,
    evalPlan,
    mutationStrategy,
  };
}

function buildEvalPlan(skillName: string, description: string, intent: string): AuditReport["evalPlan"] {
  const target = skillName || "this skill";
  const quoted = [...description.matchAll(/"([^"]{3,80})"/g)].map((match) => match[1].trim())[0];
  const positivePrompt = quoted
    ? `User asks: "${quoted}"`
    : intent === "tool-script"
      ? `User provides a valid input file/path and asks ${target} to produce its normal artifact.`
      : intent === "meta-optimizer"
        ? "User asks to audit and improve an Agent Skill with intent-specific evals."
        : `User asks ${target} to complete its representative task.`;

  const common = [
    {
      id: "trigger-positive-1",
      type: "positive-trigger",
      prompt: positivePrompt,
      expectedSignal: `${target} should be selected or considered useful.`,
      assertionOrJudge: "External judgment: should trigger? YES/NO with evidence from description.",
    },
    {
      id: "trigger-negative-1",
      type: "negative-trigger",
      prompt: "User asks for an adjacent but out-of-scope task.",
      expectedSignal: `${target} should not be selected.`,
      assertionOrJudge: "External judgment: should not trigger? YES/NO with adjacent-boundary evidence.",
    },
    {
      id: "necessity-hero-1",
      type: "necessity",
      prompt: "Representative hero query that baseline likely mishandles.",
      expectedSignal: "With-skill behavior should improve over baseline.",
      assertionOrJudge: "A/B compare baseline vs with-skill for purpose fulfillment.",
    },
  ];

  const extras: Record<string, AuditReport["evalPlan"]> = {
    routing: [
      {
        id: "adjacent-confusion-1",
        type: "adjacent-confusion",
        prompt: "A prompt that shares vocabulary with this skill but needs a different skill.",
        expectedSignal: "Skill should remain silent.",
        assertionOrJudge: "Description-only discovery eval.",
      },
    ],
    workflow: [
      {
        id: "workflow-stage-coverage-1",
        type: "stage-coverage",
        prompt: "Representative multi-step task.",
        expectedSignal: "All required stages are completed in order or skipped with valid reason.",
        assertionOrJudge: "Check stage list, branch conditions, and output contract.",
      },
    ],
    "tool-script": [
      {
        id: "script-recovery-1",
        type: "script-recovery",
        prompt: "Task with missing dependency or invalid input.",
        expectedSignal: "Skill detects failure and gives recoverable next step.",
        assertionOrJudge: "Run fixture or inspect script stderr/stdout contract.",
      },
    ],
    "knowledge-navigation": [
      {
        id: "path-hit-1",
        type: "path-hit",
        prompt: "Knowledge query that should load a specific reference.",
        expectedSignal: "Correct reference path is read, wrong adjacent path is avoided.",
        assertionOrJudge: "Trace loaded files and fact coverage.",
      },
    ],
    "norm-style": [
      {
        id: "rubric-1",
        type: "rubric",
        prompt: "Representative output requiring the skill's standard or style.",
        expectedSignal: "Output follows rubric without generic advice.",
        assertionOrJudge: "Rubric score with gotcha regression.",
      },
    ],
    creative: [
      {
        id: "style-qa-1",
        type: "style-rubric",
        prompt: "Representative creative generation request.",
        expectedSignal: "Output matches style DNA and avoids forbidden patterns.",
        assertionOrJudge: "External or human preference judgment with concrete visual/style criteria.",
      },
    ],
    governance: [
      {
        id: "governance-escalation-1",
        type: "governance",
        prompt: "Task requiring allow/deny/escalate decision.",
        expectedSignal: "Skill checks rule before action and records evidence.",
        assertionOrJudge: "Rule pass and audit trace completeness.",
      },
    ],
    "meta-optimizer": [
      {
        id: "intent-diagnosis-1",
        type: "meta-intent",
        prompt: "Audit a short routing skill and a tool skill.",
        expectedSignal: "Optimizer selects different intent and mutation strategy for each.",
        assertionOrJudge: "Compare diagnosis against expected intent labels.",
      },
    ],
  };

  return [...common, ...(extras[intent] || [])];
}

function assertionFor(item: AuditReport["evalPlan"][number]): EvalAssertion {
  if (item.type === "negative-trigger" || item.type === "adjacent-confusion") {
    return {
      name: "should-not-trigger",
      method: "external_judgment",
      expect: "yes",
      criteria: "The target skill should not be selected for this prompt.",
    };
  }
  if (item.type === "script-recovery") {
    return {
      name: "recoverable-failure",
      method: "human_preference",
      expect: "yes",
      criteria: "The skill should expose a recoverable next step instead of silently failing.",
    };
  }
  return {
    name: item.type === "necessity" ? "skill-adds-value" : "should-pass",
    method: "external_judgment",
    expect: "yes",
    criteria: item.assertionOrJudge,
  };
}

function loadExistingSuite(skillDir: string): EvalSuite | null {
  const path = join(skillDir, "evals", "evals.json");
  if (!existsSync(path)) return null;
  const suite = JSON.parse(readFileSync(path, "utf-8")) as EvalSuite;
  if (!suite.skill_name || !Array.isArray(suite.cases)) fail(`Invalid eval suite: ${path}`);
  return suite;
}

function buildSuite(report: AuditReport, existingSuite: EvalSuite | null): EvalSuite {
  if (existingSuite) return existingSuite;
  return {
    skill_name: report.skillName,
    version: 1,
    cases: report.evalPlan.map((item) => ({
      id: item.id,
      type: item.type,
      prompt: item.prompt,
      expected_signal: item.expectedSignal,
      assertions: [assertionFor(item)],
      split: item.type === "negative-trigger" || item.type === "adjacent-confusion" ? "regression" : "dev",
      source: "generated",
      notes: "Generated during workspace initialization; review before using as holdout or strict gate.",
    })),
  };
}

function splitSuite(suite: EvalSuite, split: EvalCase["split"]): EvalSuite {
  return {
    skill_name: suite.skill_name,
    version: suite.version,
    cases: suite.cases.filter((item) => item.split === split),
  };
}

function evaluateAssertion(assertion: EvalAssertion, response: string, targetSkillDir: string): AssertionResult {
  if (assertion.method === "contains") {
    const passed = response.includes(assertion.expect);
    return {
      name: assertion.name,
      method: assertion.method,
      status: passed ? "pass" : "fail",
      evidence: passed ? `Response contains ${JSON.stringify(assertion.expect)}.` : "Expected text was not found.",
    };
  }
  if (assertion.method === "not_contains") {
    const passed = !response.includes(assertion.expect);
    return {
      name: assertion.name,
      method: assertion.method,
      status: passed ? "pass" : "fail",
      evidence: passed ? `Response does not contain ${JSON.stringify(assertion.expect)}.` : "Forbidden text was found.",
    };
  }
  if (assertion.method === "regex") {
    const regex = new RegExp(assertion.expect, "m");
    const passed = regex.test(response);
    return {
      name: assertion.name,
      method: assertion.method,
      status: passed ? "pass" : "fail",
      evidence: passed ? `Response matches /${assertion.expect}/.` : `Response does not match /${assertion.expect}/.`,
    };
  }
  if (assertion.method === "file_exists") {
    const path = resolve(targetSkillDir, assertion.expect);
    const passed = existsSync(path);
    return {
      name: assertion.name,
      method: assertion.method,
      status: passed ? "pass" : "fail",
      evidence: passed ? `File exists: ${path}` : `File missing: ${path}`,
    };
  }
  if (assertion.method === "path_hit") {
    const path = resolve(targetSkillDir, assertion.expect);
    const passed = existsSync(path) && response.includes(assertion.expect);
    return {
      name: assertion.name,
      method: assertion.method,
      status: passed ? "pass" : "fail",
      evidence: passed ? `Corpus includes expected path and file exists: ${assertion.expect}` : `Expected path missing: ${assertion.expect}`,
    };
  }
  if (assertion.method === "fact_coverage") {
    const terms = assertion.expect
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    const missing = terms.filter((term) => !response.includes(term));
    return {
      name: assertion.name,
      method: assertion.method,
      status: missing.length === 0 ? "pass" : "fail",
      evidence: missing.length === 0 ? `All ${terms.length} expected terms found.` : `Missing terms: ${missing.join(", ")}`,
    };
  }
  if (assertion.method === "script_check") {
    const path = resolve(targetSkillDir, assertion.expect);
    const passed = existsSync(path) && readFileSync(path, "utf-8").includes("#!/usr/bin/env bun");
    return {
      name: assertion.name,
      method: assertion.method,
      status: passed ? "pass" : "fail",
      evidence: passed ? `Script exists with Bun shebang: ${assertion.expect}` : `Script check failed: ${assertion.expect}`,
    };
  }
  return {
    name: assertion.name,
    method: assertion.method,
    status: "pending",
    evidence: `${assertion.method} requires external execution, trace inspection, or human review evidence.`,
  };
}

function readCorpus(root: string): string {
  const parts: string[] = [];
  const skipDirs = new Set([".git", "node_modules", "evals", "runs", "logs", "checkpoints", "restore-backups"]);
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === ".DS_Store" || skipDirs.has(entry)) continue;
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (!stat.isFile() || !/\.(md|json|ts|js|yml|yaml|txt)$/.test(entry)) continue;
      parts.push(`\n--- ${path.slice(root.length + 1)} ---\n${readFileSync(path, "utf-8")}`);
    }
  }
  walk(root);
  return parts.join("\n");
}

function caseStatus(results: AssertionResult[]): "pass" | "fail" | "pending" | "error" {
  if (results.some((item) => item.status === "error")) return "error";
  if (results.some((item) => item.status === "fail")) return "fail";
  if (results.some((item) => item.status === "pending")) return "pending";
  return "pass";
}

function runBaseline(workspace: string, suite: EvalSuite) {
  const runDir = join(workspace, "runs", "baseline");
  mkdirSync(runDir, { recursive: true });
  const started = Date.now();
  const rows: Array<{ item: EvalCase; status: "pass" | "fail" | "pending" | "error" }> = [];
  const working = join(workspace, "source", "working");
  const corpus = readCorpus(working);

  for (const item of suite.cases) {
    const results = item.assertions.map((assertion) => evaluateAssertion(assertion, corpus, working));
    const status = caseStatus(results);
    const caseDir = join(runDir, `eval-${item.id}`);
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(
      join(caseDir, "trace.json"),
      `${JSON.stringify(
        {
          case_id: item.id,
          prompt: item.prompt,
          expected: item.expected_signal,
          skill_version: "baseline",
          loaded_files: [],
          scripts_run: [],
          output_paths: [],
          assertions: results,
          judge: {
            passed: status === "pass" ? true : status === "fail" ? false : null,
            evidence: results.map((result) => `${result.name}: ${result.evidence}`).join(" | "),
          },
          failure_mode: status === "pass" ? "" : status,
          cost: {
            tokens: 0,
            seconds: 0,
          },
        },
        null,
        2
      )}\n`,
      "utf-8"
    );
    rows.push({ item, status });
  }

  const bySplit = (split: EvalCase["split"]) => rows.filter((row) => row.item.split === split);
  const passRate = (items: typeof rows) =>
    items.length === 0 ? "n/a" : (items.filter((row) => row.status === "pass").length / items.length).toFixed(3);
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const failedCount = rows.filter((row) => row.status === "fail" || row.status === "error").length;
  const decision = failedCount > 0 ? "discard" : pendingCount > 0 ? "needs-human-review" : "keep";
  const elapsed = (Date.now() - started) / 1000;
  const logsDir = join(workspace, "logs");
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(
    join(logsDir, "results.tsv"),
    [
      [
        "iteration",
        "timestamp",
        "mutation_layer",
        "decision",
        "primary_metric_before",
        "primary_metric_after",
        "dev_pass_rate",
        "holdout_pass_rate",
        "regression_pass_rate",
        "cost_tokens",
        "cost_seconds",
        "changed_files",
        "notes",
      ].join("\t"),
      `baseline\t${new Date().toISOString()}\tevals\t${decision}\tn/a\tn/a\t${passRate(bySplit("dev"))}\t${passRate(
        bySplit("holdout")
      )}\t${passRate(bySplit("regression"))}\t0\t${elapsed.toFixed(3)}\tn/a\t${rows.length} cases, ${pendingCount} pending, ${failedCount} failed`,
      "",
    ].join("\n"),
    "utf-8"
  );
  writeFileSync(join(logsDir, "experiments.jsonl"), "", "utf-8");
  writeFileSync(join(logsDir, "decisions.jsonl"), "", "utf-8");
  return { decision, pendingCount, failedCount, caseCount: rows.length };
}

function writeEvolvePlan(workspace: string, report: AuditReport, baseline: ReturnType<typeof runBaseline>) {
  const reportDir = join(workspace, "reports");
  mkdirSync(reportDir, { recursive: true });
  const blockers = report.findings.filter((finding) => finding.severity === "blocker");
  const warnings = report.findings.filter((finding) => finding.severity === "warning");
  const content = `# Evolve Plan

## Target

- Skill: \`${report.skillName}\`
- Original: \`${report.targetPath}\`
- Workspace: \`${workspace}\`

## Purpose

- Stated: ${report.purpose.stated}
- Inferred: ${report.purpose.inferred}

## Necessity

- Judgment: \`${report.necessity.judgment}\`
- Rationale:
${report.necessity.rationale.map((item) => `  - ${item}`).join("\n")}

## Intent

- Primary: \`${report.intent.primary}\` (${Math.round(report.intent.confidence * 100)}% confidence)
- Secondary: ${report.intent.secondary.length ? report.intent.secondary.map((item) => `\`${item}\``).join(", ") : "none"}
- Evidence:
${report.intent.evidence.map((item) => `  - ${item}`).join("\n") || "  - Needs human review."}

## Eval Suites

- Main suite: \`evals/evals.json\`
- Dev split: \`evals/dev.json\`
- Holdout split: \`evals/holdout.json\`
- Regression split: \`evals/regression.json\`
- Flaky split: \`evals/flaky.json\`

## Baseline

- Decision: \`${baseline.decision}\`
- Cases: ${baseline.caseCount}
- Pending: ${baseline.pendingCount}
- Failed: ${baseline.failedCount}
- Trace directory: \`runs/baseline/\`
- Results log: \`logs/results.tsv\`

## Findings

- Blockers: ${blockers.length}
- Warnings: ${warnings.length}
${report.findings.map((finding) => `- **${finding.severity} / ${finding.category}**: ${finding.message}`).join("\n") || "- No deterministic findings."}

## Mutation Start

- First layer: ${report.mutationStrategy.firstLayer}
- Rationale: ${report.mutationStrategy.rationale}
- Avoid:
${report.mutationStrategy.avoid.map((item) => `  - ${item}`).join("\n")}

## Gate

Use AND gate:

- intent metric does not regress;
- trigger boundary does not regress;
- regression cases pass or are explicitly marked bad GT/flaky;
- cost/context does not grow without purpose;
- safety and structure stay valid.

Pending critical assertions require human or external judge review before keep/discard.

## Stop Conditions

- target metric reached;
- blockers remain unresolved after focused mutation;
- eval signal is mostly pending or disputed;
- current mutation layer exhausted;
- user budget or instruction stops.
`;
  writeFileSync(join(reportDir, "evolve-plan.md"), content, "utf-8");
}

function main() {
  const options = parseArgs();
  const target = resolve(options.target);
  if (!existsSync(target)) fail(`Target skill directory not found: ${target}`);
  const skillName = parseSkillMd(target).name;
  const workspace = resolve(options.outDir || join(dirname(target), `${skillName}-optimizer-workspace`));

  if (existsSync(workspace)) {
    if (!options.force) fail(`Workspace already exists: ${workspace}. Use --force to replace it.`);
    rmSync(workspace, { recursive: true, force: true });
  }

  mkdirSync(workspace, { recursive: true });
  mkdirSync(join(workspace, "source"), { recursive: true });
  const copyFilter = (source: string) => {
    const name = basename(source);
    return name !== ".DS_Store" && name !== ".git" && name !== "node_modules";
  };
  cpSync(target, join(workspace, "source", "original"), { recursive: true, filter: copyFilter });
  cpSync(target, join(workspace, "source", "working"), { recursive: true, filter: copyFilter });

  const report = auditSkill(join(workspace, "source", "working"));
  report.targetPath = target;
  const suite = buildSuite(report, loadExistingSuite(join(workspace, "source", "working")));
  mkdirSync(join(workspace, "evals"), { recursive: true });
  writeFileSync(join(workspace, "evals", "evals.json"), `${JSON.stringify(suite, null, 2)}\n`, "utf-8");
  for (const split of ["dev", "holdout", "regression", "flaky"] as const) {
    writeFileSync(join(workspace, "evals", `${split}.json`), `${JSON.stringify(splitSuite(suite, split), null, 2)}\n`, "utf-8");
  }
  const baseline = runBaseline(workspace, suite);
  writeEvolvePlan(workspace, report, baseline);
  const skillRoot = resolve(join(dirname(new URL(import.meta.url).pathname), ".."));
  const checkpointScript = join(skillRoot, "scripts", "checkpoint.ts");
  const checkpoint = Bun.spawnSync([
    "bun",
    checkpointScript,
    workspace,
    "--iteration=baseline",
    "--mutation-layer=initial",
    "--summary=Initial restorable checkpoint created by workspace-init.",
  ], { stdout: "pipe", stderr: "pipe" });
  if (checkpoint.exitCode !== 0) {
    fail([checkpoint.stdout.toString(), checkpoint.stderr.toString()].filter(Boolean).join("\n"));
  }
  writeFileSync(join(workspace, "logs", "last-restorable-checkpoint.txt"), "baseline\n", "utf-8");

  console.log(
    JSON.stringify(
      {
        workspace,
        skill_name: report.skillName,
        primary_intent: report.intent.primary,
        eval_cases: suite.cases.length,
        baseline_decision: baseline.decision,
        pending: baseline.pendingCount,
        failed: baseline.failedCount,
        evolve_plan: join(workspace, "reports", "evolve-plan.md"),
      },
      null,
      2
    )
  );
}

main();
