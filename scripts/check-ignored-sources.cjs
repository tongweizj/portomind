#!/usr/bin/env node
/**
 * check-ignored-sources.cjs — 防止源码被 .gitignore 静默吞掉（TASK-053 F-01）
 *
 * 事故（2026-10-31 评审发现，BLOCKER）：
 *   `client/src/components/Logs/RawLogView.jsx` 被 `client/.gitignore` 的 `logs` 规则命中。
 *   原因：本机 `core.ignorecase=true`，`logs` 规则同时匹配 `Logs/` 目录。
 *   后果：本地能构建（文件在磁盘上），但 `git add` 直接拒绝 → 一旦正常提交，
 *         该文件**不会进入提交**，别人拉下来构建必失败（`LogViewer.jsx` 静态 import 它）。
 *   为什么以前没人发现：`git status` 默认不显示被忽略的文件，构建也照样通过。
 *
 * 本脚本把「源码目录里存在但被 git 忽略的文件」变成可机械检测的错误。
 *
 * 用法：
 *   node scripts/check-ignored-sources.cjs
 *   node scripts/check-ignored-sources.cjs --json
 *
 * 退出码：0 = 无问题；1 = 存在被忽略的源码文件（必须处理）。
 *
 * 只读：不修改任何文件。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_OUT = process.argv.includes('--json');

// 源码根：这些目录下的文件都应当可以进入版本库
const SOURCE_DIRS = [
  'client/src',
  'server',
  'shared',
  'cron-worker',
  'scripts',
  'client/scripts',
];

// 明确允许留在本机、不进版本库的路径（运行产物 / 构建产物 / 密钥）。
// 注意：这里只放「确定不该入库」的，不要为了消警把正常源码加进来。
const ALLOWED_IGNORED = [
  /^server\/logs\//,
  /^cron-worker\/logs\//,
  /^logs\//,
  /node_modules\//,
  /\/dist\//,
  /^client\/dist\//,
  /\.env$/,
  // 运行期日志（任意 workspace 的 logs/ 目录下的日志文件）
  /(^|\/)logs\/.*\.log$/,
];

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

function listIgnored() {
  // --ignored=matching 配合 --untracked-files=all：列出「被忽略的未跟踪文件」
  const out = git(['status', '--porcelain', '--ignored=matching', '--untracked-files=all']);
  const ignored = [];
  for (const line of out.split('\n')) {
    if (!line.startsWith('!! ')) continue;
    let p = line.slice(3).trim();
    // 目录形式的条目以 / 结尾，展开成文件由后续遍历负责；这里先收集
    ignored.push(p.replace(/\\/g, '/').replace(/\/$/, ''));
  }
  return ignored;
}

function walkFiles(dirAbs, baseAbs, acc) {
  const fs = require('fs');
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      walkFiles(abs, baseAbs, acc);
    } else {
      acc.push(path.relative(baseAbs, abs).replace(/\\/g, '/'));
    }
  }
}

function main() {
  let repoRoot;
  try {
    repoRoot = git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    console.error('ERROR 不在 git 仓库内');
    process.exitCode = 1;
    return;
  }

  const ignored = listIgnored();
  const problems = [];

  for (const srcDir of SOURCE_DIRS) {
    const dirAbs = path.join(ROOT, srcDir);
    const files = [];
    walkFiles(dirAbs, ROOT, files);

    for (const rel of files) {
      if (ALLOWED_IGNORED.some((re) => re.test(rel))) continue;
      // 用 git check-ignore 判定该具体文件是否被忽略（比字符串前缀匹配准确）
      let isIgnored = false;
      let rule = '';
      try {
        const res = execFileSync('git', ['check-ignore', '-v', rel], {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (res.trim()) {
          isIgnored = true;
          rule = res.trim();
        }
      } catch {
        isIgnored = false;
      }
      if (isIgnored) problems.push({ file: rel, rule });
    }
  }

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ problems, ignoredCount: ignored.length }, null, 2) + '\n');
  } else {
    if (problems.length === 0) {
      console.log('PASS  源码目录内没有被 .gitignore 忽略的文件');
      console.log(`      （扫描 ${SOURCE_DIRS.join(', ')}）`);
    } else {
      console.log('ERROR 以下源码文件会被 .gitignore 忽略，正常提交不会进入版本库：');
      for (const p of problems) {
        console.log(`  - ${p.file}`);
        console.log(`      命中规则：${p.rule}`);
      }
      console.log('');
      console.log('处理建议：改目录/文件名避开冲突规则（首选），或在 .gitignore 里加显式例外。');
      console.log('不要用 `git add -f` 长期绕过 —— 后续同类文件仍会被静默忽略。');
    }
  }

  process.exitCode = problems.length ? 1 : 0;
}

main();
