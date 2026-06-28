#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { parse } from "yaml";

type Severity = "blocker" | "warning" | "info";

type Finding = {
  severity: Severity;
  category: string;
  message: string;
  evidence?: string;
  recommendation?: string;
};

type Intent =
  | "routing"
  | "norm-style"
  | "workflow"
  | "tool-script"
  | "knowledge-navigation"
  | "creative"
  | "governance"
  | "meta-optimizer";

type AuditReport = {
  targetPath: string;
  skillName: string;
  frontmatter: Record<string, unknown>;
  structure: {
    hasSkillMd: boolean;
    hasReferences: boolean;
    hasScripts: boolean;
    hasAssets: boolean;
    hasEvals: boolean;
    skillMdLines: number;
    fileCount: number;
    files: string[];
  };
  purpose: {
    stated: string;
    inferred: string;
  };
  intent: {
    primary: Intent;
    secondary: Intent[];
    confidence: number;
    evidence: string[];
  };
  necessity: {
    judgment:
      | "keep-and-optimize"
      | "keep-but-scope"
      | "merge"
      | "globalize"
      | "document-only"
      | "delete-or-disable"
      | "needs-human-review";
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
  selfTrainingReadiness: {
    ready: boolean;
    missing: string[];
  };
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    target: "",
    format: "markdown" as "markdown" | "json",
    output: "",
  };

  for (const arg of args) {
    if (arg === "--json") options.format = "json";
    else if (arg === "--markdown") options.format = "markdown";
    else if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (value === "json" || value === "markdown") options.format = value;
      else fail(`Unsupported format: ${value}`);
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (!options.target) {
      options.target = arg;
    } else {
      fail(`Unexpected argument: ${arg}`);
    }
  }

  if (!options.target) {
    fail("Usage: bun scripts/audit-skill.ts <skill-dir> [--format=json|markdown] [--output=path]");
  }

  return options;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseSkillMd(content: string): { frontmatter: Record<string, unknown>; body: string; error?: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: content, error: "Missing YAML frontmatter delimiters" };
  }

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content, error: "Unclosed YAML frontmatter" };
  }

  const yamlBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).replace(/^\r?\n/, "");

  try {
    return { frontmatter: (parse(yamlBlock) ?? {}) as Record<string, unknown>, body };
  } catch (err) {
    return {
      frontmatter: {},
      body,
      error: `Unparseable YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function walkFiles(root: string): string[] {
  const out: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === ".DS_Store" || entry === ".git" || entry === "node_modules") continue;
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) out.push(relative(root, path));
    }
  }

  walk(root);
  return out.sort();
}

function lineCount(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function includesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word.toLowerCase()));
}

function looksLikeArtifactOrWorkflowTask(text: string): boolean {
  return includesAny(text, [
    "file",
    "directory",
    "folder",
    "artifact",
    "output",
    "deliver",
    "save",
    "write",
    "read all",
    "generate",
    "report",
    "script",
    "convert",
    "merge",
    "audit",
    "evaluate",
    "workflow",
    "step",
    "phase",
    "package",
    "文件",
    "目录",
    "产物",
    "输出",
    "交付",
    "保存",
    "生成",
    "报告",
    "脚本",
    "转换",
    "合并",
    "审计",
    "评估",
    "流程",
    "步骤",
    "阶段",
  ]);
}

function scoreIntent(body: string, description: string, files: string[], fmName: string): {
  primary: Intent;
  secondary: Intent[];
  confidence: number;
  evidence: string[];
} {
  const text = `${fmName}\n${description}\n${body}`;
  const evidence: string[] = [];
  const scores: Record<Intent, number> = {
    routing: 0,
    "norm-style": 0,
    workflow: 0,
    "tool-script": 0,
    "knowledge-navigation": 0,
    creative: 0,
    governance: 0,
    "meta-optimizer": 0,
  };

  const add = (intent: Intent, score: number, reason: string) => {
    scores[intent] += score;
    evidence.push(`${intent}: ${reason}`);
  };

  if (includesAny(description, ["use when", "trigger", "do not use", "when the user", "用于", "不用于"])) {
    add("routing", 2, "description contains trigger or exclusion language");
  }
  if (includesAny(text, ["route", "routing", "classify", "classifier", "queue", "select one", "one of", "分类", "路由"])) {
    add("routing", 3, "routing or classification language present");
  }
  if (includesAny(text, ["workflow", "phase", "step", "state", "route", "output contract", "流程", "阶段", "状态机"])) {
    add("workflow", 3, "body uses workflow or state language");
  }
  if (includesAny(text, ["step 1", "step 2", "step 3", "## input", "## output", "### step", "输入", "输出"])) {
    add("workflow", 2, "body defines ordered steps or input/output contract");
  }
  if (files.some((file) => file.startsWith("scripts/"))) {
    add("tool-script", 4, "scripts directory present");
  }
  if (files.some((file) => file.startsWith("references/"))) {
    add("knowledge-navigation", 2, "references directory present");
  }
  if (files.some((file) => file.startsWith("assets/"))) {
    add("creative", 1, "assets directory present");
  }
  if (includesAny(text, ["style", "brand", "creative", "visual", "image", "illustration", "风格", "审美", "配图", "创作"])) {
    add("creative", 3, "creative/style language present");
  }
  if (includesAny(text, ["rubric", "standard", "checklist", "guideline", "规范", "标准", "审阅", "评估"])) {
    add("norm-style", 3, "rubric or standard language present");
  }
  if (includesAny(text, ["compliance", "audit", "risk", "security", "governance", "合规", "审计", "风险", "安全"])) {
    add("governance", 3, "governance/risk language present");
  }
  if (
    includesAny(text, [
      "optimize skill",
      "skill optimizer",
      "skill evolver",
      "improve existing skill",
      "eval plan",
      "mutation layer",
      "self-training",
      "make a skill train itself",
      "优化技能",
      "技能优化",
      "让 skill 自己训练",
      "让Skill自己训练",
    ])
  ) {
    add("meta-optimizer", 5, "meta skill optimization language present");
  }
  if (includesAny(text, ["reference", "path hit", "fact coverage", "knowledge", "docs", "文档", "知识"])) {
    add("knowledge-navigation", 2, "knowledge navigation language present");
  }

  const ranked = (Object.entries(scores) as Array<[Intent, number]>).sort((a, b) => b[1] - a[1]);
  let primary = ranked[0]?.[0] ?? "workflow";
  if (scores["meta-optimizer"] > 0 && (fmName.includes("optimizer") || includesAny(text, ["skill optimizer", "self-training", "mutation layer"]))) {
    primary = "meta-optimizer";
  } else if (scores.routing >= scores.workflow && !hasScripts(files) && !files.some((file) => file.startsWith("references/"))) {
    primary = "routing";
  }
  const topScore = ranked[0]?.[1] ?? 0;
  const secondary = ranked
    .slice(1)
    .filter(([intent, score]) => intent !== primary && score > 0 && score >= Math.max(2, topScore - 2))
    .map(([intent]) => intent);

  return {
    primary,
    secondary,
    confidence: Math.min(0.95, Math.max(0.35, topScore / 8)),
    evidence: evidence.slice(0, 12),
  };
}

function hasScripts(files: string[]): boolean {
  return files.some((file) => file.startsWith("scripts/"));
}

function inferPurpose(description: string, body: string): { stated: string; inferred: string } {
  const firstBodyLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith(">"));

  return {
    stated: description || firstBodyLine || "No stated purpose found.",
    inferred: firstBodyLine || description || "Needs human review.",
  };
}

function audit(targetPath: string): AuditReport {
  const root = resolve(targetPath);
  if (!existsSync(root)) fail(`Target path does not exist: ${root}`);
  if (!statSync(root).isDirectory()) fail(`Target path is not a directory: ${root}`);

  const skillMdPath = join(root, "SKILL.md");
  const hasSkillMd = existsSync(skillMdPath);
  const files = walkFiles(root);
  const skillContent = hasSkillMd ? readFileSync(skillMdPath, "utf-8") : "";
  const parsed = hasSkillMd ? parseSkillMd(skillContent) : { frontmatter: {}, body: "", error: "Missing SKILL.md" };
  const fm = parsed.frontmatter;
  const fmName = typeof fm.name === "string" ? fm.name : "";
  const description = typeof fm.description === "string" ? fm.description : "";
  const dirName = basename(root);
  const body = parsed.body;
  const skillMdLines = lineCount(skillContent);
  const hasEvals = files.some((file) => file.startsWith("evals/"));
  const hasScripts = files.some((file) => file.startsWith("scripts/"));
  const hasReferences = files.some((file) => file.startsWith("references/"));
  const hasAssets = files.some((file) => file.startsWith("assets/"));
  const hasEvalRunner = files.some((file) => file === "scripts/run-evals.ts");
  const evalSuitePath = join(root, "evals", "evals.json");
  const evalSuiteText = existsSync(evalSuitePath) ? readFileSync(evalSuitePath, "utf-8") : "";
  const hasTraceCapture =
    hasEvalRunner || files.some((file) => file.toLowerCase().includes("trace") || file.toLowerCase().includes("run-evals"));
  const hasLogging =
    files.some((file) => file === "references/logging-and-gate.md") ||
    files.some((file) => file.toLowerCase().includes("log") || file.toLowerCase().includes("gate"));
  const hasRegressionGuard =
    files.some((file) => file === "evals/regression.json") ||
    (hasEvals && files.some((file) => file.toLowerCase().includes("regression"))) ||
    evalSuiteText.includes('"split": "regression"');
  const hasBaselineSupport = hasEvalRunner && files.some((file) => file === "scripts/workspace-init.ts");
  const hasBehaviorFixtures = files.some((file) => file === "scripts/check-fixtures.ts") && evalSuiteText.includes("fixture-intent-diagnosis");
  const behaviorJudgmentPath = join(root, "evals", "behavior-judgments.json");
  const behaviorJudgmentText = existsSync(behaviorJudgmentPath) ? readFileSync(behaviorJudgmentPath, "utf-8") : "";
  const hasJudgmentBridge =
    evalSuiteText.includes("external-judgment-contract") &&
    files.some((file) => file === "references/eval-schema.md") &&
    behaviorJudgmentText.includes('"method": "external_judgment"') &&
    behaviorJudgmentText.includes('"method": "human_preference"');
  const hasMetricDeltaGate = evalSuiteText.includes("gate-baseline-delta") && files.some((file) => file === "scripts/gate.ts");
  const hasIterateSuccessRegression = evalSuiteText.includes("iterate-success-path") && files.some((file) => file === "scripts/iterate.ts");
  const hasMutationProposal = evalSuiteText.includes("mutation-proposal-from-trace") && files.some((file) => file === "scripts/propose-mutation.ts");
  const compactConversationalSkill =
    skillMdLines > 0 &&
    skillMdLines <= 40 &&
    !hasScripts &&
    !hasReferences &&
    !hasAssets &&
    !hasEvals &&
    !looksLikeArtifactOrWorkflowTask(`${description}\n${body}`);
  const findings: Finding[] = [];

  const addFinding = (finding: Finding) => findings.push(finding);

  if (!hasSkillMd) {
    addFinding({
      severity: "blocker",
      category: "structure",
      message: "SKILL.md is missing.",
      recommendation: "Create SKILL.md with valid frontmatter.",
    });
  }
  if (parsed.error) {
    addFinding({
      severity: "blocker",
      category: "frontmatter",
      message: parsed.error,
      evidence: "SKILL.md",
      recommendation: "Fix YAML frontmatter before optimizing behavior.",
    });
  }
  if (!fmName) {
    addFinding({
      severity: "blocker",
      category: "frontmatter",
      message: "Missing frontmatter name.",
      recommendation: "Add name matching the skill directory.",
    });
  } else if (fmName !== dirName) {
    addFinding({
      severity: "warning",
      category: "frontmatter",
      message: "Frontmatter name does not match directory name.",
      evidence: `name=${fmName}, directory=${dirName}`,
      recommendation: "Rename directory or frontmatter name.",
    });
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fmName)) {
    addFinding({
      severity: "warning",
      category: "frontmatter",
      message: "Skill name is not kebab-case lowercase alphanumeric.",
      evidence: fmName || "(empty)",
      recommendation: "Use lowercase letters, digits, and single hyphens.",
    });
  }
  if (!description) {
    addFinding({
      severity: "blocker",
      category: "trigger",
      message: "Missing description.",
      recommendation: "Add WHEN-focused description with trigger boundary.",
    });
  } else {
    if (!includesAny(description, ["use when", "trigger", "when user", "when the user", "用于", "使用", "当用户"])) {
      addFinding({
        severity: "warning",
        category: "trigger",
        message: "Description may not clearly state when to use the skill.",
        evidence: description,
        recommendation: "Rewrite as trigger boundary, not internal summary.",
      });
    }
    if (!includesAny(description, ["do not", "don't", "not use", "不用于", "不要用于"])) {
      addFinding({
        severity: "info",
        category: "trigger",
        message: "Description has no explicit negative trigger.",
        recommendation: "Add exclusions when adjacent confusion is likely.",
      });
    }
    if (description.length > 1024) {
      addFinding({
        severity: "warning",
        category: "trigger",
        message: "Description exceeds 1024 characters.",
        evidence: `${description.length} characters`,
        recommendation: "Shorten description and move details into SKILL.md or references.",
      });
    }
  }

  if (skillMdLines > 500) {
    addFinding({
      severity: "warning",
      category: "context",
      message: "SKILL.md is over 500 lines.",
      evidence: `${skillMdLines} lines`,
      recommendation: "Move heavy details into references/assets/scripts with read conditions.",
    });
  }
  if (includesAny(body, ["api reference", "complete schema", "full template", "完整模板", "完整 schema"]) && !files.some((file) => file.startsWith("references/") || file.startsWith("assets/"))) {
    addFinding({
      severity: "warning",
      category: "progressive-disclosure",
      message: "Main file appears to contain heavy reference/template content without resource split.",
      recommendation: "Move heavy material to references/ or assets/.",
    });
  }
  if (includesAny(body, ["validate", "parse", "convert", "upload", "download", "publish", "校验", "解析", "转换", "发布"]) && !files.some((file) => file.startsWith("scripts/"))) {
    addFinding({
      severity: "info",
      category: "scriptability",
      message: "Body mentions deterministic operations but no scripts directory exists.",
      recommendation: "Consider scripts only if these operations are fragile or repeated.",
    });
  }
  if (
    !compactConversationalSkill &&
    looksLikeArtifactOrWorkflowTask(`${description}\n${body}`) &&
    !includesAny(body, ["output", "deliver", "save", "return", "输出", "交付", "保存"])
  ) {
    addFinding({
      severity: "info",
      category: "output-contract",
      message: "Output contract is not obvious.",
      recommendation: "Define final artifact shape if task produces artifacts.",
    });
  }
  if (
    !compactConversationalSkill &&
    !includesAny(body, [
      "error",
      "failure",
      "fallback",
      "troubleshoot",
      "troubleshooting",
      "guard",
      "edge case",
      "edge cases",
      "gotcha",
      "limitation",
      "limits",
      "失败",
      "错误",
      "回退",
      "边界",
      "异常",
      "限制",
    ])
  ) {
    addFinding({
      severity: "info",
      category: "failure-guards",
      message: "Failure guards are not obvious.",
      recommendation: "Add gotchas or recovery paths for likely failures.",
    });
  }

  const intent = scoreIntent(body, description, files, fmName || dirName);
  const purpose = inferPurpose(description, body);
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;

  const necessity = {
    judgment: (blockerCount > 0 ? "needs-human-review" : "keep-and-optimize") as AuditReport["necessity"]["judgment"],
    rationale: [
      "This deterministic audit cannot prove baseline increment; run hero queries before deep optimization.",
      intent.primary === "meta-optimizer"
        ? "Meta/optimizer language suggests the skill has a specialized purpose."
        : `Primary intent inferred as ${intent.primary}.`,
    ],
  };

  const evalPlan = buildEvalPlan(fmName || dirName, description, intent.primary);
  const mutationStrategy = chooseMutation(findings, intent.primary);
  const missingSelfTraining = [
    ["baseline", hasBaselineSupport],
    ["dev eval", hasEvals],
    ["regression guard", hasRegressionGuard],
    ["trace capture", hasScripts && hasTraceCapture],
    ["rollback/checkpoint", hasScripts && files.some((file) => file.toLowerCase().includes("checkpoint"))],
    ["gate criteria", true],
    ["human-auditable logs", hasScripts && hasLogging],
    ["behavior fixture eval", hasBehaviorFixtures],
    ["external judgment bridge", hasJudgmentBridge],
    ["baseline metric delta gate", hasMetricDeltaGate],
    ["iterate success regression", hasIterateSuccessRegression],
    ["trace-backed mutation proposal", hasMutationProposal],
  ]
    .filter(([, ok]) => !ok)
    .map(([name]) => String(name));

  return {
    targetPath: root,
    skillName: fmName || dirName,
    frontmatter: fm,
    structure: {
      hasSkillMd,
      hasReferences,
      hasScripts,
      hasAssets,
      hasEvals,
      skillMdLines,
      fileCount: files.length,
      files,
    },
    purpose,
    intent,
    necessity,
    findings,
    evalPlan,
    mutationStrategy,
    selfTrainingReadiness: {
      ready: missingSelfTraining.length === 0,
      missing: missingSelfTraining,
    },
  };
}

function buildEvalPlan(skillName: string, description: string, intent: Intent): AuditReport["evalPlan"] {
  const target = skillName || "this skill";
  const positivePrompt = makePositivePrompt(skillName, description, intent);
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

  const intentSpecific: Record<Intent, AuditReport["evalPlan"]> = {
    routing: [
      {
        id: "adjacent-confusion-1",
        type: "adjacent-confusion",
        prompt: "A prompt that shares vocabulary with this skill but needs a different skill.",
        expectedSignal: "Skill should remain silent.",
        assertionOrJudge: "Description-only discovery eval.",
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

  return [...common, ...intentSpecific[intent]];
}

function makePositivePrompt(skillName: string, description: string, intent: Intent): string {
  const name = skillName || "this skill";
  const firstTrigger = extractQuotedTrigger(description);
  if (firstTrigger) return `User asks: "${firstTrigger}"`;

  const examples: Record<Intent, string> = {
    routing: `User asks for the task named by ${name}'s trigger description.`,
    "norm-style": `User provides a draft/output and asks ${name} to evaluate or improve it against its standard.`,
    workflow: `User asks ${name} to complete its representative multi-step workflow.`,
    "tool-script": `User provides a valid input file/path and asks ${name} to produce its normal artifact.`,
    "knowledge-navigation": `User asks a domain question that should load ${name}'s most relevant reference.`,
    creative: `User asks ${name} to create a representative creative output.`,
    governance: `User asks for an action that requires ${name}'s allow/deny/escalate rules.`,
    "meta-optimizer": "User asks to audit and improve an Agent Skill with intent-specific evals.",
  };

  return examples[intent];
}

