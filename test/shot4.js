/* バフ可視化デモ：対CPRで先鋒＋後備えを置き、/memory（全軍+10）を完成させて
   効果チップが盤面とカード詳細に出るのを撮る。 node test/shot4.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:8777/index.html';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const gv = (fn) => pg.evaluate(fn);

  await pg.goto(URL); await pg.waitForTimeout(400);
  await pg.click('[data-act="startgame"][data-p1="oda"][data-mode="cpu"]'); await pg.waitForTimeout(300);
  // 布陣：先鋒＋後備えに2体
  await pg.click('[data-act="setupCard"]'); await pg.waitForTimeout(100);
  if (await pg.$('[data-act="setupCard"]')) await pg.click('[data-act="setupCard"]');
  await pg.waitForTimeout(100);
  await pg.click('[data-act="confirmSetup"]'); await pg.waitForTimeout(500);

  // /memory（全軍+10・2手番）を発注
  if (await pg.evaluate(() => Engine.GAME.current === 'p1')) {
    await pg.click('[data-act="cmdmenu"]'); await pg.waitForTimeout(200);
    if (await pg.$('[data-act="issue"][data-id="memory"]')) await pg.click('[data-act="issue"][data-id="memory"]');
    await pg.waitForTimeout(150);
  }
  // 攻撃せず数手番回す（命令を完成させる）
  for (let t = 0; t < 5; t++) {
    if (await pg.evaluate(() => Engine.GAME.winner)) break;
    if (!await pg.evaluate(() => Engine.GAME.current === 'p1')) { await pg.waitForTimeout(700); continue; }
    const done = await pg.evaluate(() => Engine.GAME.players.p1.buffs.allAtk > 0);
    if (done) break;
    await pg.click('[data-act="endturn"]'); await pg.waitForTimeout(800);
  }
  await pg.screenshot({ path: `${SHOTS}/buff-board.png` });
  const allAtk = await pg.evaluate(() => Engine.GAME.players.p1.buffs.allAtk);
  const chips = await pg.evaluate(() => [...document.querySelectorAll('.mine .eff-chip')].map(e => e.textContent));
  // カード詳細
  const uid = await pg.evaluate(() => Engine.GAME.players.p1.active && Engine.GAME.players.p1.active.uid);
  if (uid) { const w = await pg.$(`.mine [data-act="warlord"][data-uid="${uid}"]`); if (w) { await w.click(); await pg.waitForTimeout(200); await pg.screenshot({ path: `${SHOTS}/buff-detail.png` }); } }
  console.log('全軍バフ allAtk=', allAtk, ' 盤面チップ=', chips, ' winner=', await pg.evaluate(() => Engine.GAME.winner), ' JSエラー=', errs.length);
  await b.close();
})();
