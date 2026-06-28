#!/usr/bin/env node
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STAGES = [
  "initialized",
  "requirements-draft",
  "requirements-confirmed",
  "solution-options",
  "solution-selected",
  "implementation-ready",
] as const;

type Stage = (typeof STAGES)[number];

type WorkflowState = {
  stage: Stage;
  allowedNextStages: Stage[];
  currentStageDoc: string | null;
  lastConfirmedDoc: string | null;
  confirmation: Record<string, string> | null;
  selection: Record<string, string> | null;
  history: Array<Record<string, string>>;
};

type CheckIssue = {
  path: string;
  message: string;
  repair: string;
};

const NEXT_STAGE: Record<Stage, Stage[]> = {
  initialized: ["requirements-draft"],
  "requirements-draft": ["requirements-confirmed"],
  "requirements-confirmed": ["solution-options"],
  "solution-options": ["solution-selected"],
  "solution-selected": ["implementation-ready"],
  "implementation-ready": [],
};

const STAGE_DOC: Record<Exclude<Stage, "initialized">, string> = {
  "requirements-draft": "workflow/requirements.md",
  "requirements-confirmed": "workflow/requirements.md",
  "solution-options": "workflow/solution-options.md",
  "solution-selected": "workflow/solution-selected.md",
  "implementation-ready": "workflow/implementation-ready.md",
};

const REQUIRED_ADVANCE_STATUS: Record<Exclude<Stage, "initialized">, string> = {
  "requirements-draft": "draft",
  "requirements-confirmed": "confirmed",
  "solution-options": "proposed",
  "solution-selected": "selected",
  "implementation-ready": "ready",
};

const INITIAL_STATE: WorkflowState = {
  stage: "initialized",
  allowedNextStages: ["requirements-draft"],
  currentStageDoc: null,
  lastConfirmedDoc: null,
  confirmation: null,
  selection: null,
  history: [],
};

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".vue",
  ".html",
  ".css",
  ".scss",
  ".yaml",
  ".yml",
  ".txt",
]);

const CLI_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(CLI_PATH), "../../..");
const TEMPLATE_ROOT = join(REPO_ROOT, "templates", "pc-admin");
const KIT_SKILLS_ROOT = join(REPO_ROOT, ".agents", "skills");

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    await initCommand(rest);
    return;
  }

  if (command === "check") {
    await checkCommand(rest);
    return;
  }

  if (command === "stage" && rest[0] === "advance") {
    await advanceCommand(rest.slice(1));
    return;
  }

  fail(`Unknown command: ${[command, ...rest].join(" ")}`, "Run `kit help` to see supported commands.");
}

async function initCommand(args: string[]): Promise<void> {
  const projectName = args[0];
  if (!projectName) {
    fail("Missing project name.", "Run `kit init <project-name>`.");
  }

  const targetRoot = resolve(process.cwd(), projectName);
  if (await exists(targetRoot)) {
    fail(`Target directory already exists: ${targetRoot}`, "Choose a new project name or remove the existing directory first.");
  }

  await copyTemplate(TEMPLATE_ROOT, targetRoot, {
    projectName: basename(projectName),
    kitCliPath: CLI_PATH,
  });
  await materializeEnvExamples(targetRoot);
  await copyDirectory(KIT_SKILLS_ROOT, join(targetRoot, ".agents", "skills"));

  await mkdir(join(targetRoot, "frontend"), { recursive: true });
  await mkdir(join(targetRoot, "backend"), { recursive: true });
  await mkdir(join(targetRoot, "SPECS"), { recursive: true });
  await mkdir(join(targetRoot, "workflow"), { recursive: true });
  await mkdir(join(targetRoot, "tasks"), { recursive: true });
  await mkdir(join(targetRoot, "memory"), { recursive: true });
  await writeJson(join(targetRoot, "workflow-state.json"), INITIAL_STATE);
  await writeFile(join(targetRoot, "scripts", "kit.mjs"), renderKitRunner(CLI_PATH), "utf8");

  console.log(`✅ Created ${projectName}`);
  console.log(`Next: cd ${projectName} && pnpm kit:check`);
}

async function checkCommand(args: string[]): Promise<void> {
  const root = resolve(args[0] ?? process.cwd());
  const issues = await checkProject(root);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`❌ ${issue.path}: ${issue.message}`);
      console.error(`   Repair: ${issue.repair}`);
    }
    process.exit(1);
  }

  const state = await readState(root);
  console.log(`✅ kit check passed: stage "${state.stage}"`);
}