function extractQuotedTrigger(description: string): string {
  const matches = [...description.matchAll(/"([^"]{3,80})"/g)].map((match) => match[1].trim());
  return matches.find((item) => item.length > 0) ?? "";
}

function chooseMutation(findings: Finding[], intent: Intent): AuditReport["mutationStrategy"] {
  const blocker = findings.find((finding) => finding.severity === "blocker");
  if (blocker) {
    return {
      firstLayer: blocker.category === "frontmatter" || blocker.category === "trigger" ? "frontmatter" : "SKILL.md",
      rationale: `Fix blocker first: ${blocker.message}`,
      avoid: ["Do not start self-training while blockers exist."],
    };
  }

  const triggerWarning = findings.find((finding) => finding.category === "trigger" && finding.severity !== "info");
  if (triggerWarning || intent === "routing") {
    return {
      firstLayer: "frontmatter",
      rationale: "Trigger boundary is the cheapest high-impact layer.",
      avoid: ["Do not rewrite workflow before trigger eval exists."],
    };
  }

  const map: Record<Intent, string> = {
    routing: "frontmatter",
    "norm-style": "SKILL.md or references",
    workflow: "SKILL.md",
    "tool-script": "scripts",
    "knowledge-navigation": "references",
    creative: "assets or references",
    governance: "SKILL.md or references",
    "meta-optimizer": "evals or references",
  };

  return {
    firstLayer: map[intent],
    rationale: `Primary intent ${intent} suggests this layer is most likely to move the metric.`,
    avoid: ["Do not use a heavier mechanism until the current layer fails.", "Do not mutate without eval guard."],
  };
}

