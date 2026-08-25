const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const serverRoot = path.resolve(__dirname, '..');
const includedDirectories = [
  'config', 'controllers', 'middleware', 'models', 'routes', 'services', 'scripts', 'tasks', 'utils'
];
const files = [path.join(serverRoot, 'server.js')];

function collectJavaScriptFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectJavaScriptFiles(filePath);
    } else if (/\.(c?js)$/.test(entry.name)) {
      files.push(filePath);
    }
  }
}

for (const directory of includedDirectories) {
  collectJavaScriptFiles(path.join(serverRoot, directory));
}

const failures = [];
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push(`${path.relative(serverRoot, file)}\n${result.stderr.trim()}`);
  }
}

if (failures.length > 0) {
  console.error(`Server syntax validation failed:\n${failures.join('\n\n')}`);
  process.exit(1);
}

process.stdout.write(`Server syntax validation passed (${files.length} files).\n`);
