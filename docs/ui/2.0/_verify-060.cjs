/* TASK-060 独立验收（Reviewer 侧，构造型；不参考执行方的 _audit-auth.cjs）
   目的：只断言"可判定的行为结果"，并覆盖执行方自测容易漏的三类：
     ① URL 驱动 vs 内存态（用浏览器后退键验证 Tab，而不是直访）
     ② 负向对照（不该出现的东西真的没出现）
     ③ 视觉层（同屏标题重复、侧栏误高亮）
   运行：node _verify-060.cjs     只读两个原型，不改它们。

   ⚠️ 2026-10-27 文件合并后本脚本**已不适用**（保留原样，供追溯）
   - 账号模块已并入 portomind-prototype.html；portomind-auth-prototype.html 退为跳转壳。
   - 因此 AUTH 常量（第 11 行）指向的已不是可实现原型页面，A/B/C 三段的 FAIL 属
     「审查对象消失」而非缺陷。
   - 另有两处结论需按合并后事实重读：
     · A-01「导航文本集合」取 .s-item 的 textContent，会把展开箭头 › 与「监控」badge
       算进文案 → 合并后跑会 FAIL，正确的取法是 `.s-item > .lbl`。
     · 主原型默认带演示登录态，`goto(AUTH+'#/portfolios')` 类深链不会触发未登录守卫，
       需先 `S.session=null; route()` 才能复现。
   - 合并后的单文件断言见 _audit-auth.cjs（51 条，已按 .lbl 与清会话改写）。
   - 本脚本的 §10 结论（N-1~N-7）仍然有效，只是 N-1 的「两个原型必须同改」前提已消解。
*/
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const AUTH = 'file:///' + path.resolve(__dirname, 'portomind-auth-prototype.html').replace(/\\/g, '/');
const MAIN = 'file:///' + path.resolve(__dirname, 'portomind-prototype.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '_verify-060');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const R = [];
function ok(name, pass, detail) {
  R.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${String(R.length).padStart(2, '0')}  ${name}${pass ? '' : '   → ' + detail}`);
}
const hash = p => p.evaluate(() => location.hash);
const txt = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errs = [];
  const newPage = async () => {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    return pg;
  };
  const login = async (pg, u, pw) => {
    await pg.fill('#lgUser', u);
    await pg.fill('#lgPwd', pw);
    await pg.click('#lgForm button[type=submit]');
    await pg.waitForTimeout(150);
  };
  const shot = async (pg, name) => { await pg.screenshot({ path: path.join(OUT, name + '.png') }); };

  /* ============ A. auth 原型 · member 视角 ============ */
  const p = await newPage();
  await p.goto(AUTH + '#/portfolios');
  await p.waitForTimeout(180);

  const h1 = await hash(p);
  ok('A-02 未登录深链 → /login?next=%2Fportfolios', h1 === '#/login?next=%2Fportfolios', h1);
  ok('A-02 next 计数 = 1（无自我嵌套）', (h1.match(/next=/g) || []).length === 1, h1);
  await shot(p, '01-auth-login');

  // 回车提交（A-11），且回跳 next（A-02）
  await p.fill('#lgUser', 'member');
  await p.fill('#lgPwd', 'member');
  await p.press('#lgPwd', 'Enter');
  await p.waitForTimeout(220);
  ok('A-11 回车提交生效 + A-02 回跳 next', (await hash(p)) === '#/portfolios', await hash(p));

  const side = await p.evaluate(() => ({
    nav: [...document.querySelectorAll('.s-nav .s-item')].map(e => e.textContent.trim()),
    sUser: document.querySelectorAll('.s-user').length,
    sExit: document.querySelectorAll('.s-exit').length,
    bottom: (document.querySelector('.s-bottom') || {}).textContent || '',
  }));
  ok('A-01 侧栏顶级导航项 = 5', side.nav.length === 5, side.nav.join('|'));
  ok('A-01 导航文本集合正确', side.nav.join(',') === 'Dashboard,组合管理,今日行情,提醒规则,日志', side.nav.join(','));
  ok('A-07 无 .s-user / .s-exit', side.sUser === 0 && side.sExit === 0, `${side.sUser}/${side.sExit}`);
  ok('A-07 侧栏底部不含「账户/退出」', !/账户|退出/.test(side.bottom), side.bottom.trim());

  // 下拉
  await p.click('#umTrigger'); await p.waitForTimeout(90);
  const dd1 = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#umPanel .um-acts .um-row')];
    const idRow = document.querySelector('#umPanel .um-id');
    return {
      visible: getComputedStyle(document.querySelector('#umPanel')).display !== 'none',
      expanded: document.querySelector('#umTrigger').getAttribute('aria-expanded'),
      acts: rows.map(r => r.textContent.trim()),
      idTag: idRow ? idRow.tagName : null,
      idText: idRow ? idRow.textContent.trim() : '',
    };
  });
  ok('A-15 面板可见 + aria-expanded=true', dd1.visible && dd1.expanded === 'true', JSON.stringify(dd1).slice(0, 80));
  ok('A-15 动作项恰 2 个且顺序为「账户设置 / 退出登录」',
    dd1.acts.length === 2 && dd1.acts[0] === '账户设置' && dd1.acts[1] === '退出登录', dd1.acts.join('|'));
  ok('A-15 身份行是 DIV（不可点）', dd1.idTag === 'DIV', dd1.idTag);
  ok('A-15 身份行含用户名与角色', /member/.test(dd1.idText) && /成员/.test(dd1.idText), dd1.idText);
  await shot(p, '02-auth-dropdown-member');
  await p.keyboard.press('Escape'); await p.waitForTimeout(70);
  const dd2 = await p.evaluate(() => ({
    shown: document.querySelector('#umPanel').classList.contains('show'),
    exp: document.querySelector('#umTrigger').getAttribute('aria-expanded'),
    focus: document.activeElement && document.activeElement.id,
  }));
  ok('A-15 Esc 关闭 + aria-expanded=false', !dd2.shown && dd2.exp === 'false', JSON.stringify(dd2));
  ok('A-15 关闭后焦点回触发器', dd2.focus === 'umTrigger', dd2.focus);

  // 点「账户设置」
  await p.click('#umTrigger'); await p.waitForTimeout(70);
  await p.click('#umPanel .um-acts .um-row:nth-child(1)');
  await p.waitForTimeout(180);
  ok('D12 「账户设置」→ #/account', (await hash(p)) === '#/account', await hash(p));
  const dup = await p.evaluate(() => ({
    tb: document.querySelector('.tb-title').textContent.trim(),
    ph: document.querySelector('.ph-title').textContent.trim(),
  }));
  ok('【视觉】顶栏标题与页内标题不重复', dup.tb !== dup.ph, `${dup.tb} / ${dup.ph}`);
  const onCount = await p.evaluate(() => document.querySelectorAll('.s-nav .s-item.on').length);
  ok('A-01 /account 时侧栏无高亮项', onCount === 0, onCount);
  await shot(p, '03-auth-account-member');

  // member Tab 数
  const mtabs = await p.evaluate(() => [...document.querySelectorAll('.ptab')].map(e => e.textContent.trim()));
  ok('A-01 member 页内 Tab 只有 1 项', mtabs.length === 1 && mtabs[0] === '我的账户', mtabs.join('|'));
  await p.evaluate(() => { location.hash = '#/account/users'; }); await p.waitForTimeout(160);
  ok('U3-R5 member 直访系统设置 → 403', /无权访问/.test(await p.evaluate(() => document.querySelector('#content').textContent)), '');

  // 登出 + 回退键
  await p.evaluate(() => { location.hash = '#/account'; }); await p.waitForTimeout(120);
  await p.click('#umTrigger'); await p.waitForTimeout(70);
  await p.click('#umPanel .um-acts .um-row.danger');
  await p.waitForTimeout(220);
  ok('D11 登出 → #/login', (await hash(p)).startsWith('#/login'), await hash(p));
  await p.goBack(); await p.waitForTimeout(260);
  ok('U2 AC 回退键无法回到已登录页', (await hash(p)).startsWith('#/login'), await hash(p));

  // 登录错误文案（含负向对照：停用账号刻意区分）
  const errOf = async (u, pw) => {
    await p.evaluate(() => { location.hash = '#/login'; }); await p.waitForTimeout(120);
    await login(p, u, pw);
    return (await txt(p, '.login-body .ferr')).trim();
  };
  const e1 = await errOf('nobody', 'x');
  const e2 = await errOf('member', 'wrongpw');
  const e3 = await errOf('guest', 'guest1234');
  ok('D8 不存在与密码错同文案', e1 === '用户名或密码错误' && e1 === e2, `${e1} | ${e2}`);
  ok('D8 停用账号刻意区分', e3 === '该账号已停用，请联系管理员', e3);

  // 负向对照：next 必须是站内路径 —— 协议相对地址 //host 不得通过（§10.2 N-2）
  // 直接调页面里的 safeNext（确定性，不依赖登录凭据）
  const nextCases = await p.evaluate(() => ({
    protoRel: safeNext('//evil.example.com'),
    backslash: safeNext('/\\evil.example.com'),
    absolute: safeNext('https://evil.example.com'),
    nested: safeNext('/a?next=/b'),
    normal: safeNext('/portfolios'),
  }));
  ok('N-2 safeNext 拒绝 //host（协议相对）', nextCases.protoRel === null, JSON.stringify(nextCases.protoRel));
  ok('N-2 safeNext 拒绝 /\\host', nextCases.backslash === null, JSON.stringify(nextCases.backslash));
  ok('N-2 safeNext 拒绝绝对地址', nextCases.absolute === null, JSON.stringify(nextCases.absolute));
  ok('N-2 safeNext 放行正常站内路径', nextCases.normal === '/portfolios', JSON.stringify(nextCases.normal));

  /* ============ B. auth 原型 · admin 视角（强制改密 → 系统设置 → Tab 后退） ============ */
  const pa = await newPage();
  await pa.goto(AUTH + '#/login'); await pa.waitForTimeout(160);
  await login(pa, 'admin', 'admin'); await pa.waitForTimeout(200);
  ok('D10 首登强制改密 → /account', (await hash(pa)) === '#/account', await hash(pa));
  await shot(pa, '04-auth-forced');
  await pa.evaluate(() => { location.hash = '#/portfolios'; }); await pa.waitForTimeout(170);
  const forced = await pa.evaluate(() => ({
    body: document.querySelector('#content').textContent,
    tabDisabled: !!document.querySelector('.ptab.disabled'),
  }));
  ok('§4.2 强制改密拦业务路由', /需要修改密码/.test(forced.body), forced.body.slice(0, 40));
  await pa.evaluate(() => { location.hash = '#/account'; }); await pa.waitForTimeout(170);
  const forcedTab = await pa.evaluate(() => {
    const d = document.querySelector('.ptab.disabled');
    return { has: !!d, label: d ? d.textContent.trim() : '', href: d ? d.getAttribute('href') : null };
  });
  ok('§4.2 强制态下「系统设置」Tab 禁用且不可点',
    forcedTab.has && forcedTab.label === '系统设置' && !forcedTab.href, JSON.stringify(forcedTab));
  await pa.click('#umTrigger'); await pa.waitForTimeout(90);
  ok('A-15 强制改密态下下拉可展开', await pa.evaluate(() => document.querySelector('#umPanel').classList.contains('show')), '');
  await pa.keyboard.press('Escape');

  // A-10：73 字符必须显式拒绝
  await pa.evaluate(() => { location.hash = '#/account'; }); await pa.waitForTimeout(160);
  await pa.fill('#pwNew', 'a'.repeat(73));
  await pa.fill('#pwNew2', 'a'.repeat(73));
  await pa.click('button:has-text("设定新密码并进入")');
  await pa.waitForTimeout(150);
  const over = await pa.evaluate(() => (document.querySelector('.ferr') || {}).textContent || '');
  ok('A-10 73 字符被拒且提示 8–72', /8–72/.test(over), over);

  // 正常改密 → 落 Dashboard
  await pa.fill('#pwNew', 'newpass123');
  await pa.fill('#pwNew2', 'newpass123');
  await pa.click('button:has-text("设定新密码并进入")');
  await pa.waitForTimeout(260);
  ok('D10 改密完成 → 落 Dashboard', (await hash(pa)) === '#/', await hash(pa));

  // Tab 由 URL 驱动：用后退键验证（内存态实现会失败）
  await pa.evaluate(() => { location.hash = '#/account'; }); await pa.waitForTimeout(160);
  await pa.click('a.ptab[href="#/account/users"]'); await pa.waitForTimeout(200);
  ok('A-01 进 /account/users', (await hash(pa)) === '#/account/users', await hash(pa));
  const usersTabOn = await pa.evaluate(() => (document.querySelector('.ptab.on') || {}).textContent || '');
  ok('A-01 系统设置 Tab 高亮', usersTabOn.trim() === '系统设置', usersTabOn);
  await shot(pa, '05-auth-users');
  await pa.goBack(); await pa.waitForTimeout(240);
  const back = await pa.evaluate(() => ({ h: location.hash, on: (document.querySelector('.ptab.on') || {}).textContent || '' }));
  ok('A-01 后退键 → /account 且 Tab 跟随 URL', back.h === '#/account' && back.on.trim() === '我的账户', JSON.stringify(back));

  // A-05 / D9：自己那一行不给「重置密码」
  await pa.evaluate(() => { location.hash = '#/account/users'; }); await pa.waitForTimeout(200);
  const selfRow = await pa.evaluate(() => {
    const tr = document.querySelector('tr[data-self="1"]') || [...document.querySelectorAll('tbody tr')].find(t => /你/.test(t.textContent));
    return tr ? tr.textContent.replace(/\s+/g, ' ') : null;
  });
  ok('A-05 self 行有「改密码」无「重置密码」',
    !!selfRow && /改密码/.test(selfRow) && !/重置密码/.test(selfRow), selfRow);

  // 视觉：表格换行/按钮挤压（064 的 .toolbar 修复后才正常）
  const tbToolbar = await pa.evaluate(() => {
    const t = document.querySelector('.toolbar'), w = document.querySelector('.tbl-wrap');
    if (!t || !w) return null;
    return { gap: Math.round(w.getBoundingClientRect().top - t.getBoundingClientRect().bottom), btnW: Math.round(t.querySelector('button').getBoundingClientRect().width) };
  });
  ok('A-08 工具条与表格间距 ≥ 12px', tbToolbar && tbToolbar.gap >= 12, JSON.stringify(tbToolbar));

  // A-13 骨架可达性（静态：state.loading 是否会被置 true）
  const src = fs.readFileSync(path.resolve(__dirname, 'portomind-auth-prototype.html'), 'utf8');
  ok('A-13 加载骨架可达（state.loading 被置 true）', (src.match(/state\.loading\s*=\s*true/g) || []).length > 0,
    `置 true 次数 = ${(src.match(/state\.loading\s*=\s*true/g) || []).length}`);

  // A-14 演示注记是否漏标（可见正文出现规范编号却不带 data-demo）
  await pa.evaluate(() => { location.hash = '#/login'; });
  await pa.evaluate(() => { state.session = null; render(); });
  await pa.waitForTimeout(180);
  const leak = await pa.evaluate(() => [...document.querySelectorAll('.login-body .fhint, .login-body .demo-note, .login-body form')]
    .filter(n => /§/.test(n.textContent) && !n.closest('[data-demo]')).length);
  ok('A-14 可见正文无未标记的规范注记', leak === 0, `未标记节点数 = ${leak}`);

  /* ============ C. 主原型用户区 ============ */
  const q = await newPage();
  await q.goto(MAIN + '#/'); await q.waitForTimeout(240);
  // 主原型默认给一个演示登录态（源码注释已说明，为让 TASK-059 走查不被登录页挡住）
  await q.click('#umTrigger'); await q.waitForTimeout(90);
  await q.click('#umPanel .um-acts .um-row.danger'); await q.waitForTimeout(240);
  ok('M-04 主原型登出 → #/login', (await hash(q)).startsWith('#/login'), await hash(q));
  await q.evaluate(() => { location.hash = '#/portfolios'; }); await q.waitForTimeout(240);
  const qh = await hash(q);
  ok('M-04 主原型未登录深链 → 登录（next 仅 1 次）',
    qh.startsWith('#/login') && (qh.match(/next=/g) || []).length === 1, qh);
  ok('M-04 主原型深链 next = /portfolios', qh === '#/login?next=%2Fportfolios', qh);
  // 主原型登录页自带演示预填（与 auth 原型的 admin/admin 不同，属两个原型的演示数据差异）
  await q.click('button[type=submit]'); await q.waitForTimeout(300);
  ok('M-04 主原型登录后回跳 next', (await hash(q)) === '#/portfolios', await hash(q));
  await q.evaluate(() => { location.hash = '#/account'; }); await q.waitForTimeout(220);
  const qs = await q.evaluate(() => ({
    navCount: document.querySelectorAll('.s-nav > .s-item').length,
    onCount: document.querySelectorAll('[data-nav].on').length,
    sUser: document.querySelectorAll('.s-user').length,
    sExit: document.querySelectorAll('.s-exit').length,
    bottom: (document.querySelector('.s-bottom') || {}).textContent || '',
    hasIdentity: /身份/.test(document.querySelector('#view').textContent),
    tb: (document.querySelector('.tb-title') || {}).textContent.trim(),
    ph: (document.querySelector('.ph-title') || {}).textContent.trim(),
  }));
  ok('M-01 主原型侧栏 5 项且无 .s-user', qs.navCount === 5 && qs.sUser === 0, `${qs.navCount}/${qs.sUser}`);
  ok('M-02 主原型无 .s-exit、底部无账户入口', qs.sExit === 0 && !/账户|退出/.test(qs.bottom), qs.bottom.trim());
  ok('M-04 主原型 #/account 真实渲染（身份卡）', qs.hasIdentity, qs.hasIdentity);
  ok('M-01 主原型 /account 时侧栏无高亮项', qs.onCount === 0, qs.onCount);
  ok('【视觉】主原型顶栏与页内标题不重复', qs.tb !== qs.ph, `${qs.tb} / ${qs.ph}`);
  await shot(q, '06-main-account');
  await q.click('#umTrigger'); await q.waitForTimeout(110);
  const qdd = await q.evaluate(() => [...document.querySelectorAll('#umPanel .um-row')].map(e => e.textContent.trim()));
  ok('M-03 主原型下拉两项且顺序正确', qdd.length === 2 && qdd[0] === '账户设置' && qdd[1] === '退出登录', qdd.join('|'));
  await shot(q, '07-main-dropdown');

  /* ============ D. 全路由扫一遍 JS 错误 ============ */
  for (const h of ['#/', '#/portfolios', '#/prices', '#/alerts/rules', '#/logs', '#/account', '#/account/users']) {
    await q.evaluate(x => { location.hash = x; }, h);
    await q.waitForTimeout(140);
  }
  ok('C 两个原型均无 JS 运行时错误', errs.length === 0, errs.slice(0, 3).join(' ;; '));

  await browser.close();
  const fail = R.filter(r => !r.pass).length;
  console.log(`\n=== TASK-060 独立验收：${R.length} 条 · PASS ${R.length - fail} · FAIL ${fail} ===`);
  console.log('截图目录：', OUT);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('RUNNER ERROR:', e.message); process.exit(2); });