function toMarkdown(report: AuditReport): string {
  const findingsBySeverity = (severity: Severity) => report.findings.filter((finding) => finding.severity === severity);
  const findingLines = report.findings.length
    ? report.findings
        .map(
          (finding) =>
            `- **${finding.severity} / ${finding.category}**: ${finding.message}${
              finding.evidence ? `\n  Evidence: ${finding.evidence}` : ""
            }${finding.recommendation ? `\n  Recommendation: ${finding.recommendation}` : ""}`
        )
        .join("\n")
    : "- No deterministic findings.";

  return `# Skill Audit Report

## Verdict

- Target: \`${report.targetPath}\`
- Skill: \`${report.skillName}\`
- Primary intent: \`${report.intent.primary}\` (${Math.round(report.intent.confidence * 100)}% confidence)
- Necessity judgment: \`${report.necessity.judgment}\`
- Blockers: ${findingsBySeverity("blocker").length}
- Warnings: ${findingsBySeverity("warning").length}

## Purpose

- Stated: ${report.purpose.stated}
- Inferred: ${report.purpose.inferred}

## Intent Evidence

${report.intent.evidence.map((item) => `- ${item}`).join("\n") || "- Needs human review."}

## Structure

- SKILL.md lines: ${report.structure.skillMdLines}
- File count: ${report.structure.fileCount}
- References: ${report.structure.hasReferences ? "yes" : "no"}
- Scripts: ${report.structure.hasScripts ? "yes" : "no"}
- Assets: ${report.structure.hasAssets ? "yes" : "no"}
- Evals: ${report.structure.hasEvals ? "yes" : "no"}

## Findings

${findingLines}

## Eval Plan Draft

| ID | Type | Prompt | Expected Signal | Assertion/Judge |
| --- | --- | --- | --- | --- |
${report.evalPlan
  .map(
    (item) =>
      `| ${escapeTable(item.id)} | ${escapeTable(item.type)} | ${escapeTable(item.prompt)} | ${escapeTable(
        item.expectedSignal
      )} | ${escapeTable(item.assertionOrJudge)} |`
  )
  .join("\n")}

## Mutation Strategy

- First layer: ${report.mutationStrategy.firstLayer}
- Rationale: ${report.mutationStrategy.rationale}
- Avoid:
${report.mutationStrategy.avoid.map((item) => `  - ${item}`).join("\n")}

## Self-Training Readiness

- Ready: ${report.selfTrainingReadiness.ready ? "yes" : "no"}
- Missing:
${report.selfTrainingReadiness.missing.map((item) => `  - ${item}`).join("\n") || "  - none"}

## Files

${report.structure.files.map((file) => `- ${file}`).join("\n")}
`;
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function main() {
  const options = parseArgs();
  const report = audit(options.target);
  const output = options.format === "json" ? JSON.stringify(report, null, 2) : toMarkdown(report);

  if (options.output) {
    writeFileSync(options.output, output, "utf-8");
    console.log(`Skill audit written: ${options.output}`);
  } else {
    console.log(output);
  }
}

main();
