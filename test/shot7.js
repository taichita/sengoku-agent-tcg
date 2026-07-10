/* 供給上限・ダメージ数字・命令効果表示・見切れ無しの実機確認。 node test/shot7.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:8777/index.html';
const tryClick = async (pg, sel) => { try { const el = await pg.$(sel); if (el) { await el.click({ timeout: 800 }); return true; } } catch (e) {} return false; };

async function run(vw, vh, tag) {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: vw, height: vh } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  let effLabels = 0, sawDmg = false, clip = { bad: -1, total: 0 };
  try {
    await pg.goto(URL); await pg.waitForTimeout(400);
    await tryClick(pg, '[data-act="startgame"][data-p1="oda"][data-mode="cpu"]'); await pg.waitForTimeout(250);
    await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
    await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
    await tryClick(pg, '[data-act="confirmSetup"]'); await pg.waitForTimeout(450);
    for (let k = 0; k < 16; k++) { if (await pg.evaluate(() => Engine.GAME.current === 'p1' || Engine.GAME.winner)) break; await pg.waitForTimeout(250); }

    // 命令メニュー：効果ラベル
    if (await pg.evaluate(() => Engine.GAME.current === 'p1' && !Engine.GAME.winner)) {
      await tryClick(pg, '[data-act="cmdmenu"]'); await pg.waitForTimeout(120);
      effLabels = await pg.$$eval('.cc-eff', e => e.length).catch(() => 0);
      await pg.screenshot({ path: `${SHOTS}/${tag}-cmdmenu.png` });
      await tryClick(pg, '.cmdmenu [data-act="closeoverlay"]'); await pg.waitForTimeout(120);
    }

    // 数手番、自動でざっくり進める（オーバーレイが無い時だけ操作）
    for (let t = 0; t < 26 && !(await pg.evaluate(() => !!Engine.GAME.winner)); t++) {
      const st = await pg.evaluate(() => ({
        cur: Engine.GAME.current, pend: Engine.GAME.pendingPromote,
        ov: (document.getElementById('overlay') || {}).style && document.getElementById('overlay').style.display === 'flex',
        active: Engine.GAME.players.p1.active ? Engine.GAME.players.p1.active.uid : null,
      }));
      if (st.pend === 'p1') { await tryClick(pg, '[data-act="promote"]'); await pg.waitForTimeout(150); continue; }
      if (st.cur === 'p1' && !st.ov) {
        if (st.active) { await tryClick(pg, '[data-act="energy"]'); await tryClick(pg, `.mine [data-act="warlord"][data-uid="${st.active}"]`); await pg.waitForTimeout(50); }
        await tryClick(pg, '[data-act="attack"]'); await pg.waitForTimeout(70);
        await tryClick(pg, '.move-pick'); await pg.waitForTimeout(120);
        if (await pg.$('.fx-dmg')) sawDmg = true;
        const ended = await pg.evaluate(() => Engine.GAME.current !== 'p1' || Engine.GAME.winner);
        if (!ended) await tryClick(pg, '[data-act="endturn"]');
      }
      await pg.waitForTimeout(320);
    }
    await pg.screenshot({ path: `${SHOTS}/${tag}-mid.png` });
    clip = await pg.evaluate(() => {
      const pa = document.querySelector('.playarea'); if (!pa) return { bad: -1, total: 0 };
      const board = pa.getBoundingClientRect();
      const items = [...document.querySelectorAll('.field .card.warlord, .field .honjin, .field .slot')];
      let bad = 0; items.forEach(e => { const r = e.getBoundingClientRect(); if (r.height > 0 && (r.bottom > board.bottom + 2 || r.top < board.top - 2)) bad++; });
      return { bad, total: items.length };
    });
  } catch (e) { console.log(`[${tag}] 例外: ${e.message.split('\n')[0]}`); }
  console.log(`[${tag}] ${vw}x${vh} 命令効果ラベル=${effLabels} ダメージ数字=${sawDmg} 見切れ要素=${clip.bad}/${clip.total} JSエラー=${errs.length} ${errs.slice(0, 2)}`);
  await b.close();
  return { effLabels, sawDmg, clip, errs: errs.length };
}
(async () => {
  const r1 = await run(1440, 900, 'v4-lap');
  const r2 = await run(1280, 720, 'v4-small');
  const ok = r1.effLabels >= 10 && r1.sawDmg && r1.clip.bad === 0 && r2.clip.bad === 0 && r1.errs === 0 && r2.errs === 0;
  console.log('総評:', ok ? '✓ 効果表示・ダメージ数字・見切れ無し・エラー0' : '△ 上の数値を確認');
})();
