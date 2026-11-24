/* TASK-060 用户模块 · 断言脚本（合并后版本）
   2026-10-27：账号模块已并入 portomind-prototype.html，本脚本随之只对准**一个文件**。
   覆盖：A-01~A-15（auth 整改）+ M-01~M-04（主原型用户区）—— 两者现已同文件，去重后合并为一组。
   运行：node _audit-auth.cjs
   产出：_audit-auth/*.png 截图 + PASS/FAIL 逐条输出 + assertions.json + 退出码（有 FAIL 则 1）
   只读，不改原型。 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const MAIN = path.resolve(__dirname, 'portomind-prototype.html');
const AUTH_SHELL = path.resolve(__dirname, 'portomind-auth-prototype.html');
const FILE = 'file:///' + MAIN.replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '_audit-auth');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  const r = { name, ok: !!ok, detail: detail === undefined ? '' : detail };
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(results.length).padStart(2, '0')}  ${name}${r.ok ? '' : '   → ' + r.detail}`);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const src = fs.readFileSync(MAIN, 'utf8');
  const srcShell = fs.readFileSync(AUTH_SHELL, 'utf8');
  const count = (re) => (src.match(re) || []).length;

  /* =========================================================
     0. 文件级静态断言
  ========================================================= */
  // A-06：停用态文案刻意保留，且紧邻 D8 注释（防被当成"枚举漏洞"顺手改掉）
  check('A-06 全文件「该账号已停用」计数 = 1', count(/该账号已停用/g) === 1, `count=${count(/该账号已停用/g)}`);
  check('A-06 停用文案紧邻 D8 裁决注释',
    /D8 裁决[^\n]*\n[^\n]*该账号已停用/.test(src), '（注释须在文案上一行）');
  // A-14：三处演示内容均带 data-demo
  check('A-14 USERS 明文口令 mock 带 data-demo', src.includes('const USERS = [ // data-demo="1"'));
  check('A-14 文件头有 data-demo 全量剔除说明',
    /data-demo 标记的节点/.test(src) && /全量剔除/.test(src));
  // A-07：侧栏账户入口样式应已无定义（节点另由 DOM 断言）
  check('A-07 样式表无 .s-user / .s-exit 定义', !/\.s-user\s*\{/.test(src) && !/\.s-exit\s*\{/.test(src));
  // A-08：.toolbar / .count 必须已定义（原为使用却未定义）
  check('A-08 .toolbar 与 .count 样式已定义', /\.toolbar\s*\{/.test(src) && /\.count\s*\{/.test(src));
  // M-02：假按钮文案清零 + auth 原型已退役为跳转壳
  check('M-02 全文件无「登录体系未接入」假按钮文案', !/登录体系未接入/.test(src));
  check('合并：auth 原型已退役为跳转壳（无第二套实现）',
    /已合并/.test(srcShell) && /portomind-prototype\.html#\/login/.test(srcShell) && !/const USERS/.test(srcShell));

  /* =========================================================
     起浏览器
  ========================================================= */
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  // 整页加载（内存态归零，S.session 回到默认演示登录态）
  const boot = async (hash = '#/') => {
    await page.goto('about:blank');
    await page.goto(FILE + hash);
    await page.waitForTimeout(280);
  };
  // 以未登录态打开：清掉默认演示会话，交给守卫自己重定向
  const asGuest = async (hash = '#/') => {
    await boot(hash);
    await page.evaluate(() => { S.session = null; setUserMenu(false); route(); });
    await page.waitForTimeout(320);
  };
  // 站内导航：不重载，保留内存 session
  const nav = async (hash) => {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(280);
  };
  const login = async (u, p) => {
    await page.fill('#lgUser', u);
    await page.fill('#lgPwd', p);
    await page.click('#lgForm button[type="submit"]');
    await page.waitForTimeout(360);
  };
  const hashNow = () => page.evaluate(() => location.hash);

  /* =========================================================
     A · 未登录态
  ========================================================= */
  await asGuest('#/');
  await page.screenshot({ path: path.join(OUT, 'login.png') });

  const demo = await page.evaluate(() => ({
    note: !!document.querySelector('.demo-note[data-demo="1"]'),
    user: !!document.querySelector('#lgUser[data-demo="1"]'),
    pwd: !!document.querySelector('#lgPwd[data-demo="1"]'),
  }));
  check('A-14 演示注记 / 预填账号 / 密码三处 DOM 均带 data-demo',
    demo.note && demo.user && demo.pwd, JSON.stringify(demo));

  // A-11：登录页必须有 form，Enter 可提交
  check('A-11 登录页包在 form 内且有 submit 按钮',
    await page.evaluate(() => !!document.querySelector('form#lgForm') &&
      !!document.querySelector('#lgForm button[type="submit"]')));

  await page.fill('#lgUser', 'member');
  await page.fill('#lgPwd', 'member');
  await page.focus('#lgPwd');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(360);
  const afterEnter = await page.evaluate(() => ({
    hash: location.hash,
    session: S.session ? { ...S.session } : null,
  }));
  check('A-11 密码框按 Enter → 触发登录（session 已建立）',
    !!afterEnter.session && afterEnter.session.username === 'member', JSON.stringify(afterEnter));

  // A-02：未登录直访深链 → 稳定态 next 只出现一次
  await asGuest('#/portfolios');
  const deepHash = await hashNow();
  check('A-02 未登录直访 #/portfolios → #/login?next=%2Fportfolios',
    deepHash === '#/login?next=%2Fportfolios', deepHash);
  check('A-02 next= 出现且仅出现 1 次（无自我嵌套）',
    (deepHash.match(/next=/g) || []).length === 1, `count=${(deepHash.match(/next=/g) || []).length}`);
  await page.screenshot({ path: path.join(OUT, 'login-next.png') });

  // A-02 正向：next 回跳
  await login('member', 'member');
  check('A-02 next=/portfolios 登录后回跳 #/portfolios', (await hashNow()) === '#/portfolios', await hashNow());

  // A-02 负向：next 自嵌套 → 回落 /
  await boot('#/login?next=%2Flogin%3Fnext%3Dx');
  await page.evaluate(() => { S.session = null; route(); });
  await page.waitForTimeout(300);
  await login('member', 'member');
  const negHash = await hashNow();
  check('A-02 负向对照 next=/login?next=x → 回落 #/', negHash === '#/', negHash);

  /* =========================================================
     B · admin 首登（强制改密态）
  ========================================================= */
  await asGuest('#/');
  // 构造首登态：admin 的 mustChangePassword 置 true（真实产品由建号/重置密码写入）
  await page.evaluate(() => {
    const u = USERS.find((x) => x.username === 'admin');
    u.mustChangePassword = true;
  });
  await login('admin', 'admin1234');
  const adminFirst = await hashNow();
  check('B admin 首登（mustChangePassword）→ 落 #/account', adminFirst === '#/account', adminFirst);
  await page.screenshot({ path: path.join(OUT, 'forced-change.png') });

  // D13：/account 不再承载页内 Tab（系统设置已独立成页）
  const tabsAdmin = await page.evaluate(() => ({
    ptabs: document.querySelectorAll('.ptabs').length,
    title: (document.querySelector('#tbTitle') || {}).textContent,
  }));
  check('D13 admin #/account 无页内 Tab（系统设置已独立成页）',
    tabsAdmin.ptabs === 0, JSON.stringify(tabsAdmin));

  // A-09：身份区不得出现「管理员 管理员」
  const idText = await page.evaluate(() => {
    const kv = document.querySelector('#view .kv');
    return kv ? kv.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check('A-09 身份区块无「管理员 管理员」重复', !!idText && !/管理员\s*管理员/.test(idText), idText);

  // A-10：73 字符新密码必须被显式拒绝
  const clickPwSubmit = () => page.evaluate(() => {
    const cards = document.querySelectorAll('#view .card');
    const last = cards[cards.length - 1];
    const b = [...last.querySelectorAll('button')].find((x) => /设定新密码|保存密码/.test(x.textContent));
    if (b) b.click();
  });
  const longPwd = 'a'.repeat(73);
  await page.fill('#pwNew', longPwd);
  await page.fill('#pwNew2', longPwd);
  await clickPwSubmit();
  await page.waitForTimeout(260);
  const pwdReject = await page.evaluate(() => {
    const e = document.querySelector('#pwNew');
    const f = e ? e.parentElement.querySelector('.ferr') : null;
    return { err: !!(e && e.classList.contains('err')), msg: f ? f.textContent : null, hash: location.hash };
  });
  check('A-10 强制改密输 73 字符 → 被拒且提示含「8–72」',
    pwdReject.err && /8–72/.test(pwdReject.msg || '') && pwdReject.hash === '#/account',
    JSON.stringify(pwdReject));

  // A-15 + D13：强制改密态下顶栏下拉仍可展开；「系统设置」保留但禁用并说明原因
  const dropdownForced = await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    if (!t) return { missing: true };
    t.click();
    const rows = [...document.querySelectorAll('.um-acts > *')].filter((x) => !x.hidden);
    const sys = document.querySelector('#umSysRow');
    const out = {
      missing: false,
      expanded: t.getAttribute('aria-expanded'),
      labels: rows.map((x) => x.textContent.trim()),
      sysShown: !!sys && !sys.hidden,
      sysDisabled: !!sys && sys.disabled,
      sysTitle: sys ? sys.title : null,
      // 除系统设置外，账户设置与退出登录必须可用
      othersEnabled: rows.filter((x) => x.id !== 'umSysRow').every((x) => !x.disabled),
    };
    t.click();   // 收起，避免影响后续点击
    return out;
  });
  check('A-15 强制改密态下顶栏下拉可展开，账户设置/退出登录均可用',
    !dropdownForced.missing && dropdownForced.expanded === 'true' &&
    JSON.stringify(dropdownForced.labels) === JSON.stringify(['账户设置', '系统设置', '提醒规则', '退出登录']) &&
    dropdownForced.othersEnabled,
    JSON.stringify(dropdownForced));
  check('D13 强制改密态：系统设置项保留但禁用 + 说明原因（不静默消失）',
    dropdownForced.sysShown && dropdownForced.sysDisabled && /密码/.test(dropdownForced.sysTitle || ''),
    JSON.stringify(dropdownForced));

  // 完成改密 → 落 Dashboard（A-04 / D10）
  await page.waitForTimeout(160);
  await page.fill('#pwNew', 'admin1234');
  await page.fill('#pwNew2', 'admin1234');
  await clickPwSubmit();
  await page.waitForTimeout(380);
  const afterPwd = await hashNow();
  check('B 强制改密完成 → 落 #/（Dashboard，不是 /account）', afterPwd === '#/', afterPwd);

  /* =========================================================
     C · admin 正常态
  ========================================================= */
  await page.screenshot({ path: path.join(OUT, 'dashboard.png') });

  // A-01 / M-01：侧栏恰 5 项，且无任何账户入口
  //   文案取 .lbl（不含「组合管理」的展开箭头 › 与「今日行情」的监控 badge）
  const side = await page.evaluate(() => ({
    n: document.querySelectorAll('.s-nav .s-item').length,
    texts: [...document.querySelectorAll('.s-nav .s-item > .lbl')].map((x) => x.textContent.trim()),
    badge: (() => {
      const el = document.querySelector('#nav-prices .s-badge');
      return el ? el.textContent.trim() : null;
    })(),
    sUser: document.querySelectorAll('.s-user').length,
    sExit: document.querySelectorAll('.s-exit').length,
    bottomText: (document.querySelector('.s-bottom') || {}).textContent || '',
  }));
  // 2026-10-27：「提醒规则」移出侧栏（改由顶栏下拉进入），侧栏 5 → 4 项；「今日行情」改名「自选行情」
  check('A-01/M-01 侧栏顶级导航项数 = 4（提醒规则已移入下拉）', side.n === 4, `n=${side.n}`);
  check('A-01 侧栏导航文案 = {Dashboard,组合管理,自选行情,日志}',
    JSON.stringify(side.texts) === JSON.stringify(['Dashboard', '组合管理', '自选行情', '日志']),
    JSON.stringify(side.texts));
  check('A-01 侧栏不含「提醒规则」（入口已移至下拉）',
    !side.texts.includes('提醒规则') && !/提醒规则/.test(side.bottomText), JSON.stringify(side.texts));
  check('A-01 「自选行情」保留「监控」badge（FS-asset-price-consolidation §导航）',
    side.badge === '监控', `badge=${side.badge}`);
  check('A-07/M-02 侧栏 .s-exit = 0 且 .s-user = 0（假按钮已删）',
    side.sExit === 0 && side.sUser === 0, `sExit=${side.sExit} sUser=${side.sUser}`);
  check('A-07/M-02 侧栏底部只剩版本号（无账户入口残字）',
    !/账户|退出/.test(side.bottomText), side.bottomText.trim());

  // A-15：下拉结构
  const dd = await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    t.click();
    const panel = document.querySelector('#umPanel');
    const acts = [...document.querySelectorAll('.um-acts > *')];
    const idRow = document.querySelector('.um-id');
    return {
      expanded: t.getAttribute('aria-expanded'),
      haspopup: t.getAttribute('aria-haspopup'),
      controls: t.getAttribute('aria-controls'),
      visible: panel && panel.classList.contains('show'),
      labels: acts.filter((x) => !x.hidden).map((x) => x.textContent.trim()),
      idText: idRow ? idRow.textContent.replace(/\s+/g, ' ').trim() : null,
      idTag: idRow ? idRow.tagName.toLowerCase() : null,
      idClickable: !!(idRow && idRow.closest('a,button')),
      panelZ: panel ? getComputedStyle(panel).zIndex : null,
      topbarZ: getComputedStyle(document.querySelector('.topbar')).zIndex,
      maskZ: getComputedStyle(document.querySelector('.mask')).zIndex,
    };
  });
  check('A-15 头像可点开且 aria-expanded="true"',
    dd.expanded === 'true' && dd.visible === true, `expanded=${dd.expanded} visible=${dd.visible}`);
  check('A-15 aria-haspopup / aria-controls 齐备',
    dd.haspopup === 'menu' && dd.controls === 'umPanel', `haspopup=${dd.haspopup} controls=${dd.controls}`);
  check('D13 admin 下拉动作项 = 4 且顺序为「账户设置」「系统设置」「提醒规则」「退出登录」',
    JSON.stringify(dd.labels) === JSON.stringify(['账户设置', '系统设置', '提醒规则', '退出登录']), JSON.stringify(dd.labels));
  check('2026-10-27 提醒规则在下拉末位（退出登录之前；danger 项固定最后）',
    dd.labels[dd.labels.length - 1] === '退出登录' && dd.labels[dd.labels.length - 2] === '提醒规则',
    JSON.stringify(dd.labels));

  // 修改1：身份行 = 用户名 + 角色同一行，角色弱化（muted）且不强调
  const idRow = await page.evaluate(() => {
    const name = document.querySelector('#umName');
    const role = document.querySelector('#umRole');
    if (!name || !role) return { missing: true };
    const cs = getComputedStyle(role);
    const box = (el) => el.getBoundingClientRect();
    return {
      missing: false,
      sameRow: Math.abs(box(name).top - box(role).top) < 6,
      roleText: role.textContent.trim(),
      roleHasChip: !!role.querySelector('.chip'),
      roleColor: cs.color,
      nameColor: getComputedStyle(name).color,
      roleWeight: cs.fontWeight,
    };
  });
  check('身份行：用户名与角色同一行', !idRow.missing && idRow.sameRow === true, JSON.stringify(idRow));
  check('身份行：角色弱化（无 chip、颜色 muted、字重 ≤500）',
    idRow.roleHasChip === false && idRow.roleColor === 'rgb(138, 149, 165)' && Number(idRow.roleWeight) <= 500,
    JSON.stringify(idRow));
  check('A-15/M-03 身份行含用户名与角色且不可点击（非 a/button）',
    /admin/.test(dd.idText || '') && /管理员/.test(dd.idText || '') && dd.idClickable === false,
    `${dd.idTag} :: ${dd.idText}`);
  check('A-15 下拉层级：topbar(z30) < panel < mask(z90)',
    Number(dd.topbarZ) < Number(dd.panelZ) && Number(dd.panelZ) < Number(dd.maskZ),
    `topbar=${dd.topbarZ} panel=${dd.panelZ} mask=${dd.maskZ}`);

  // Esc 关闭 + 焦点回触发器
  await page.keyboard.press('Escape');
  await page.waitForTimeout(180);
  const escState = await page.evaluate(() => ({
    expanded: document.querySelector('#umTrigger').getAttribute('aria-expanded'),
    focused: document.activeElement && document.activeElement.id,
  }));
  check('A-15 Esc 关闭且焦点回到触发器',
    escState.expanded === 'false' && escState.focused === 'umTrigger', JSON.stringify(escState));

  // 点页面空白处关闭
  const outside = await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
    document.querySelector('#view').click();
    return t.getAttribute('aria-expanded');
  });
  check('A-15 点击面板外关闭', outside === 'false', `expanded=${outside}`);

  // A-15 / D12：点「账户设置」→ #/account
  await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
  });
  await page.waitForTimeout(140);
  await page.click('.um-acts > *:first-child');
  await page.waitForTimeout(320);
  const acctHash = await hashNow();
  check('A-15/D12 点「账户设置」→ #/account（不经过侧栏）', acctHash === '#/account', acctHash);
  await page.screenshot({ path: path.join(OUT, 'account.png') });

  const acctTitle = await page.evaluate(() => ({
    title: (document.querySelector('#tbTitle') || {}).textContent,
    ptabs: document.querySelectorAll('.ptabs').length,
    phTitle: (document.querySelector('#view .ph-title') || {}).textContent,
  }));
  check('M-04 #/account 真实承载（顶栏为分组名、页内为「账户设置」，两者不同名，无 Tab）',
    acctTitle.ptabs === 0 && /账户设置/.test(acctTitle.phTitle || '') &&
    /^账户$/.test((acctTitle.title || '').trim()) && (acctTitle.title || '').trim() !== (acctTitle.phTitle || '').trim(),
    JSON.stringify(acctTitle));

  // A-03：已登录访问 #/login → 回 #
  await nav('#/login');
  await page.waitForTimeout(320);
  const backFromLogin = await hashNow();
  check('A-03 已登录访问 #/login → 最终 hash = #/', backFromLogin === '#/', backFromLogin);

  // D13：下拉「系统设置」直达独立页面
  await nav('#/');
  await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
  });
  await page.waitForTimeout(140);
  await page.click('#umSysRow');
  await page.waitForTimeout(320);
  check('D13 下拉点「系统设置」→ #/account/users', (await hashNow()) === '#/account/users', await hashNow());

  // A-13 / A-08：系统设置（独立页面）
  await nav('#/account/users');
  await page.screenshot({ path: path.join(OUT, 'users.png') });
  const toolbarMargin = await page.evaluate(() => {
    const el = document.querySelector('.toolbar');
    return el ? parseFloat(getComputedStyle(el).marginBottom) : null;
  });
  check('A-08 .toolbar margin-bottom ≥ 12px', toolbarMargin !== null && toolbarMargin >= 12, `now=${toolbarMargin}`);

  const mainUsers = await page.evaluate(() => ({
    hash: location.hash,
    hasTable: !!document.querySelector('#view table.tb'),
    hasNew: /新建用户/.test(document.body.textContent),
    ptabs: document.querySelectorAll('.ptabs').length,
    phTitle: (document.querySelector('#view .ph-title') || {}).textContent,
    tbTitle: (document.querySelector('#tbTitle') || {}).textContent,
    acctTabLink: !!document.querySelector('.ptab'),
  }));
  check('M-04 #/account/users 真实承载（用户表 + 新建）',
    mainUsers.hash === '#/account/users' && mainUsers.hasTable && mainUsers.hasNew, JSON.stringify(mainUsers));
  check('D13 系统设置 = 独立页面：自有页头「系统设置」+ 顶栏为分组名（不同名）+ 无页内 Tab',
    mainUsers.ptabs === 0 && mainUsers.phTitle === '系统设置' &&
    /^账户$/.test((mainUsers.tbTitle || '').trim()) && mainUsers.acctTabLink === false, JSON.stringify(mainUsers));

  // A-05 / D9：self 行不得有「重置密码」，应有「改密码」
  const selfRow = await page.evaluate(() => {
    const tr = document.querySelector('tr[data-self="1"]');
    if (!tr) return null;
    return { btns: [...tr.querySelectorAll('button')].map((b) => b.textContent.trim()) };
  });
  check('A-05 self 行无「重置密码」按钮', !!selfRow && !selfRow.btns.includes('重置密码'),
    JSON.stringify(selfRow && selfRow.btns));
  check('A-05 self 行有「改密码」按钮（跳 /account）', !!selfRow && selfRow.btns.includes('改密码'),
    JSON.stringify(selfRow && selfRow.btns));

  // A-12：字段级报错（用户名非法 → .err + .ferr）
  await nav('#/account');
  await page.fill('#accName', 'A');
  await page.evaluate(() => {
    const cards = document.querySelectorAll('#view .card');
    const b = [...cards[1].querySelectorAll('button')].find((x) => /保存用户名/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(220);
  const fieldErr = await page.evaluate(() => {
    const el = document.querySelector('#accName');
    const f = el.parentElement.querySelector('.ferr');
    return { err: el.classList.contains('err'), msg: f ? f.textContent : null };
  });
  check('A-12 用户名填 A → 输入框 .err 且存在 .ferr', fieldErr.err === true && !!fieldErr.msg, JSON.stringify(fieldErr));
  await page.screenshot({ path: path.join(OUT, 'field-error.png') });

  // A-13：空态
  await nav('#/account/users');
  const emptyState = await page.evaluate(() => {
    const bak = USERS.slice();
    USERS.length = 0;
    route();
    const el = document.querySelector('#view .empty');
    const out = { hasEmpty: !!el, text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '' };
    bak.forEach((u) => USERS.push(u));
    route();
    return out;
  });
  check('A-13 USERS=[] 时表格区显示空态文案',
    emptyState.hasEmpty && /还没有其他账号/.test(emptyState.text), JSON.stringify(emptyState));

  // A-13：加载骨架（.skel-row × 4）
  const skel = await page.evaluate(() => {
    S.usersLoading = true; route();
    const n = document.querySelectorAll('#view .skel-row').length;
    const animated = getComputedStyle(document.querySelector('#view .skel')).animationName;
    S.usersLoading = false; route();
    return { n, animated };
  });
  check('A-13 S.usersLoading=true → 渲染 4 行骨架且带动画',
    skel.n === 4 && skel.animated === 'sk', JSON.stringify(skel));

  /* =========================================================
     D · member 视角
  ========================================================= */
  await asGuest('#/');
  await login('member', 'member');
  check('A-04 #/login 用 member/member 登录 → 最终 hash = #/', (await hashNow()) === '#/', await hashNow());

  await nav('#/account');
  // 只查 #view：document.body.textContent 会算进内联 <script> 的字符串，导致正则恒真（已知坑）
  const memberAcctView = await page.evaluate(() => {
    const view = document.querySelector('#view');
    return {
      ptabs: document.querySelectorAll('.ptabs').length,
      usersEntry: /系统设置/.test(view ? view.textContent : ''),
    };
  });
  check('D13 member #/account 无页内 Tab 且页面内不含「系统设置」字样',
    memberAcctView.ptabs === 0 && memberAcctView.usersEntry === false, JSON.stringify(memberAcctView));

  await nav('#/');
  // D13：member 的下拉里不应出现「系统设置」
  const memberDD = await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
    const sys = document.querySelector('#umSysRow');
    const acts = [...document.querySelectorAll('.um-acts > *')].filter((x) => !x.hidden);
    const out = {
      labels: acts.map((x) => x.textContent.trim()),
      sysHidden: !!sys && sys.hidden,
    };
    t.click();
    return out;
  });
  check('D13 member 下拉恰 3 项、无「系统设置」、含「提醒规则」',
    JSON.stringify(memberDD.labels) === JSON.stringify(['账户设置', '提醒规则', '退出登录']) &&
    memberDD.sysHidden === true,
    JSON.stringify(memberDD));

  await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
  });
  await page.waitForTimeout(140);
  await page.click('.um-acts > *:first-child');
  await page.waitForTimeout(300);
  const memberAcct = await hashNow();
  check('A-15/D12 member 点「账户设置」也能到 #/account', memberAcct === '#/account', memberAcct);

  // member 直访用户管理 → 403 屏
  await nav('#/account/users');
  const forbidden = await page.evaluate(() => ({
    hash: location.hash,
    has403: /无权访问用户管理/.test(document.body.textContent),
  }));
  check('A-01/member 直访 #/account/users → 403 说明屏', forbidden.has403 === true, JSON.stringify(forbidden));
  await page.screenshot({ path: path.join(OUT, 'member-403.png') });

  /* =========================================================
     E · 会话与守卫（原 M-04）
  ========================================================= */
  await boot('#/');
  await page.evaluate(() => {
    const t = document.querySelector('#umTrigger');
    if (t.getAttribute('aria-expanded') !== 'true') t.click();
  });
  await page.waitForTimeout(160);
  await page.click('.um-acts > *:last-child');   // 退出登录
  await page.waitForTimeout(360);
  const afterLogout = await hashNow();
  check('M-04 退出登录 → #/login', afterLogout === '#/login', afterLogout);
  await page.screenshot({ path: path.join(OUT, 'main-login.png') });

  await nav('#/portfolios');
  await page.waitForTimeout(340);
  const mainDeep = await hashNow();
  check('M-04 未登录直访深链 → #/login?next=%2Fportfolios（next 仅 1 次）',
    mainDeep === '#/login?next=%2Fportfolios' && (mainDeep.match(/next=/g) || []).length === 1, mainDeep);

  await login('admin', 'admin1234');
  const mainBack = await hashNow();
  check('M-04 登录后回跳 next（#/portfolios）', mainBack === '#/portfolios', mainBack);

  check('合并后单文件无 JS 运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));

  /* =========================================================
     汇总
  ========================================================= */
  await browser.close();

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log('\n=== TASK-060 用户模块断言（合并后 · 单文件） ===');
  console.log(`\n合计 ${results.length} 条：PASS ${pass} · FAIL ${fail}`);
  fs.writeFileSync(path.join(OUT, 'assertions.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, pass, fail, results }, null, 2));
  process.exit(fail ? 1 : 0);
})();
