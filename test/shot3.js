/* 対CPU戦をPlaywrightで人力プレイ：攻撃・バフ表示・敵=軍師なし・カード詳細を確認。
   node test/shot3.js （http://localhost:8777 で配信中に） */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:8777/index.html';

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const cur = () => pg.evaluate(() => ({ cur: Engine.GAME.current, turn: Engine.GAME.turn, winner: Engine.GAME.winner }));

  await pg.goto(URL); await pg.waitForTimeout(400);
  await pg.click('[data-act="startgame"][data-p1="oda"][data-mode="cpu"]'); await pg.waitForTimeout(300);
  // 布陣：たねを先鋒へ→開戦
  await pg.click('[data-act="setupCard"]'); await pg.waitForTimeout(120);
  await pg.click('[data-act="confirmSetup"]'); await pg.waitForTimeout(500);

  // 1手番目：軍師の命令 /code-review を発注（バフ確認用）
  let st = await cur();
  if (st.cur === 'p1') {
    await pg.click('[data-act="cmdmenu"]'); await pg.waitForTimeout(200);
    if (await pg.$('[data-act="issue"][data-id="code-review"]')) await pg.click('[data-act="issue"][data-id="code-review"]');
    await pg.waitForTimeout(150);
    await pg.screenshot({ path: `${SHOTS}/cpu-1-issued.png` });
  }
  // 数手番：兵配備→攻撃→終了
  let attacked = false;
  for (let t = 0; t < 6; t++) {
    st = await cur(); if (st.winner) break;
    if (st.cur !== 'p1') { await pg.waitForTimeout(700); continue; }
    const uid = await pg.evaluate(() => Engine.GAME.players.p1.active && Engine.GAME.players.p1.active.uid);
    if (uid) { await pg.click('[data-act="energy"]'); const w = await pg.$(`.mine [data-act="warlord"][data-uid="${uid}"]`); if (w) await w.click(); }
    const mv = await pg.$('.mine [data-act="move"].ready, .mine [data-act="move"]');
    if (mv) { await mv.click(); attacked = true; } else { await pg.click('[data-act="endturn"]'); }
    await pg.waitForTimeout(800);
  }
  await pg.screenshot({ path: `${SHOTS}/cpu-2-board.png` });

  // 検証：敵=軍師なし表示、効果チップの有無
  const noagent = await pg.evaluate(() => !!document.querySelector('.noagent'));
  const hasEff = await pg.evaluate(() => document.querySelectorAll('.eff-chip').length);
  // 自分の先鋒をクリックして詳細（効果一覧）
  const uid2 = await pg.evaluate(() => Engine.GAME.players.p1.active && Engine.GAME.players.p1.active.uid);
  if (uid2) { const w = await pg.$(`.mine [data-act="warlord"][data-uid="${uid2}"]`); if (w) { await w.click(); await pg.waitForTimeout(200); await pg.screenshot({ path: `${SHOTS}/cpu-3-detail.png` }); } }

  console.log('対CPU検証: 攻撃できた=', attacked, ' 敵=軍師なし表示=', noagent, ' 効果チップ数=', hasEff, ' JSエラー=', errs.length, errs.slice(0, 3));
  await b.close();
})();