async function advanceCommand(args: string[]): Promise<void> {
  const target = args[0] as Stage | undefined;
  const options = parseOptions(args.slice(1));

  if (!target || !isStage(target) || target === "initialized") {
    fail("Invalid target stage.", "Use the only stage listed in workflow-state.json allowedNextStages.");
  }

  if (options.by !== "user") {
    fail("`--by user` is required in v1.", "Rerun with `--by user`; Agent-initiated advances are not supported.");
  }

  if (!options.quote || options.quote.trim() === "") {
    fail("`--quote` is required for every stage advance.", "Rerun with the user's exact quote, for example `--quote \"需求已确认\"`.");
  }

  const root = process.cwd();
  const state = await readState(root);
  if (!isStage(state.stage)) {
    fail(`workflow-state.json has unknown stage "${String(state.stage)}".`, "Repair workflow-state.json from the fixed stage order before advancing.");
  }

  const expectedStages = NEXT_STAGE[state.stage];
  if (!Array.isArray(state.allowedNextStages)) {
    fail("workflow-state.json is corrupt: allowedNextStages must be an array.", "Repair workflow-state.json from the fixed stage order before advancing.");
  }

  if (!sameArray(state.allowedNextStages, expectedStages)) {
    fail(
      `workflow-state.json is corrupt: allowedNextStages must be ${JSON.stringify(expectedStages)} for stage "${state.stage}".`,
      "Repair workflow-state.json from the fixed stage order before advancing; run `kit check` for details.",
    );
  }

  const expected = expectedStages[0];
  if (expected !== target) {
    fail(
      `Cannot advance from "${state.stage}" to "${target}".`,
      expected ? `Run \`kit stage advance ${expected} --by user --quote "..."\`.` : "This project is already at the terminal stage.",
    );
  }

  const doc = STAGE_DOC[target];
  const requiredStatus = REQUIRED_ADVANCE_STATUS[target];
  const frontmatter = await readFrontmatterForAdvance(root, doc);
  if (frontmatter.status !== requiredStatus) {
    fail(
      `${doc} has status "${String(frontmatter.status ?? "")}", expected "${requiredStatus}".`,
      `Update ${doc} frontmatter to \`status: ${requiredStatus}\`, then rerun the advance command.`,
    );
  }

  const now = new Date().toISOString();
  const nextState = updateStateForAdvance(state, target, doc, options.quote, now, frontmatter);
  await writeJson(join(root, "workflow-state.json"), nextState);
  console.log(`✅ Advanced ${state.stage} -> ${target}`);
}

async function checkProject(root: string): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const state = await readStateForCheck(root, issues);
  if (!state) return issues;

  validateStateShape(state, issues);
  if (!isStage(state.stage)) return issues;

  await validateCommonControlFiles(root, issues);
  await validateSourceLine(root, "frontend/SPECS/API.md", issues);
  await validateSourceLine(root, "backend/SPECS/API.md", issues);
  await validateWorkflowFiles(root, state.stage, issues);
  await validateTaskTiming(root, state.stage, issues);
  await validateStageArtifacts(root, state, issues);

  return issues;
}

function validateStateShape(state: WorkflowState, issues: CheckIssue[]): void {
  if (!isStage(state.stage)) {
    issues.push(issue("workflow-state.json", `Unknown stage "${String(state.stage)}".`, "Use one of the stages from plan/00-contract.md."));
    return;
  }

  if (!Array.isArray(state.allowedNextStages)) {
    issues.push(issue("workflow-state.json", "allowedNextStages must be an array.", "Rewrite allowedNextStages from the transition table."));
    return;
  }

  const expected = NEXT_STAGE[state.stage];
  if (!sameArray(state.allowedNextStages, expected)) {
    issues.push(
      issue(
        "workflow-state.json",
        `allowedNextStages must be ${JSON.stringify(expected)} for stage "${state.stage}".`,
        "Run the correct `kit stage advance` command instead of editing workflow-state.json by hand.",
      ),
    );
  }

  if (!Array.isArray(state.history)) {
    issues.push(issue("workflow-state.json", "history must be an array.", "Restore history to an array; use `[]` for a fresh project."));
    return;
  }

  for (const [index, entry] of state.history.entries()) {
    for (const field of ["from", "to", "advancedBy", "advancedAt", "quote", "doc"]) {
      if (!entry[field]) {
        issues.push(
          issue(
            "workflow-state.json",
            `history[${index}] is missing "${field}".`,
            "Restore history from `kit stage advance`; do not hand-edit workflow-state.json.",
          ),
        );
      }
    }
  }
}

