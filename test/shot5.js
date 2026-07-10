/* 攻撃ボタン・縦長カード・手札の見た目を確認。 node test/shot5.js（localhost:8777配信中） */
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
  await pg.click('[data-act="setupCard"]'); await pg.waitForTimeout(100);
  if (await pg.$('[data-act="setupCard"]')) await pg.click('[data-act="setupCard"]');
  await pg.waitForTimeout(100);
  await pg.click('[data-act="confirmSetup"]'); await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${SHOTS}/${tag}-board.png` });

  // 自分(p1)の番になるまで待つ（軍配で敵が先攻のことがある）
  for (let k = 0; k < 14; k++) { if (await pg.evaluate(() => Engine.GAME.current === 'p1' || Engine.GAME.winner)) break; await pg.waitForTimeout(300); }
  // 攻撃ボタン：兵を配る前に押す→足りない案内（クラッシュしない）
  let attacked = false;
  if (await pg.evaluate(() => Engine.GAME.current === 'p1' && !Engine.GAME.winner)) {
    await pg.click('[data-act="attack"]'); await pg.waitForTimeout(150); // 兵不足toast or 攻撃
    // 兵を配る→攻撃
    const uid = await pg.evaluate(() => Engine.GAME.players.p1.active.uid);
    await pg.click('[data-act="energy"]'); const w = await pg.$(`.mine [data-act="warlord"][data-uid="${uid}"]`); if (w) await w.click();
    const before = await pg.evaluate(() => Engine.GAME.players.p2.active ? Engine.GAME.players.p2.active.damage : -1);
    await pg.click('[data-act="attack"]'); await pg.waitForTimeout(200);
    // 複数ワザならチューザーが出る→最初を選ぶ
    if (await pg.$('.move-pick')) { await pg.screenshot({ path: `${SHOTS}/${tag}-chooser.png` }); await pg.click('.move-pick'); await pg.waitForTimeout(200); }
    const after = await pg.evaluate(() => Engine.GAME.players.p2.active ? Engine.GAME.players.p2.active.damage : -1);
    attacked = after > before;
  }
  await pg.screenshot({ path: `${SHOTS}/${tag}-afteratk.png` });
  // レイアウト：手札バーが画面内か
  const hb = await pg.$('.handbar'); const box = hb && await hb.boundingBox();
  const handVisible = box && (box.y + box.height) <= vh + 1 && box.y >= 0;
  console.log(`[${tag}] ${vw}x${vh}  攻撃ボタンで攻撃=`, attacked, ' 手札バー画面内=', handVisible, box ? `(bottom=${Math.round(box.y + box.height)})` : '', ' JSエラー=', errs.length, errs.slice(0, 2));
  await b.close();
  return { attacked, handVisible, errs: errs.length };
}
(async () => {
  const r1 = await run(1440, 900, 'v2-lap');
  const r2 = await run(1280, 720, 'v2-small');
  console.log('総評:', (r1.attacked && r1.handVisible && r2.handVisible && r1.errs === 0 && r2.errs === 0) ? '✓ 攻撃ボタンOK・両画面で手札見切れなし・エラー0' : '✗ 要確認');
})();
