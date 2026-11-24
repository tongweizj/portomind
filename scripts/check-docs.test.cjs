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
test('valid local links, Unicode anchors and directory targets pass', t => {
  const root = fixture(t, {
    'docs/index.md': '# Index\n[guide](./guide.md)\n[chapter](./guide.md#2-用法)\n[dir](./sub)',
    'docs/guide.md': '# Guide\n## 2. 用法\ntext',
    'docs/sub/note.md': '# Note'
  });
  assert.equal(run(root).status, 0);
  assert.equal(run(root, ['--links-only']).status, 0);
});
test('missing local targets are reported as broken-link', t => {
  const root = fixture(t, { 'docs/index.md': '[missing](./absent.md)\n![image](./absent.png)' });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors.map(e => e.rule), ['broken-link', 'broken-link']);
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
test('task-card statuses, delivery layout and template placeholders are no longer validated', t => {
  const root = fixture(t, {
    'docs/development/tasks/active/TASK-001.md': '| Status | NotARealStatus |',
    'docs/development/delivery/US-001/note.md': '# One',
    'docs/development/delivery/US-002/note.md': '# Two',
    'docs/development/delivery/US-003/note.md': '# Three',
    'docs/os/templates/TASK_TEMPLATE.md': '<PROJECT_NAME>',
    'docs/os/roles/PLANNER.md': '<PROJECT_NAME>',
    'docs/standards/CODING.md': '<technology>'
  });
  const result = run(root);
  assert.equal(result.status, 0);
  assert.deepEqual(result.errors, []);
});
test('root CLAUDE.md is scanned as an entry document', t => {
  const root = fixture(t, {
    'README.md': '# README\n[guide](./docs/guide.md)',
    'CLAUDE.md': '# CLAUDE\n[guide](./docs/guide.md)\n[missing](./docs/absent.md)',
    'docs/guide.md': '# Guide'
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.totalLinks, 3);
  assert.deepEqual(result.errors.map(e => [e.file, e.rule]), [['CLAUDE.md', 'broken-link']]);
});
test('json output exposes link-check fields only', t => {
  const root = fixture(t, { 'docs/index.md': '[guide](./guide.md)', 'docs/guide.md': '# Guide' });
  const result = run(root);
  assert.equal(result.files, 2);
  assert.equal(result.totalLinks, 1);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warns, []);
  assert.ok(Array.isArray(result.sourceOnlyLinks));
  assert.equal('routingRows' in result, false);
  assert.equal('pendingTasks' in result, false);
});