async function validateCommonControlFiles(root: string, issues: CheckIssue[]): Promise<void> {
  const files = [
    "AGENTS.md",
    "workflow/README.md",
    "SPECS/API.md",
    "tasks/README.md",
    "memory/decisions.md",
    "frontend/AGENTS.md",
    "frontend/SPECS/README.md",
    "frontend/SPECS/API.md",
    "backend/AGENTS.md",
    "backend/SPECS/README.md",
    "backend/SPECS/API.md",
  ];

  for (const file of files) {
    if (!(await exists(join(root, file)))) {
      issues.push(issue(file, "Required control file is missing.", `Restore ${file} from the kit template.`));
    }
  }
}

async function validateSourceLine(root: string, file: string, issues: CheckIssue[]): Promise<void> {
  const fullPath = join(root, file);
  if (!(await exists(fullPath))) return;

  const content = await readFile(fullPath, "utf8");
  const hasSourceLine = content.split(/\r?\n/).includes("Source: ../../SPECS/API.md");
  if (!hasSourceLine) {
    issues.push(issue(file, "Missing exact root API source line.", "Replace the file body with `Source: ../../SPECS/API.md`."));
  }
}

async function validateWorkflowFiles(root: string, stage: Stage, issues: CheckIssue[]): Promise<void> {
  const workflowRoot = join(root, "workflow");
  if (!(await exists(workflowRoot))) return;

  const allowed = allowedWorkflowFiles(stage);
  for (const entry of await readdir(workflowRoot)) {
    if (!entry.endsWith(".md") || entry === "README.md") continue;
    const rel = `workflow/${entry}`;
    if (!allowed.has(rel)) {
      issues.push(
        issue(
          rel,
          `Workflow artifact is not allowed at stage "${stage}".`,
          `Remove ${rel} until it is the current stage artifact or the immediate target artifact.`,
        ),
      );
    }
  }
}

async function validateTaskTiming(root: string, stage: Stage, issues: CheckIssue[]): Promise<void> {
  const backlog = "tasks/backlog.md";
  const sprint = "tasks/sprint-01.md";
  if (stageIndex(stage) < stageIndex("requirements-confirmed") && (await exists(join(root, backlog)))) {
    issues.push(issue(backlog, "Backlog is created too early.", "Create tasks/backlog.md only after requirements-confirmed."));
  }

  if (stageIndex(stage) >= stageIndex("requirements-confirmed") && !(await exists(join(root, backlog)))) {
    issues.push(issue(backlog, "Backlog is required from requirements-confirmed onward.", "Create tasks/backlog.md from the confirmed requirements."));
  }

  if (stageIndex(stage) < stageIndex("implementation-ready") && (await exists(join(root, sprint)))) {
    issues.push(issue(sprint, "Sprint plan is created too early.", "Create tasks/sprint-01.md only at implementation-ready."));
  }
}

async function validateStageArtifacts(root: string, state: WorkflowState, issues: CheckIssue[]): Promise<void> {
  switch (state.stage) {
    case "initialized":
      return;
    case "requirements-draft":
      await requireFrontmatter(root, "workflow/requirements.md", { status: "draft" }, issues);
      return;
    case "requirements-confirmed":
      await requireFrontmatter(
        root,
        "workflow/requirements.md",
        { status: "confirmed", fields: ["confirmedBy", "confirmedAt", "confirmationQuote"] },
        issues,
      );
      if (state.lastConfirmedDoc !== "workflow/requirements.md") {
        issues.push(issue("workflow-state.json", "lastConfirmedDoc must point to workflow/requirements.md.", "Advance with `kit stage advance requirements-confirmed ...`."));
      }
      return;
    case "solution-options": {
      const meta = await requireFrontmatter(root, "workflow/solution-options.md", { status: "proposed" }, issues);
      const optionIds = meta?.optionIds;
      if (!Array.isArray(optionIds) || optionIds.length !== 3) {
        issues.push(issue("workflow/solution-options.md", "optionIds must contain exactly 3 ids.", "Set frontmatter `optionIds: [option-a, option-b, option-c]`."));
      }
      return;
    }
    case "solution-selected": {
      const meta = await requireFrontmatter(
        root,
        "workflow/solution-selected.md",
        { status: "selected", fields: ["selectionType", "selectedOptionId", "selectedBy", "selectedAt", "selectionQuote"] },
        issues,
      );
      const selectionType = meta?.selectionType;
      if (selectionType !== "option" && selectionType !== "custom") {
        issues.push(issue("workflow/solution-selected.md", "selectionType must be option or custom.", "Use `selectionType: option` or `selectionType: custom`."));
      }
      const selectedOptionId = typeof meta?.selectedOptionId === "string" ? meta.selectedOptionId : "";
      await validateDecision(root, selectedOptionId, issues);
      return;
    }
    case "implementation-ready":
      await requireFrontmatter(
        root,
        "workflow/implementation-ready.md",
        { status: "ready", fields: ["confirmedBy", "confirmedAt", "confirmationQuote"] },
        issues,
      );
      if (!(await exists(join(root, "tasks/sprint-01.md")))) {
        issues.push(issue("tasks/sprint-01.md", "Sprint plan is required at implementation-ready.", "Create tasks/sprint-01.md from the selected solution."));
      }
      if (state.lastConfirmedDoc !== "workflow/implementation-ready.md") {
        issues.push(issue("workflow-state.json", "lastConfirmedDoc must point to workflow/implementation-ready.md.", "Advance with `kit stage advance implementation-ready ...`."));
      }
      return;
  }
}

