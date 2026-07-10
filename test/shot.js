/* Playwrightで実ブラウザ描画を確認し、各画面をスクショ＋レイアウト検証。
   事前に http サーバを localhost:8777 で起動しておくこと。
   node test/shot.js */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = require('path').join(require('os').tmpdir(), 'sengoku-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:8777/index.html';

async function run(vw, vh, tag) {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: vw, height: vh } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await pg.goto(URL); await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${SHOTS}/${tag}-1-start.png` });

  await pg.click('[data-act="deckguide"][data-deck="oda"]'); await pg.waitForTimeout(250);
  await pg.screenshot({ path: `${SHOTS}/${tag}-2-deckguide.png` });
  await pg.click('button[data-act="closeoverlay"]'); await pg.waitForTimeout(200);

  await pg.click('[data-act="startgame"][data-p1="oda"]'); await pg.waitForTimeout(350);
  await pg.screenshot({ path: `${SHOTS}/${tag}-3-setup.png` });

  await pg.click('[data-act="setupCard"]'); await pg.waitForTimeout(150);
  if (await pg.$('[data-act="setupCard"]')) await pg.click('[data-act="setupCard"]');
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: `${SHOTS}/${tag}-4-setup-placed.png` });

  await pg.click('[data-act="confirmSetup"]'); await pg.waitForTimeout(600);
  await pg.screenshot({ path: `${SHOTS}/${tag}-5-board.png`, fullPage: false });

  // レイアウト検証：手札バー・操作ボタンが画面内に収まっているか
  const hb = await pg.$('.handbar'); const box = hb && await hb.boundingBox();
  const cm = await pg.$('[data-act="cmdmenu"]'); const cmbox = cm && await cm.boundingBox();
  const et = await pg.$('[data-act="endturn"]'); const etbox = et && await et.boundingBox();
  const handVisible = box && (box.y + box.height) <= vh + 1 && box.y >= 0;
  const cmdVisible = cmbox && (cmbox.y + cmbox.height) <= vh + 1 && cmbox.y >= 0;
  const endVisible = etbox && (etbox.y + etbox.height) <= vh + 1 && etbox.y >= 0;

  if (cm) { await pg.click('[data-act="cmdmenu"]'); await pg.waitForTimeout(250); await pg.screenshot({ path: `${SHOTS}/${tag}-6-cmdmenu.png` }); await pg.click('button[data-act="closeoverlay"]'); }

  console.log(`\n[${tag}] viewport ${vw}x${vh}`);
  console.log(`  手札バー box:`, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)} bottom=${Math.round(box.y + box.height)}` : 'なし', '→ 画面内:', handVisible);
  console.log(`  軍師命令ボタン 画面内:`, cmdVisible, cmbox ? `(y=${Math.round(cmbox.y)})` : '');
  console.log(`  番を終わるボタン 画面内:`, endVisible);
  console.log(`  JSエラー: ${errs.length}`, errs.slice(0, 4));
  await b.close();
  return { handVisible, cmdVisible, endVisible, errs: errs.length };
}

(async () => {
  const r1 = await run(1440, 900, 'lap');   // ノートPC
  const r2 = await run(1280, 720, 'small'); // 小さめ画面で手札が切れないか
  console.log('\n================ レイアウト総評 ================');
  const allOk = r1.handVisible && r1.cmdVisible && r1.endVisible && r2.handVisible && r2.cmdVisible && r2.endVisible && r1.errs === 0 && r2.errs === 0;
  console.log(allOk ? '✓ 全ビューポートで手札・操作ボタンが画面内・JSエラー0' : '✗ 要修正（上の詳細参照）');
  console.log('スクショ:', SHOTS);
  process.exit(allOk ? 0 : 1);
})();
