/* 新スタート画面（5家選択）と新デッキ（上杉vs徳川）の実機確認。 node test/shot8.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = 'C:/Users/taich/AppData/Local/Temp/claude/c--Users-taich-SingularitySociety/cf481873-0584-4bae-bdbc-4d4a1e6dfd6d/scratchpad/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:8777/index.html';
const tryClick = async (pg, sel) => { try { const el = await pg.$(sel); if (el) { await el.click({ timeout: 800 }); return true; } } catch (e) {} return false; };

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(400);
  const deckBtns = await pg.$$eval('.deckpick', e => e.length); // 5家×2列=10
  await pg.screenshot({ path: `${SHOTS}/v5-start.png` });

  // 上杉 vs 徳川 を選んで開戦
  await tryClick(pg, '[data-act="setp1"][data-deck="uesugi"]'); await pg.waitForTimeout(120);
  await tryClick(pg, '[data-act="setp2"][data-deck="tokugawa"]'); await pg.waitForTimeout(120);
  await pg.screenshot({ path: `${SHOTS}/v5-start-picked.png` });
  await tryClick(pg, '[data-act="startgame"][data-mode="cpu"]'); await pg.waitForTimeout(300);
  await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
  await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
  await tryClick(pg, '[data-act="confirmSetup"]'); await pg.waitForTimeout(450);

  const decks = await pg.evaluate(() => ({ p1: Engine.GAME.players.p1.name, p2: Engine.GAME.players.p2.name, d1: Engine.GAME.players.p1.honjin && Engine.GAME.players.p1.honjin.card.name, d2: Engine.GAME.players.p2.honjin && Engine.GAME.players.p2.honjin.card.name }));

  // 数手番ざっくり進める（クラッシュ確認）
  for (let t = 0; t < 18 && !(await pg.evaluate(() => !!Engine.GAME.winner)); t++) {
    if (await pg.evaluate(() => Engine.GAME.pendingPromote === 'p1')) { await tryClick(pg, '[data-act="promote"]'); await pg.waitForTimeout(120); continue; }
    const st = await pg.evaluate(() => ({ mine: Engine.GAME.current === 'p1' && !Engine.GAME.pendingPromote, ov: document.getElementById('overlay') && document.getElementById('overlay').style.display === 'flex', a: Engine.GAME.players.p1.active ? Engine.GAME.players.p1.active.uid : null }));
    if (st.mine && !st.ov) {
      if (st.a) { await tryClick(pg, '[data-act="energy"]'); await tryClick(pg, `.mine [data-act="warlord"][data-uid="${st.a}"]`); await pg.waitForTimeout(50); }
      await tryClick(pg, '[data-act="attack"]'); await pg.waitForTimeout(70); await tryClick(pg, '.move-pick'); await pg.waitForTimeout(100);
      if (await pg.evaluate(() => Engine.GAME.current === 'p1' && !Engine.GAME.winner && !Engine.GAME.pendingPromote)) await tryClick(pg, '[data-act="endturn"]');
    }
    await pg.waitForTimeout(300);
  }
  await pg.screenshot({ path: `${SHOTS}/v5-uesugi-tokugawa.png` });
  const sfxBtn = await pg.$('[data-act="sfxtoggle"]') ? true : false;
  console.log(`デッキ選択ボタン=${deckBtns}（期待10） 対戦=${decks.p1}(${decks.d1}) vs ${decks.p2}(${decks.d2}) 音トグル=${sfxBtn} JSエラー=${errs.length} ${errs.slice(0,3)}`);
  await b.close();
})();
