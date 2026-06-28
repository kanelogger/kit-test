#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type AuditReport = {
  skillName: string;
  intent: {
    primary: string;
  };
  mutationStrategy: {
    firstLayer: string;
  };
  evalPlan: Array<{
    type: string;
  }>;
  findings: Array<{
    severity: string;
    category: string;
    message: string;
  }>;
};

type FixtureExpectation = {
  path: string;
  primaryIntent: string;
  mutationLayerIncludes: string;
  evalTypes: string[];
};

const root = resolve(join(dirname(new URL(import.meta.url).pathname), ".."));

const expectations: FixtureExpectation[] = [
  {
    path: "assets/fixtures/routing-skill",
    primaryIntent: "routing",
    mutationLayerIncludes: "frontmatter",
    evalTypes: ["positive-trigger", "negative-trigger", "adjacent-confusion"],
  },
  {
    path: "assets/fixtures/tool-script-skill",
    primaryIntent: "tool-script",
    mutationLayerIncludes: "scripts",
    evalTypes: ["positive-trigger", "negative-trigger", "script-recovery"],
  },
  {
    path: "assets/fixtures/workflow-knowledge-skill",
    primaryIntent: "knowledge-navigation",
    mutationLayerIncludes: "references",
    evalTypes: ["positive-trigger", "negative-trigger", "path-hit"],
  },
];

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function runAudit(fixturePath: string): AuditReport {
  const auditScript = join(root, "scripts", "audit-skill.ts");
  const target = join(root, fixturePath);
  if (!existsSync(target)) fail(`Fixture missing: ${target}`);
  const proc = Bun.spawnSync(["bun", auditScript, target, "--format=json"], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    fail([`Audit failed for ${fixturePath}`, proc.stdout.toString(), proc.stderr.toString()].filter(Boolean).join("\n"));
  }
  return JSON.parse(proc.stdout.toString()) as AuditReport;
}

function assertIncludes(actual: string, expected: string, context: string) {
  if (!actual.includes(expected)) fail(`${context}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
}

function main() {
  const results = [];
  for (const expectation of expectations) {
    const report = runAudit(expectation.path);
    if (report.intent.primary !== expectation.primaryIntent) {
      fail(`${expectation.path}: expected primary intent ${expectation.primaryIntent}, got ${report.intent.primary}`);
    }
    assertIncludes(report.mutationStrategy.firstLayer, expectation.mutationLayerIncludes, `${expectation.path} mutation layer`);
    const types = new Set(report.evalPlan.map((item) => item.type));
    for (const type of expectation.evalTypes) {
      if (!types.has(type)) fail(`${expectation.path}: missing eval type ${type}`);
    }
    const blockers = report.findings.filter((finding) => finding.severity === "blocker");
    if (blockers.length > 0) fail(`${expectation.path}: unexpected blockers ${JSON.stringify(blockers)}`);
    results.push({
      fixture: expectation.path,
      primary_intent: report.intent.primary,
      mutation_layer: report.mutationStrategy.firstLayer,
      eval_types: [...types].sort(),
    });
  }

  const manifest = join(root, "evals", "evals.json");
  if (!readFileSync(manifest, "utf-8").includes("fixture-intent-diagnosis")) {
    fail("evals/evals.json must include fixture-intent-diagnosis regression case.");
  }

  console.log(JSON.stringify({ decision: "keep", fixtures: results }, null, 2));
}

main();
