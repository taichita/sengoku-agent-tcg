/* 診断：人間がCPU戦で「兵を配る→攻撃」して実際にダメージが入るかをjsdomで再現。
   node test/diag-attack.js */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '..');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window; const q = []; w.setTimeout = (fn) => { q.push(fn); return 0; };
function drain(m = 60) { let n = 0; while (q.length && n++ < m) q.shift()(); }
['src/data/cards.js', 'src/data/commands.js', 'src/data/decks.js', 'src/engine/engine.js', 'src/ui/ui.js'].forEach(f => w.eval(fs.readFileSync(path.join(base, f), 'utf8')));
const E = w.Engine, U = w.UI, doc = w.document;
function click(sel) { const el = doc.querySelector(sel); if (!el) throw new Error('no ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function clickEl(el) { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }

U.render();
click('[data-act="startgame"][data-p1="oda"][data-mode="cpu"]');
// 布陣：たねを先鋒に
click('[data-act="setupCard"]');
click('[data-act="confirmSetup"]'); drain();

console.log('開戦直後: current=', E.GAME.current, 'turn=', E.GAME.turn, 'firstPlayer=', E.GAME.firstPlayer);
let atkOK = false;
for (let t = 0; t < 6 && !E.GAME.winner; t++) {
  if (E.GAME.current !== 'p1') { drain(); continue; }
  const p = E.GAME.players.p1;
  console.log(`-- 自分の番 turn${E.GAME.turn}: 兵站庫=${p.energy} active=${p.active && p.active.card.name} energyOnActive=${p.active && p.active.energy}`);
  // 兵を配る
  if (p.active && p.energy > 0) { click('[data-act="energy"]'); const wl = doc.querySelector(`.mine [data-act="warlord"][data-uid="${p.active.uid}"]`); if (wl) clickEl(wl); console.log(`   兵配備後 energyOnActive=${p.active.energy}`); }
  // 攻撃ボタンある？
  const mv = doc.querySelector('.mine [data-act="move"]');
  console.log('   攻撃ボタン(.mine [data-act=move]):', mv ? 'あり' : 'なし', ' 全moveボタン数=', doc.querySelectorAll('[data-act="move"]').length, ' dim数=', doc.querySelectorAll('.move.dim').length);
  if (mv) {
    const before = E.GAME.players.p2.active ? E.GAME.players.p2.active.damage : -1;
    clickEl(mv);
    const after = E.GAME.players.p2.active ? E.GAME.players.p2.active.damage : -1;
    console.log(`   攻撃した！ 相手ダメージ ${before}→${after}`);
    if (after > before) atkOK = true;
    drain();
  } else { click('[data-act="endturn"]'); drain(); }
}
console.log('\n結論: プレイヤーは攻撃してダメージを与えられたか →', atkOK ? 'YES（機構は正常）' : 'NO（要調査）');
