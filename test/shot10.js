/* ベンチが常に見える＆ボタンでガタつかない＆スクロール無しを厳密確認。 node test/shot10.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
const URL = 'http://localhost:8777/index.html';
const tryClick = async (pg, sel) => { try { const el = await pg.$(sel); if (el) { await el.click({ timeout: 800 }); return true; } } catch (e) {} return false; };

async function run(vw, vh, tag) {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: vw, height: vh } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(300);
  await tryClick(pg, '[data-act="startgame"][data-mode="cpu"]'); await pg.waitForTimeout(200);
  await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
  await tryClick(pg, '[data-act="setupCard"]'); await pg.waitForTimeout(60);
  await tryClick(pg, '[data-act="confirmSetup"]'); await pg.waitForTimeout(450);
  for (let k = 0; k < 14; k++) { if (await pg.evaluate(() => Engine.GAME.current === 'p1' || Engine.GAME.winner)) break; await pg.waitForTimeout(250); }
  await pg.screenshot({ path: `${SHOTS}/${tag}-board.png` });

  // スクロール無し＆全要素が playarea 内に収まるか
  const fit = await pg.evaluate(() => {
    const pa = document.querySelector('.playarea'); const r = pa.getBoundingClientRect();
    const noScroll = pa.scrollHeight <= pa.clientHeight + 2;
    const items = [...document.querySelectorAll('.field .card.warlord, .field .honjin, .field .slot, .field .bench')];
    let off = 0; items.forEach(e => { const b2 = e.getBoundingClientRect(); if (b2.height > 0 && (b2.bottom > r.bottom + 2 || b2.top < r.top - 2)) off++; });
    const myBench = document.querySelector('.field.mine .bench'); const eb = document.querySelector('.field.enemy .bench');
    const benchOK = myBench && eb && myBench.getBoundingClientRect().bottom <= r.bottom + 2 && eb.getBoundingClientRect().top >= r.top - 2;
    return { noScroll, off, benchOK };
  });

  // ガタつき：兵糧を送る→もう一度（トグル）押して、ベンチのY座標が動かないか
  const benchY = () => pg.evaluate(() => { const e = document.querySelector('.field.mine .bench'); return e ? Math.round(e.getBoundingClientRect().top) : -1; });
  const before = await benchY();
  await tryClick(pg, '[data-act="energy"]'); await pg.waitForTimeout(120); const mid = await benchY();
  await tryClick(pg, '[data-act="energy"]'); await pg.waitForTimeout(120); const after = await benchY();
  const jitter = Math.max(Math.abs(mid - before), Math.abs(after - before));

  console.log(`[${tag}] ${vw}x${vh} スクロール無=${fit.noScroll} はみ出し=${fit.off} ベンチ収まり=${fit.benchOK} ガタつき=${jitter}px(${before}->${mid}->${after}) JSエラー=${errs.length} ${errs.slice(0,2)}`);
  await b.close();
  return { fit, jitter, errs: errs.length };
}
(async () => {
  const r1 = await run(1440, 900, 'v7-lap');
  const r2 = await run(1280, 720, 'v7-720');
  const r3 = await run(1280, 660, 'v7-660');
  const ok = [r1, r2, r3].every(r => r.fit.noScroll && r.fit.off === 0 && r.fit.benchOK && r.jitter <= 1 && r.errs === 0);
  console.log('総評:', ok ? '✓ ベンチ常時可視・スクロール無し・ガタつき無し・エラー0' : '△ 上の数値を確認');
})();
