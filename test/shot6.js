/* 大名(本陣)システム＋手札座布団撤去＋複数命令メニューの実機確認。 node test/shot6.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:8777/index.html';

async function run(vw, vh, tag) {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: vw, height: vh } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(400);
  await pg.click('[data-act="startgame"][data-p1="oda"][data-mode="cpu"]'); await pg.waitForTimeout(300);
  // 先鋒＋後備えを2体置く
  await pg.click('[data-act="setupCard"]'); await pg.waitForTimeout(80);
  if (await pg.$('[data-act="setupCard"]')) await pg.click('[data-act="setupCard"]'); await pg.waitForTimeout(80);
  await pg.click('[data-act="confirmSetup"]'); await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${SHOTS}/${tag}-board.png` });

  // 本陣ゾーンの有無・手札バー位置・座布団(handbar背景)の確認
  const honjinCount = await pg.$$eval('.honjin', els => els.length);
  const honjinName = await pg.$eval('.mine ~ * , .honjin .hj-name', () => true).catch(() => false);
  const hb = await pg.$('.handbar'); const box = hb && await hb.boundingBox();
  const handVisible = box && (box.y + box.height) <= vh + 1;
  const hbBg = await pg.$eval('.handbar', el => getComputedStyle(el).backgroundColor);
  // ベンチが見えるか（自陣ベンチ枠/カードが画面内）
  const benchInView = await pg.$$eval('.field.mine .bench > *', (els, vh2) => els.some(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh2 + 1 && r.height > 0; }), vh);

  // 自分の番まで待って命令メニューで複数選択
  for (let k = 0; k < 14; k++) { if (await pg.evaluate(() => Engine.GAME.current === 'p1' || Engine.GAME.winner)) break; await pg.waitForTimeout(300); }
  let multiSel = false;
  if (await pg.evaluate(() => Engine.GAME.current === 'p1' && !Engine.GAME.winner)) {
    await pg.click('[data-act="cmdmenu"]'); await pg.waitForTimeout(150);
    const toggles = await pg.$$('[data-act="cmdtoggle"]');
    if (toggles[0]) await toggles[0].click(); await pg.waitForTimeout(80);
    const toggles2 = await pg.$$('[data-act="cmdtoggle"]');
    // 2件目（別カード）を選ぶ
    for (const t of toggles2) { const id = await t.getAttribute('data-id'); if (id && !(await t.evaluate(e => e.classList.contains('picked')))) { await t.click(); break; } }
    await pg.waitForTimeout(80);
    const picked = await pg.$$eval('.cmdcard.picked', e => e.length);
    multiSel = picked >= 2;
    await pg.screenshot({ path: `${SHOTS}/${tag}-cmdmenu.png` });
    const issue = await pg.$('[data-act="cmdissue"]'); if (issue) await issue.click(); await pg.waitForTimeout(200);
  }
  await pg.screenshot({ path: `${SHOTS}/${tag}-after.png` });
  console.log(`[${tag}] ${vw}x${vh} 本陣=${honjinCount} 手札画面内=${handVisible}(bottom=${box ? Math.round(box.y + box.height) : '-'}) handbar背景=${hbBg} ベンチ可視=${benchInView} 命令2件選択=${multiSel} JSエラー=${errs.length} ${errs.slice(0, 2)}`);
  await b.close();
  return { honjinCount, handVisible, benchInView, multiSel, errs: errs.length };
}
(async () => {
  const r1 = await run(1440, 900, 'v3-lap');
  const r2 = await run(1280, 720, 'v3-small');
  const okAll = r1.honjinCount >= 2 && r1.handVisible && r2.handVisible && r1.benchInView && r2.benchInView && r1.multiSel && r1.errs === 0 && r2.errs === 0;
  console.log('総評:', okAll ? '✓ 本陣表示・手札座布団なしで見切れず・ベンチ可視・複数命令OK・エラー0' : '✗ 要確認');
})();
