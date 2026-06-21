/* エンジン検証：AI同士で自動対戦させ、クラッシュなく決着するか確認する。
   使い方: node test/sim.js  （C:\dev\sengoku-agent-tcg で実行）
   UIは読み込まない（DOM不要）。データ＋エンジンのみ。 */
global.window = global;
const Q = [];
global.setTimeout = (fn) => { Q.push(fn); return 0; };

const path = require('path');
const base = path.join(__dirname, '..');
require(path.join(base, 'src/data/cards.js'));
require(path.join(base, 'src/data/commands.js'));
require(path.join(base, 'src/data/decks.js'));
require(path.join(base, 'src/engine/engine.js'));

const E = global.Engine;
let games = 0, p1w = 0, p2w = 0, errors = 0, turnsTotal = 0, maxTurns = 0;
const N = +(process.argv[2] || 30);
const D1 = process.argv[3] || 'oda', D2 = process.argv[4] || 'takeda';

for (let g = 0; g < N; g++) {
  try {
    E.newGame(D1, D2, true, true); // 両者AI（自己対戦・両者自動布陣）
    Q.length = 0;
    E.aiTurn(); // 先攻の手番を開始（以降は setTimeout キュー経由で連鎖）
    let guard = 0;
    while (Q.length && !E.GAME.winner && guard++ < 4000) {
      const fn = Q.shift();
      fn();
    }
    games++;
    turnsTotal += E.GAME.turn; maxTurns = Math.max(maxTurns, E.GAME.turn);
    if (E.GAME.winner === 'p1') p1w++; else if (E.GAME.winner === 'p2') p2w++;
    if (!E.GAME.winner) console.log(`  [game ${g}] 決着せず（turn ${E.GAME.turn}, guard ${guard}）`);
  } catch (err) {
    errors++;
    console.log(`  [game ${g}] ERROR:`, err.message);
    console.log(err.stack.split('\n').slice(0, 4).join('\n'));
  }
}

console.log('================ シミュレーション結果 ================');
console.log(`対戦数: ${games}/${N}  エラー: ${errors}  （${D1} vs ${D2}）`);
console.log(`勝敗: ${D1}(p1) ${p1w} - ${p2w} ${D2}(p2)  決着せず ${games - p1w - p2w}`);
console.log(`平均手番: ${(turnsTotal / Math.max(1, games)).toFixed(1)}  最長手番: ${maxTurns}`);
// 最後の1戦の戦記を少し表示
if (E.GAME) {
  console.log('---- 最終戦の戦記（抜粋）----');
  E.GAME.log.slice(0, 10).forEach(l => console.log(`  [T${l.t}] ${l.msg}`));
}