async function validateDecision(root: string, selectedOptionId: string, issues: CheckIssue[]): Promise<void> {
  if (!selectedOptionId) {
    issues.push(issue("workflow/solution-selected.md", "selectedOptionId is required.", "Record the user-selected option id in frontmatter."));
    return;
  }

  const decisionsPath = join(root, "memory/decisions.md");
  if (!(await exists(decisionsPath))) return;
  const decisions = await readFile(decisionsPath, "utf8");
  if (!decisions.includes(selectedOptionId)) {
    issues.push(issue("memory/decisions.md", `Missing selected option id "${selectedOptionId}".`, "Record the same selectedOptionId in memory/decisions.md."));
  }
}

async function requireFrontmatter(
  root: string,
  relPath: string,
  required: { status: string; fields?: string[] },
  issues: CheckIssue[],
): Promise<Record<string, unknown> | null> {
  const fullPath = join(root, relPath);
  if (!(await exists(fullPath))) {
    issues.push(issue(relPath, "Required workflow artifact is missing.", `Create ${relPath} for the current stage.`));
    return null;
  }

  const content = await readFile(fullPath, "utf8");
  const meta = parseFrontmatter(content);
  if (!meta) {
    issues.push(issue(relPath, "Missing YAML frontmatter.", `Add frontmatter with at least \`status: ${required.status}\`.`));
    return null;
  }

  if (meta.status !== required.status) {
    issues.push(issue(relPath, `status must be "${required.status}".`, `Set frontmatter \`status: ${required.status}\`.`));
  }

  for (const field of required.fields ?? []) {
    if (!meta[field]) {
      issues.push(issue(relPath, `Missing frontmatter field "${field}".`, `Add \`${field}\` to ${relPath} frontmatter.`));
    }
  }

  return meta;
}

async function readFrontmatterForAdvance(root: string, relPath: string): Promise<Record<string, unknown>> {
  const fullPath = join(root, relPath);
  if (!(await exists(fullPath))) {
    fail(`Missing target artifact: ${relPath}`, `Create ${relPath} before running kit stage advance.`);
  }

  const content = await readFile(fullPath, "utf8");
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    fail(`Missing YAML frontmatter in ${relPath}.`, "Add YAML frontmatter with the required status field.");
  }

  return frontmatter;
}

function updateStateForAdvance(
  state: WorkflowState,
  target: Stage,
  doc: string,
  quote: string,
  now: string,
  frontmatter: Record<string, unknown>,
): WorkflowState {
  const historyEntry = {
    from: state.stage,
    to: target,
    advancedBy: "user",
    advancedAt: now,
    quote,
    doc,
  };

  const nextState: WorkflowState = {
    ...state,
    stage: target,
    allowedNextStages: NEXT_STAGE[target],
    currentStageDoc: doc,
    history: [...state.history, historyEntry],
  };

  if (target === "requirements-confirmed" || target === "implementation-ready") {
    nextState.lastConfirmedDoc = doc;
    nextState.confirmation = {
      confirmedBy: "user",
      confirmedAt: now,
      confirmationQuote: quote,
    };
  }

  if (target === "solution-selected") {
    nextState.selection = {
      selectionType: String(frontmatter.selectionType ?? ""),
      selectedOptionId: String(frontmatter.selectedOptionId ?? ""),
      selectedBy: "user",
      selectedAt: now,
      selectionQuote: quote,
    };
  }

  return nextState;
}

async function readStateForCheck(root: string, issues: CheckIssue[]): Promise<WorkflowState | null> {
  try {
    return await readState(root);
  } catch (error) {
    issues.push(issue("workflow-state.json", error instanceof Error ? error.message : "Unable to read workflow state.", "Restore a valid workflow-state.json from the kit template."));
    return null;
  }
}

