const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const checker = path.join(__dirname, 'check-docs.cjs');
function fixture(t, entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portomind-docs-check-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('portomind-docs-check-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (const [file, text] of Object.entries(entries)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return root;
}
function run(root, extra = []) {
  const result = spawnSync(process.execPath, [checker, '--root', root, '--json', ...extra], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.ok(result.stdout, result.stderr);
  return { status: result.status, ...JSON.parse(result.stdout) };
}
const card = 'docs/development/delivery/US-001/TASK-001.md';
test('plain tables, bold tables and legacy paragraph/heading metadata are recognised', t => {
  const root = fixture(t, {
    [card]: '| Status | Planning |\n| Created / Updated | 2026-10-30 / 2026-10-30 |',
    'docs/development/tasks/active/TASK-002.md': '| **Status** | `Reviewing` |\n| **Created** | 2026-10-30 |',
    'docs/development/tasks/completed/TASK-003.md': '## Status\n\n`Done`\n\n## Created\n\n`2026-10-15`',
    'docs/development/tasks/active/TASK-004.md': '**Status:**  \n`BACKLOG`\n\n**Created:**  \n`2026-10-26`'
  });
  assert.equal(run(root).status, 0);
});
test('invalid unquoted status is rejected; a recent Updated date does not revoke legacy spelling', t => {
  const bad = fixture(t, { [card]: '| Status | Ready |\n| Created / Updated | 2026-10-30 / 2026-10-30 |' });
  assert.ok(run(bad).errors.some(e => e.rule === 'task-status-enum'));
  const legacy = fixture(t, { [card]: '| Status | BACKLOG |\n| Created / Updated | 2026-10-26 / 2026-10-30 |' });
  assert.equal(run(legacy).status, 0);
});
test('only an explicit unregistered declaration permits absent Status; declaration plus Status conflicts', t => {
  const declaration = '> 待 Orchestrator 正式登记的任务内容，当前不含 Status，不属于已登记任务或实施队列。';
  const pending = run(fixture(t, { [card]: declaration }));
  assert.equal(pending.status, 0);
  assert.equal(pending.pendingTasks.length, 1);
  assert.equal(run(fixture(t, { [card]: '# incomplete card' })).status, 2);
  assert.ok(run(fixture(t, { [card]: declaration + '\n| Status | Planning |' })).errors.some(e => e.rule === 'pending-status-conflict'));
});
test('source fallback can resolve code but cannot mask a missing document', t => {
  const source = fixture(t, { 'client/example.js': '// original code', 'docs/missing.md': '# Original document' });
  const root = fixture(t, { 'docs/index.md': '[code](../client/example.js)\n[missing](./missing.md)' });
  const result = run(root, ['--source-root', source]);
  assert.equal(result.sourceOnlyLinks.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].rule, 'broken-link');
  assert.ok(run(root).errors.length > result.errors.length);
});
test('Unicode heading anchors and self-links resolve; stale chapters fail', t => {
  const root = fixture(t, { 'docs/guide.md': '# Guide\n### 3.4 `launchDate`（成立日）的作用\n[ok](#34-launchdate成立日的作用)\n[stale](#34-launchdate-成立日-的作用)' });
  const result = run(root);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].rule, 'broken-anchor');
});
test('HTML assets are checked and external MongoDB paths cannot silently inherit local directory names', t => {
  const root = fixture(t, { 'docs/index.md': '[correct](https://www.mongodb.com/docs/manual/core/index-partial/)\n[corrupt](https://www.mongodb.com/docs/handbook/manual/core/index-partial/)\n<img src="./absent.png">' });
  assert.deepEqual(run(root).errors.map(e => e.rule).sort(), ['broken-link', 'external-url-rewritten']);
});
test('current template directory is allowed; unfilled role instructions are rejected', t => {
  const root = fixture(t, { 'docs/os/templates/TASK_TEMPLATE.md': '<PROJECT_NAME>', 'docs/os/roles/PLANNER.md': '<PROJECT_NAME>' });
  const result = run(root);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].file, 'docs/os/roles/PLANNER.md');
});
test('flat current, completed and exited Story cards are checked, while plans are not treated as cards', t => {
  const root = fixture(t, {
    [card]: '| Status | Planning |',
    'docs/development/delivery/US-001/TASK-001-plan.md': '## Status\n\nStatus：Draft',
    'docs/development/delivery/completed/US-002/TASK-002.md': '| Status | Ready |',
    'docs/development/archive/delivery/US-003/TASK-003.md': '| Status | Ready |'
  });
  const result = run(root);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every(e => e.rule === 'task-status-enum'));
  assert.equal(result.warns.length, 0);
});
test('only one current Story directory is allowed, and Story process directories stay flat', t => {
  const root = fixture(t, {
    [card]: '| Status | Planning |',
    'docs/development/delivery/US-002/note.md': '# Second current Story',
    'docs/development/delivery/completed/US-003/tasks/TASK-003.md': '| Status | Completed |'
  });
  assert.deepEqual(run(root).errors.map(e => e.rule).sort(), ['multiple-current-deliveries', 'nested-story-directory']);
});
