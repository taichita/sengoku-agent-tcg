/* レア演出（✦・金の光沢）と配札フリップの目視確認。 node test/shot9.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
const URL = 'http://localhost:8777/index.html';
const tryClick = async (pg, sel) => { try { const el = await pg.$(sel); if (el) { await el.click({ timeout: 800 }); return true; } } catch (e) {} return false; };
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(300);
  await tryClick(pg, '[data-act="startgame"][data-mode="cpu"]'); await pg.waitForTimeout(150);
  await pg.screenshot({ path: `${SHOTS}/v6-deal.png` }); // 配札フリップ中〜直後
  await pg.waitForTimeout(400);
  await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
  await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
  await tryClick(pg, '[data-act="confirmSetup"]'); await pg.waitForTimeout(450);
  for (let k = 0; k < 14; k++) { if (await pg.evaluate(() => Engine.GAME.current === 'p1' || Engine.GAME.winner)) break; await pg.waitForTimeout(250); }
  // 侍大将を手札に引き込んでレア演出を見せる
  const got = await pg.evaluate(() => { const p = Engine.GAME.players.p1; const i = p.deck.findIndex(c => c.card.type === 'warlord' && c.card.stage === 1); if (i >= 0) { p.hand.push(p.deck.splice(i, 1)[0]); if (Engine.onChange) Engine.onChange(); return p.hand[p.hand.length - 1].card.name; } return null; });
  await pg.waitForTimeout(300);
  const rareCount = await pg.$$eval('.handcard.rare, .handcard.rare2', e => e.length);
  const markCount = await pg.$$eval('.rare-mark', e => e.length);
  await pg.screenshot({ path: `${SHOTS}/v6-rarehand.png` });
  console.log(`配札フリップ撮影OK／手札に引いた侍大将=${got} レア手札=${rareCount} ✦印=${markCount} JSエラー=${errs.length} ${errs.slice(0,2)}`);
  await b.close();
})();
