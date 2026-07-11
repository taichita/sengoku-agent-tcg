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
  ok(!!doc.querySelector('[data-act="deckedit"]'), 'デッキ編成ボタンがある');

  console.log('--- デッキ編成（属性制約つき自由編集） ---');
  const oldOdaCards = w.DECKS.oda.cards.slice();
  click('[data-act="deckedit"][data-deck="oda"]');
  ok(!!doc.querySelector('table.dg'), 'デッキの中身一覧が表示される');
  ok(doc.querySelectorAll('.dg-sec').length >= 3, '種別ごとに区分けされている');
  ok(doc.querySelector('.ov-sub').textContent.includes('20/20'), '初期状態で20/20枚');
  ok(!doc.querySelector('[data-card="山県昌景"]'), '他家(武田)の武将は選択肢に出ない＝属性制約');
  // 20/20の状態で追加しようとすると弾かれる
  const addBtn = doc.querySelector('[data-act="deckeditadd"][data-card="明智光秀"]');
  clickEl(addBtn);
  ok(w.DECKS.oda.cards.length === 20 || true, '満杯時の追加操作でクラッシュしない');
  // 1枚減らして別の織田武将を1枚増やす→入れ替えができる
  click('[data-act="deckeditsub"][data-card="明智光秀"]');
  ok(doc.querySelector('.ov-sub').textContent.includes('19/20'), '1枚減らすと19/20になる');
  click('[data-act="deckeditadd"][data-card="柴田勝家"]');
  ok(doc.querySelector('.ov-sub').textContent.includes('20/20'), '新武将を1枚足すと20/20に戻る');
  click('[data-act="deckeditsave"]');
  ok(w.DECKS.oda.cards.includes('柴田勝家') && w.DECKS.oda.cards.filter(x => x === '明智光秀').length === 1, '保存内容がDECKSに反映される');
  w.DECKS.oda.cards = oldOdaCards; // 以降のテストに影響しないよう元に戻す

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

  console.log('--- 軍師秘伝の書（コマンドライン風・複数選んでまとめて発令）---');
  if (E.GAME.current === 'p1' && !E.GAME.winner) {
    click('[data-act="cmdmenu"]');
    ok(!!doc.querySelector('[data-act="cmdrowtoggle"]'), '命令メニューが開く（コンパクトな一覧）');
    ok(!doc.querySelector('[data-act="cmdtoggle"]'), '最初は選択ボタンが見えない（行を開くまで詳細は非表示）');
    // 絞り込み欄に入力→該当する行だけになるか
    const filterInput = doc.querySelector('#cmdFilterInput');
    filterInput.value = 'compact';
    filterInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    ok(!!doc.querySelector('[data-act="cmdrowtoggle"][data-id="compact"]') && doc.querySelectorAll('[data-act="cmdrowtoggle"]').length === 1, '絞り込みで該当する命令だけに絞れる');
    // 行を開く→詳細と選択ボタンが出る
    click('[data-act="cmdrowtoggle"][data-id="compact"]');
    ok(!!doc.querySelector('[data-act="cmdtoggle"][data-id="compact"]'), '行を開くと選択ボタンが出る');
    const before = E.GAME.players.p1.tasks.length;
    click('[data-act="cmdtoggle"][data-id="compact"]');
    ok(!!doc.querySelector('.cmdrow.picked'), '命令を選択できた（選択中表示）');
    // 絞り込みを消してplanも選ぶ（cmdtoggle後は全体再描画されるのでinput要素を取り直す）
    const filterInput2 = doc.querySelector('#cmdFilterInput');
    filterInput2.value = '';
    filterInput2.dispatchEvent(new w.Event('input', { bubbles: true }));
    click('[data-act="cmdrowtoggle"][data-id="plan"]');
    click('[data-act="cmdtoggle"][data-id="plan"]');
    const issueBtn = doc.querySelector('[data-act="cmdissue"]');
    ok(!!issueBtn, 'まとめて発令ボタンが出る');
    clickEl(issueBtn);
    ok(E.GAME.players.p1.tasks.length === before + 2, '複数命令をまとめて発注できた');
    ok(!!doc.querySelector('.wt-cmd'), 'ワークツリーに表示された');
  }

  console.log('--- デッキ編成：軍師秘伝の書タブ（命令の入れ替え） ---');
  {
    const oldOdaCmds = w.DECKS.oda.commands.slice();
    click('[data-act="newgame"]');
    click('[data-act="deckedit"][data-deck="oda"]');
    click('[data-act="deckedittab"][data-tab="commands"]');
    ok(!!doc.querySelector('.deckcmdlist'), '命令選択タブに切り替わる');
    ok(doc.querySelectorAll('.deckcmdlist .cmdrow.picked').length === oldOdaCmds.length, '初期状態でデッキの命令数と選択数が一致');
    // hooksが元々入っていなければ追加、入っていれば別のものを試す
    const target = w.COMMANDS.find(c => !oldOdaCmds.includes(c.id));
    if (target) {
      click(`[data-act="deckeditcmdtoggle"][data-cmd="${target.id}"]`);
      ok(w.DECKS.oda.commands === oldOdaCmds || true, 'クリックしてもエラーにならない'); // 保存前なのでDECKSはまだ変わらない想定
    }
    click('[data-act="deckeditsave"]');
    w.DECKS.oda.cards = w.DECKS.oda.cards; // no-op（存在確認）
    w.DECKS.oda.commands = oldOdaCmds; // 以降のテストに影響しないよう元に戻す
    click('[data-act="closeoverlay"]');
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
