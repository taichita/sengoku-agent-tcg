/* 操作レベルの検証：jsdom にゲームを読み込み、実際のクリック操作を合成イベントで流す。
   開幕の布陣 → 戦闘 → 命令 → AI応手 まで人間の経路を丸ごと通す。
   node test/play-test.js */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '..');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
  { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window;
const q = [];
w.setTimeout = (fn) => { q.push(fn); return 0; };
function drain(max = 60) { let n = 0; while (q.length && n++ < max) { const fn = q.shift(); try { fn(); } catch (e) { console.log('AIターンでエラー:', e.message); throw e; } } }

['src/data/cards.js', 'src/data/commands.js', 'src/data/decks.js', 'src/engine/engine.js', 'src/ui/ui.js']
  .forEach(f => w.eval(fs.readFileSync(path.join(base, f), 'utf8')));

const E = w.Engine, U = w.UI, doc = w.document;
let pass = 0, fail = 0;
function ok(c, l) { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } }
function clickEl(el) { if (!el) throw new Error('要素なし'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function click(sel) { const el = doc.querySelector(sel); if (!el) throw new Error('要素が見つからない: ' + sel); clickEl(el); }

try {
  console.log('--- スタート画面 ---');
  U.render();
  ok(!!doc.querySelector('[data-act="startgame"]'), 'スタート画面に家選択ボタン');
  ok(!!doc.querySelector('[data-act="deckguide"]'), 'デッキ「中身を見る」ボタンがある');

  console.log('--- デッキガイド ---');
  click('[data-act="deckguide"][data-deck="oda"]');
  ok(!!doc.querySelector('table.dg'), 'デッキの中身一覧が表示される');
  ok(doc.querySelectorAll('.dg-sec').length >= 3, '種別ごとに区分けされている');
  click('[data-act="closeoverlay"]');

  console.log('--- 織田家で開戦 → 布陣フェーズ ---');
  click('[data-act="startgame"][data-p1="oda"]');
  ok(!!E.GAME, 'ゲーム生成');
  ok(E.GAME.phase === 'setup', '開幕は布陣フェーズ');
  ok(!!doc.querySelector('.setup'), '布陣画面が出る');
  ok(typeof E.GAME.coinHeads === 'boolean', '軍配（先攻後攻）が決まっている');

  console.log('--- 先鋒を自分で選ぶ ---');
  let card = doc.querySelector('[data-act="setupCard"]');
  ok(!!card, '配られた手札にたねがある');
  clickEl(card);
  ok(!!E.GAME.players.p1.active, '先鋒を自分で配置できた');
  // もう1枚あれば後備えへ
  card = doc.querySelector('[data-act="setupCard"]');
  if (card) { clickEl(card); ok(E.GAME.players.p1.bench.some(Boolean), '後備えにも配置できた'); }
  // 戻すテスト
  const placed = doc.querySelector('[data-act="setupReturn"]');
  ok(!!placed, '置いた札に「戻す」操作がある');

  console.log('--- 開戦 ---');
  click('[data-act="confirmSetup"]');
  ok(E.GAME.phase === 'play', '開戦した（playフェーズ）');
  drain();
  ok(E.GAME.current === 'p1' || !!E.GAME.winner, '先攻処理後、自分の番に戻る/決着');
  ok(!!doc.querySelector('.handbar'), '手札バーが描画されている');
  ok(!!doc.querySelector('[data-act="cmdmenu"]'), '軍師の命令ボタンが存在する');
  ok(!!doc.querySelector('[data-act="endturn"]'), '番を終わるボタンが存在する');
  if (E.GAME.current === 'p1' && !E.GAME.winner) {
    const p = E.GAME.players.p1;
    const benchTarget = p.bench.find(Boolean);
    if (benchTarget && p.energy > 0) {
      const beforeEnergy = benchTarget.energy;
      click('[data-act="energyReserve"]');
      clickEl(doc.querySelector(`.mine [data-act="warlord"][data-uid="${benchTarget.uid}"]`));
      ok(benchTarget.energy === beforeEnergy + 1, '後備えの武将にも兵糧を送れる');
    }
  }

  console.log('--- カード詳細（クリックで詳細→確認してから使う）---');
  if (E.GAME.current === 'p1' && !E.GAME.winner && doc.querySelector('[data-act="hand"]')) {
    click('[data-act="hand"][data-i="0"]');
    ok(!!doc.querySelector('.carddetail'), 'カードクリックで詳細が出る（いきなり発動しない）');
    ok(!!doc.querySelector('[data-act="useHand"]'), '「使う/出す」ボタンがある');
    click('button[data-act="closeoverlay"]');
  }

  console.log('--- 命令メニュー（複数選んでまとめて発令）---');
  if (E.GAME.current === 'p1' && !E.GAME.winner) {
    click('[data-act="cmdmenu"]');
    ok(!!doc.querySelector('[data-act="cmdtoggle"]'), '命令メニューが開く');
    const before = E.GAME.players.p1.tasks.length;
    // 2件まとめて選んで発令（並列上限2なので2件まで）
    click('[data-act="cmdtoggle"][data-id="compact"]');
    ok(!!doc.querySelector('.cmdcard.picked'), '命令を選択できた（選択中表示）');
    click('[data-act="cmdtoggle"][data-id="plan"]');
    const issueBtn = doc.querySelector('[data-act="cmdissue"]');
    ok(!!issueBtn, 'まとめて発令ボタンが出る');
    clickEl(issueBtn);
    ok(E.GAME.players.p1.tasks.length === before + 2, '複数命令をまとめて発注できた');
    ok(!!doc.querySelector('.wt-cmd'), 'ワークツリーに表示された');
  }

  console.log('--- 数手番まわす（堅牢性）---');
  for (let t = 0; t < 10 && !E.GAME.winner; t++) {
    if (E.GAME.current !== 'p1') { drain(); continue; }
    const p = E.GAME.players.p1;
    if (p.active) { click('[data-act="energyReserve"]'); const wl = doc.querySelector(`.mine [data-act="warlord"][data-uid="${p.active.uid}"]`); if (wl) clickEl(wl); }
    const evi = E.GAME.turn >= 2 ? p.hand.findIndex(c => c.card.type === 'warlord' && c.card.stage > 0 &&
      [p.active, ...p.bench].some(b => b && b.card.id === c.card.evolvesFrom && !b.placedThisTurn && !b.evolvedThisTurn)) : -1;
    if (evi >= 0) {
      const tgt = [p.active, ...p.bench].find(b => b && b.card.id === p.hand[evi].card.evolvesFrom && !b.placedThisTurn && !b.evolvedThisTurn);
      click(`[data-act="hand"][data-i="${evi}"]`);                                  // 詳細
      const use = doc.querySelector(`[data-act="useHand"][data-i="${evi}"]`); if (use) clickEl(use); // 出世させる
      const wl = doc.querySelector(`[data-act="warlord"][data-uid="${tgt.uid}"]`); if (wl) clickEl(wl);
    }
    const active = p.active && doc.querySelector(`.mine [data-act="warlord"][data-uid="${p.active.uid}"]`);
    if (active) clickEl(active);
    const attack = doc.querySelector('[data-act="selectAttack"]');
    if (attack) clickEl(attack);
    const mv = doc.querySelector('[data-act="move"]');
    if (mv) clickEl(mv); else click('[data-act="endturn"]');
    drain();
  }
  ok(true, `10手番回してクラッシュなし（turn ${E.GAME.turn}${E.GAME.winner ? ' / 決着=' + E.GAME.winner : ''}）`);

} catch (e) {
  fail++;
  console.log('!! 例外:', e.message);
  console.log(e.stack.split('\n').slice(0, 6).join('\n'));
}

console.log(`\n================ 操作テスト結果 ================`);
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