async function readState(root: string): Promise<WorkflowState> {
  const fullPath = join(root, "workflow-state.json");
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw) as WorkflowState;
}

async function copyTemplate(sourceRoot: string, targetRoot: string, replacements: Record<string, string>): Promise<void> {
  await mkdir(targetRoot, { recursive: true });
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (shouldSkipTemplateEntry(entry.name)) continue;

    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, targetPath, replacements);
      continue;
    }

    if (entry.isFile()) {
      await copyTemplateFile(sourcePath, targetPath, replacements);
    }
  }
}

async function copyDirectory(sourceRoot: string, targetRoot: string): Promise<void> {
  await mkdir(targetRoot, { recursive: true });
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (shouldSkipTemplateEntry(entry.name)) continue;

    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function copyTemplateFile(sourcePath: string, targetPath: string, replacements: Record<string, string>): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const ext = sourcePath.includes(".") ? sourcePath.slice(sourcePath.lastIndexOf(".")) : "";
  if (!TEXT_EXTENSIONS.has(ext)) {
    await copyFile(sourcePath, targetPath);
    return;
  }

  let content = await readFile(sourcePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  await writeFile(targetPath, content, "utf8");
}

async function materializeEnvExamples(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (shouldSkipTemplateEntry(entry.name)) continue;

    const sourcePath = join(root, entry.name);
    if (entry.isDirectory()) {
      await materializeEnvExamples(sourcePath);
      continue;
    }

    if (entry.isFile() && isEnvExample(entry.name)) {
      await copyFile(sourcePath, sourcePath.slice(0, -".example".length));
    }
  }
}

function renderKitRunner(cliPath: string): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const cliPath = process.env.KIT_TEST_CLI || ${JSON.stringify(cliPath)};
const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
`;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const yaml = content.slice(4, end);
  return parseSimpleYaml(yaml);
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let arrayKey: string | null = null;

  for (const rawLine of yaml.split(/\r?\n/)) {
    if (rawLine.trim() === "" || rawLine.trim().startsWith("#")) continue;
    const arrayMatch = rawLine.match(/^\s*-\s*(.+)$/);
    if (arrayMatch && arrayKey) {
      const existing = result[arrayKey];
      if (Array.isArray(existing)) existing.push(stripQuotes(arrayMatch[1].trim()));
      continue;
    }

    const index = rawLine.indexOf(":");
    if (index === -1) continue;

    const key = rawLine.slice(0, index).trim();
    const value = rawLine.slice(index + 1).trim();
    if (!value) {
      result[key] = [];
      arrayKey = key;
      continue;
    }

    arrayKey = null;
    if (value.startsWith("[") && value.endsWith("]")) {
      result[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean);
    } else {
      result[key] = stripQuotes(value);
    }
  }

  return result;
}

function parseOptions(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;

    const eq = arg.indexOf("=");
    if (eq !== -1) {
      result[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }

    result[arg.slice(2)] = args[index + 1] ?? "";
    index += 1;
  }
  return result;
}

function allowedWorkflowFiles(stage: Stage): Set<string> {
  const files: string[] = [];
  if (stageIndex(stage) >= stageIndex("requirements-draft")) files.push("workflow/requirements.md");
  if (stageIndex(stage) >= stageIndex("solution-options")) files.push("workflow/solution-options.md");
  if (stageIndex(stage) >= stageIndex("solution-selected")) files.push("workflow/solution-selected.md");
  if (stageIndex(stage) >= stageIndex("implementation-ready")) files.push("workflow/implementation-ready.md");

  for (const target of NEXT_STAGE[stage]) {
    if (target !== "initialized") files.push(STAGE_DOC[target]);
  }

  return new Set(files);
}

function shouldSkipTemplateEntry(name: string): boolean {
  return name === "node_modules" || name === "dist" || name === ".DS_Store" || name === ".git" || name === ".cache" || (name.startsWith(".env") && !isEnvExample(name));
}

function isEnvExample(name: string): boolean {
  return name.startsWith(".env") && name.endsWith(".example");
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function sameArray(left: unknown[], right: unknown[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function isStage(value: string): value is Stage {
  return STAGES.includes(value as Stage);
}

function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function issue(path: string, message: string, repair: string): CheckIssue {
  return { path, message, repair };
}

function fail(message: string, repair: string): never {
  console.error(`❌ ${message}`);
  console.error(`Repair: ${repair}`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`kit-test CLI

Commands:
  kit init <project-name>
  kit check [project-root]
  kit stage advance <stage> --by user --quote "<user exact quote>"
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ ${message}`);
  console.error("Repair: Re-run the command after fixing the reported file or argument.");
  process.exit(1);
});
