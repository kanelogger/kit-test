#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse } from "yaml";

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

type AuditReport = {
  skillName?: string;
  evalPlan?: Array<{
    id: string;
    type: string;
    prompt: string;
    expectedSignal: string;
    assertionOrJudge: string;
  }>;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    target: "",
    output: "",
    auditJson: "",
  };

  for (const arg of args) {
    if (arg.startsWith("--output=")) options.output = arg.slice("--output=".length);
    else if (arg.startsWith("--audit-json=")) options.auditJson = arg.slice("--audit-json=".length);
    else if (!options.target) options.target = arg;
    else fail(`Unexpected argument: ${arg}`);
  }

  if (!options.target) {
    fail("Usage: bun scripts/generate-evals.ts <skill-dir> [--output=evals/evals.json] [--audit-json=audit.json]");
  }

  return options;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseSkillName(skillDir: string): string {
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) return basename(skillDir);
  const content = readFileSync(skillMd, "utf-8").trimStart();
  if (!content.startsWith("---")) return basename(skillDir);
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) return basename(skillDir);
  const frontmatter = parse(content.slice(3, endIndex).trim()) as Record<string, unknown>;
  return typeof frontmatter?.name === "string" ? frontmatter.name : basename(skillDir);
}

function loadAuditPlan(path: string): AuditReport | null {
  if (!path) return null;
  if (!existsSync(path)) fail(`Audit JSON not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as AuditReport;
}

function assertionFor(item: NonNullable<AuditReport["evalPlan"]>[number]): EvalAssertion {
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
    criteria: item.assertionOrJudge || "Judge whether the expected signal is satisfied.",
  };
}

function splitFor(type: string): EvalCase["split"] {
  if (type === "negative-trigger" || type === "adjacent-confusion") return "regression";
  return "dev";
}

function defaultCases(skillName: string): EvalCase[] {
  return [
    {
      id: "necessity-hero-1",
      type: "necessity",
      prompt: "Representative task that baseline likely mishandles.",
      expected_signal: "With-skill behavior should improve over baseline.",
      assertions: [
        {
          name: "skill-adds-value",
          method: "external_judgment",
          expect: "yes",
          criteria: "Compare no-skill and with-skill outputs for purpose fulfillment.",
        },
      ],
      split: "dev",
      source: "generated",
      notes: `Replace with a concrete ${skillName} hero task before using as a gate-critical eval.`,
    },
    {
      id: "trigger-negative-1",
      type: "negative-trigger",
      prompt: "User asks for an adjacent but out-of-scope task.",
      expected_signal: "Skill should not trigger.",
      assertions: [
        {
          name: "should-not-trigger",
          method: "external_judgment",
          expect: "yes",
          criteria: "The request should be handled without this skill.",
        },
      ],
      split: "regression",
      source: "generated",
      notes: "Replace with a real adjacent-confusion prompt.",
    },
  ];
}

function buildSuite(skillDir: string, audit: AuditReport | null): EvalSuite {
  const skillName = audit?.skillName || parseSkillName(skillDir);
  const auditItems = audit?.evalPlan ?? [];
  const cases =
    auditItems.length > 0
      ? auditItems.map((item): EvalCase => {
          return {
            id: item.id,
            type: item.type,
            prompt: item.prompt,
            expected_signal: item.expectedSignal,
            assertions: [assertionFor(item)],
            split: splitFor(item.type),
            source: "generated",
            notes: "Generated from skill audit; review before using as holdout or strict gate.",
          };
        })
      : defaultCases(skillName);

  return {
    skill_name: skillName,
    version: 1,
    cases,
  };
}

function main() {
  const options = parseArgs();
  const skillDir = resolve(options.target);
  if (!existsSync(skillDir)) fail(`Target skill directory not found: ${skillDir}`);

  const audit = loadAuditPlan(options.auditJson);
  const suite = buildSuite(skillDir, audit);
  const output = resolve(options.output || join(skillDir, "evals", "evals.json"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(suite, null, 2)}\n`, "utf-8");
  console.log(`Eval suite written: ${output}`);
}

main();
