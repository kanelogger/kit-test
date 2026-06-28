import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const repoRoot = new URL("../../..", import.meta.url).pathname;
const cli = join(repoRoot, "packages/cli/dist/index.js");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
  });
}

async function tempProject() {
  const root = await mkdtemp(join(tmpdir(), "kit-test-"));
  const result = run(["init", "demo-admin"], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  return { root, project: join(root, "demo-admin") };
}

async function write(relRoot, path, content) {
  await mkdir(join(relRoot, path, ".."), { recursive: true });
  await writeFile(join(relRoot, path), content, "utf8");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function setState(project, state) {
  await writeFile(join(project, "workflow-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function buildProjectAt(stage) {
  const { root, project } = await tempProject();
  const state = {
    stage,
    allowedNextStages: {
      initialized: ["requirements-draft"],
      "requirements-draft": ["requirements-confirmed"],
      "requirements-confirmed": ["solution-options"],
      "solution-options": ["solution-selected"],
      "solution-selected": ["implementation-ready"],
      "implementation-ready": [],
    }[stage],
    currentStageDoc: null,
    lastConfirmedDoc: null,
    confirmation: null,
    selection: null,
    history: [],
  };

  if (stage !== "initialized") {
    state.currentStageDoc = {
      "requirements-draft": "workflow/requirements.md",
      "requirements-confirmed": "workflow/requirements.md",
      "solution-options": "workflow/solution-options.md",
      "solution-selected": "workflow/solution-selected.md",
      "implementation-ready": "workflow/implementation-ready.md",
    }[stage];
  }

  if (["requirements-draft", "requirements-confirmed", "solution-options", "solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");
  }

  if (["requirements-confirmed", "solution-options", "solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/requirements.md", "---\nstatus: confirmed\nconfirmedBy: user\nconfirmedAt: 2026-06-28T00:00:00.000Z\nconfirmationQuote: \"确认需求\"\n---\n# Requirements\n");
    await write(project, "tasks/backlog.md", "# Backlog\n");
    state.lastConfirmedDoc = "workflow/requirements.md";
    state.confirmation = {
      confirmedBy: "user",
      confirmedAt: "2026-06-28T00:00:00.000Z",
      confirmationQuote: "确认需求",
    };
  }

  if (["solution-options", "solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [minimal-list, table-filtering, audit-ready]\n---\n# Options\n");
  }

  if (["solution-selected", "implementation-ready"].includes(stage)) {
    await write(project, "workflow/solution-selected.md", "---\nstatus: selected\nselectionType: option\nselectedOptionId: table-filtering\nselectedBy: user\nselectedAt: 2026-06-28T00:00:00.000Z\nselectionQuote: \"选择 table-filtering\"\n---\n# Selection\n");
    await write(project, "memory/decisions.md", "# Decisions\n\nselectedOptionId: table-filtering\n");
    state.selection = {
      selectionType: "option",
      selectedOptionId: "table-filtering",
      selectedBy: "user",
      selectedAt: "2026-06-28T00:00:00.000Z",
      selectionQuote: "选择 table-filtering",
    };
  }

  if (stage === "implementation-ready") {
    await write(project, "workflow/implementation-ready.md", "---\nstatus: ready\nconfirmedBy: user\nconfirmedAt: 2026-06-28T00:00:00.000Z\nconfirmationQuote: \"可以进入实现\"\n---\n# Ready\n");
    await write(project, "tasks/sprint-01.md", "# Sprint 01\n");
    state.currentStageDoc = "workflow/implementation-ready.md";
    state.lastConfirmedDoc = "workflow/implementation-ready.md";
    state.confirmation = {
      confirmedBy: "user",
      confirmedAt: "2026-06-28T00:00:00.000Z",
      confirmationQuote: "可以进入实现",
    };
  }

  await setState(project, state);
  return { root, project };
}

test("init creates scaffold and initialized check passes", async () => {
  const { root, project } = await tempProject();
  try {
    for (const path of ["frontend", "backend", "SPECS", "workflow", "tasks", "memory", "AGENTS.md", "workflow-state.json"]) {
      assert.equal(existsSync(join(project, path)), true, path);
    }
    assert.equal(existsSync(join(project, ".agents/skills/implement/SKILL.md")), true);
    assert.equal(existsSync(join(project, ".agents/skills/spec-driven-development/SKILL.md")), true);
    assert.equal(existsSync(join(project, "workflow/requirements.md")), false);
    assert.equal(existsSync(join(project, "frontend/node_modules")), false);
    assert.equal(existsSync(join(project, "backend/node_modules")), false);
    assert.equal(existsSync(join(project, "frontend/dist")), false);
    assert.equal(existsSync(join(project, "frontend/.env.example")), true);
    assert.equal(existsSync(join(project, "frontend/.env")), true);
    assert.equal(existsSync(join(project, "frontend/.env.development.example")), true);
    assert.equal(existsSync(join(project, "frontend/.env.development")), true);
    assert.equal(existsSync(join(project, "backend/.env.example")), true);
    assert.equal(existsSync(join(project, "backend/.env")), true);
    assert.match(await readFile(join(project, "frontend/SPECS/API.md"), "utf8"), /^Source: \.\.\/\.\.\/SPECS\/API\.md\n?$/);

    const check = run(["check"], { cwd: project });
    assert.equal(check.status, 0, check.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage advance rejects skipped stages and missing quote", async () => {
  const { root, project } = await tempProject();
  try {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");

    const skipped = run(["stage", "advance", "requirements-confirmed", "--by", "user", "--quote", "skip"], { cwd: project });
    assert.notEqual(skipped.status, 0);
    assert.match(skipped.stderr, /Repair:/);

    const missingQuote = run(["stage", "advance", "requirements-draft", "--by", "user"], { cwd: project });
    assert.notEqual(missingQuote.status, 0);
    assert.match(missingQuote.stderr, /--quote/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage advance rejects tampered allowedNextStages", async () => {
  const { root, project } = await tempProject();
  try {
    const state = await readJson(join(project, "workflow-state.json"));
    state.allowedNextStages = ["implementation-ready"];
    await setState(project, state);
    await write(project, "workflow/implementation-ready.md", "---\nstatus: ready\n---\n# Ready\n");

    const skipped = run(["stage", "advance", "implementation-ready", "--by", "user", "--quote", "try skip"], { cwd: project });
    assert.notEqual(skipped.status, 0);
    assert.match(skipped.stderr, /allowedNextStages must be \["requirements-draft"\] for stage "initialized"/);
    assert.match(skipped.stderr, /Repair:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage advance validates target artifact frontmatter", async () => {
  const { root, project } = await tempProject();
  try {
    const missing = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求"], { cwd: project });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing target artifact/);

    await write(project, "workflow/requirements.md", "# Requirements\n");
    const noYaml = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求"], { cwd: project });
    assert.notEqual(noYaml.status, 0);
    assert.match(noYaml.stderr, /Missing YAML/);

    await write(project, "workflow/requirements.md", "---\nstatus: confirmed\n---\n# Requirements\n");
    const wrongStatus = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求"], { cwd: project });
    assert.notEqual(wrongStatus.status, 0);
    assert.match(wrongStatus.stderr, /expected "draft"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("valid advance writes full history entry", async () => {
  const { root, project } = await tempProject();
  try {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");
    const advance = run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求草稿"], { cwd: project });
    assert.equal(advance.status, 0, advance.stderr);

    const state = await readJson(join(project, "workflow-state.json"));
    assert.equal(state.stage, "requirements-draft");
    assert.deepEqual(state.allowedNextStages, ["requirements-confirmed"]);
    assert.equal(state.currentStageDoc, "workflow/requirements.md");
    assert.equal(state.history.length, 1);
    assert.deepEqual(Object.keys(state.history[0]).sort(), ["advancedAt", "advancedBy", "doc", "from", "quote", "to"].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same-path requirements status switch fails before advance and passes after", async () => {
  const { root, project } = await tempProject();
  try {
    await write(project, "workflow/requirements.md", "---\nstatus: draft\n---\n# Requirements\n");
    assert.equal(run(["stage", "advance", "requirements-draft", "--by", "user", "--quote", "进入需求草稿"], { cwd: project }).status, 0);
    assert.equal(run(["check"], { cwd: project }).status, 0);

    await write(project, "workflow/requirements.md", "---\nstatus: confirmed\nconfirmedBy: user\nconfirmedAt: 2026-06-28T00:00:00.000Z\nconfirmationQuote: \"确认\"\n---\n# Requirements\n");
    const intermediate = run(["check"], { cwd: project });
    assert.notEqual(intermediate.status, 0);
    assert.match(intermediate.stderr, /status must be "draft"/);

    assert.equal(run(["stage", "advance", "requirements-confirmed", "--by", "user", "--quote", "确认"], { cwd: project }).status, 0);
    await write(project, "tasks/backlog.md", "# Backlog\n");
    assert.equal(run(["check"], { cwd: project }).status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage fixtures cover valid and invalid gate rules", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "kit-fixtures-"));
  try {
    const { project } = await tempProject();
    await cp(project, join(fixtureRoot, "base"), { recursive: true });

    const base = join(fixtureRoot, "base");
    assert.equal(run(["check"], { cwd: base }).status, 0);

    await write(base, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [a, b, c]\n---\n");
    const earlyFuture = run(["check"], { cwd: base });
    assert.notEqual(earlyFuture.status, 0);
    assert.match(earlyFuture.stderr, /Repair:/);

    await rm(join(base, "workflow/solution-options.md"), { force: true });
    await write(base, "workflow/requirements.md", "---\nstatus: draft\n---\n");
    assert.equal(run(["check"], { cwd: base }).status, 0, "initialized allows immediate requirements target");

    await rm(fixtureRoot, { recursive: true, force: true });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("valid fixtures pass for all six stages", async () => {
  for (const stage of ["initialized", "requirements-draft", "requirements-confirmed", "solution-options", "solution-selected", "implementation-ready"]) {
    const { root, project } = await buildProjectAt(stage);
    try {
      const check = run(["check"], { cwd: project });
      assert.equal(check.status, 0, `${stage}\n${check.stderr}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("invalid fixtures fail with repair actions", async () => {
  const cases = [
    {
      name: "missing history quote",
      stage: "requirements-draft",
      mutate: async (project) => {
        const state = await readJson(join(project, "workflow-state.json"));
        state.history = [{ from: "initialized", to: "requirements-draft", advancedBy: "user", advancedAt: "2026-06-28T00:00:00.000Z", doc: "workflow/requirements.md" }];
        await setState(project, state);
      },
      expected: /history\[0\] is missing "quote"/,
    },
    {
      name: "early future workflow file",
      stage: "initialized",
      mutate: async (project) => write(project, "workflow/solution-selected.md", "---\nstatus: selected\n---\n"),
      expected: /not allowed at stage "initialized"/,
    },
    {
      name: "missing source line",
      stage: "initialized",
      mutate: async (project) => write(project, "frontend/SPECS/API.md", "# duplicate API\n"),
      expected: /Missing exact root API source line/,
    },
    {
      name: "missing confirmed fields",
      stage: "requirements-confirmed",
      mutate: async (project) => write(project, "workflow/requirements.md", "---\nstatus: confirmed\n---\n# Requirements\n"),
      expected: /Missing frontmatter field "confirmedBy"/,
    },
    {
      name: "wrong option count",
      stage: "solution-options",
      mutate: async (project) => write(project, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [only-one]\n---\n# Options\n"),
      expected: /optionIds must contain exactly 3 ids/,
    },
    {
      name: "missing selected decision",
      stage: "solution-selected",
      mutate: async (project) => write(project, "memory/decisions.md", "# Decisions\n"),
      expected: /Missing selected option id "table-filtering"/,
    },
    {
      name: "early sprint plan",
      stage: "solution-selected",
      mutate: async (project) => write(project, "tasks/sprint-01.md", "# Sprint\n"),
      expected: /Sprint plan is created too early/,
    },
  ];

  for (const fixture of cases) {
    const { root, project } = await buildProjectAt(fixture.stage);
    try {
      await fixture.mutate(project);
      const check = run(["check"], { cwd: project });
      assert.notEqual(check.status, 0, fixture.name);
      assert.match(check.stderr, fixture.expected, fixture.name);
      assert.match(check.stderr, /Repair:/, fixture.name);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("immediate target artifacts are allowed but not validated as current state", async () => {
  const { root, project } = await buildProjectAt("requirements-confirmed");
  try {
    await write(project, "workflow/solution-options.md", "---\nstatus: proposed\noptionIds: [a, b, c]\n---\n# Options\n");
    const check = run(["check"], { cwd: project });
    assert.equal(check.status, 0, check.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
