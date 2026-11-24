// client/scripts/lib/chrome.cjs
//
// 验收脚本共用的 Chrome 路径解析与 WSL profile 目录处理。
// WSL 下 Node 无法直接 spawn Windows 盘符路径，且 --user-data-dir 必须是
// Windows 可识别路径；这里把两处平台差异收敛到一份实现。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'
];

function resolveChrome() {
  return process.env.CHROME_PATH
    || DEFAULT_CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate))
    || DEFAULT_CHROME_CANDIDATES[0];
}

function makeChromeProfile(chromePath, prefix) {
  if (!/^\/mnt\/[a-z]\//i.test(chromePath)) {
    return { dir: fs.mkdtempSync(path.join(os.tmpdir(), prefix)), chromeArg: null };
  }
  const windowsTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8' }).trim();
  const windowsProfile = `${windowsTemp}\\${prefix}${process.pid}-${Date.now()}`;
  const wslProfile = windowsProfile
    .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
    .replace(/\\/g, '/');
  fs.mkdirSync(wslProfile, { recursive: true });
  return { dir: wslProfile, chromeArg: windowsProfile };
}

module.exports = { resolveChrome, makeChromeProfile };
