/* 観戦(AI対AI)とホットシートをPlaywrightで実走し、両者の挙動をスクショ＋戦記で確認。
   事前に http://localhost:8777 で配信しておく。 node test/shot2.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:8777/index.html';

(async () => {
  const b = await chromium.launch();

  // ===== 観戦（AI対AI）=====
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${SHOTS}/spec-0-start.png` });
  await pg.click('[data-act="startgame"][data-mode="spectate"]');
  let final = null;
  for (let i = 1; i <= 8; i++) {
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: `${SHOTS}/spec-${i}.png` });
    const st = await pg.evaluate(() => ({ turn: Engine.GAME.turn, winner: Engine.GAME.winner }));
    if (st.winner) { final = st; break; }
  }
  const log = await pg.evaluate(() => Engine.GAME.log.slice().reverse().map(l => `[T${l.t}] ${l.msg}`));
  fs.writeFileSync(`${SHOTS}/spectate-log.txt`, log.join('\n'), 'utf-8');
  const fin = await pg.evaluate(() => ({ turn: Engine.GAME.turn, winner: Engine.GAME.winner, p1: Engine.GAME.players.p1.kubi, p2: Engine.GAME.players.p2.kubi }));
  await pg.screenshot({ path: `${SHOTS}/spec-final.png` });
  console.log('観戦: 最終', fin, ' JSエラー', errs.length, errs.slice(0, 3));
  console.log('観戦: 戦記行数', log.length);

  // ===== ホットシート（1人二役）=====
  const pg2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const e2 = []; pg2.on('pageerror', e => e2.push(e.message));
  await pg2.goto(URL); await pg2.waitForTimeout(400);
  await pg2.click('[data-act="setmode"][data-mode="hotseat"]'); await pg2.waitForTimeout(200);
  await pg2.screenshot({ path: `${SHOTS}/hot-0-start.png` });
  await pg2.click('[data-act="startgame"][data-p1="oda"][data-mode="hotseat"]'); await pg2.waitForTimeout(350);
  await pg2.screenshot({ path: `${SHOTS}/hot-1-setup-p1.png` });
  const s1 = await pg2.evaluate(() => Engine.setupCurrent());
  await pg2.click('[data-act="setupCard"]'); await pg2.waitForTimeout(120);
  await pg2.click('[data-act="confirmSetup"]'); await pg2.waitForTimeout(350);
  await pg2.screenshot({ path: `${SHOTS}/hot-2-setup-p2.png` });
  const s2 = await pg2.evaluate(() => Engine.setupCurrent());
  if (await pg2.$('[data-act="setupCard"]')) await pg2.click('[data-act="setupCard"]');
  await pg2.waitForTimeout(120);
  await pg2.click('[data-act="confirmSetup"]'); await pg2.waitForTimeout(400);
  await pg2.screenshot({ path: `${SHOTS}/hot-3-board.png` });
  const hot = await pg2.evaluate(() => ({ phase: Engine.GAME.phase, cur: Engine.GAME.current }));
  console.log('ホットシート: p1布陣→', s1, ' p2布陣→', s2, ' 開戦後', hot, ' JSエラー', e2.length, e2.slice(0, 3));

  await b.close();
  console.log('スクショ:', SHOTS);
})();
