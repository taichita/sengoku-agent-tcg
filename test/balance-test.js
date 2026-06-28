/* ゲーム性の土台検査。
   デッキの噛み合い、兵糧テンポ、特性の実動作を軽く確認する。 */
global.window = global;
const Q = [];
global.setTimeout = fn => { Q.push(fn); return 0; };

const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..');
require(path.join(base, 'src/data/cards.js'));
require(path.join(base, 'src/data/commands.js'));
require(path.join(base, 'src/data/decks.js'));
require(path.join(base, 'src/engine/engine.js'));

const E = global.Engine;
let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('PASS', msg);
  else { console.log('FAIL', msg); fail++; }
}

function deckCards(deck) {
  return deck.cards.map(id => global.CARDS[id]);
}

Object.values(global.DECKS).forEach(deck => {
  const ids = deck.cards;
  ok(ids.length === 20, `${deck.name}: 20枚ちょうど`);
  ok(ids.every(id => !!global.CARDS[id]), `${deck.name}: 未定義カードなし`);
  deckCards(deck).filter(c => c && c.art).forEach(c => {
    ok(fs.existsSync(path.join(base, c.art)), `${deck.name}: ${c.name}の画像が存在`);
  });

  const inDeck = new Set(ids);
  const basics = deckCards(deck).filter(c => c && c.type === 'warlord' && c.stage === 0);
  const evolutions = deckCards(deck).filter(c => c && c.type === 'warlord' && c.stage === 1);
  basics.forEach(basic => {
    ok(evolutions.some(ev => ev.evolvesFrom === basic.id), `${deck.name}: ${basic.name}の出世先が入っている`);
  });

  const warlords = deckCards(deck).filter(c => c && c.type === 'warlord');
  if (inDeck.has('平野')) ok(warlords.some(c => c.heisyu === '騎'), `${deck.name}: 平野が騎馬と噛み合う`);
  if (inDeck.has('鉄砲陣地')) ok(warlords.some(c => c.heisyu === '砲'), `${deck.name}: 鉄砲陣地が鉄砲と噛み合う`);
  if (inDeck.has('山道')) ok(warlords.some(c => c.heisyu === '槍'), `${deck.name}: 山道が槍と噛み合う`);
  if (inDeck.has('矢倉')) ok(warlords.some(c => c.heisyu === '弓'), `${deck.name}: 矢倉が弓と噛み合う`);
  if (inDeck.has('大雨')) ok(!warlords.some(c => c.heisyu === '砲'), `${deck.name}: 大雨で自軍の鉄砲を邪魔しない`);
});

E.newGame('toyotomi', 'takeda', true, true);
E.GAME.players.p1.isAI = false;
E.GAME.players.p2.isAI = false;
const p = E.cur();
ok(!!p.active && !!p.bench[0], '兵糧検査: 先鋒と後備えがいる');

p.energy = 2;
p.active.energy = 0;
p.active.suppliedThisTurn = 0;
ok(E.attachEnergy(p.active.uid).ok, '兵糧検査: 先鋒へ1つ目を送れる');
ok(E.attachEnergy(p.active.uid).ok, '兵糧検査: 先鋒へ2つ目を送れる');
p.energy = 1;
ok(!E.attachEnergy(p.active.uid).ok, '兵糧検査: 先鋒へ3つ目は送れない');

const bench = p.bench[0];
p.energy = 2;
bench.suppliedThisTurn = 0;
ok(E.attachEnergy(bench.uid).ok, '兵糧検査: 後備えへ1つ送れる');
ok(!E.attachEnergy(bench.uid).ok, '兵糧検査: 後備えへ2つ目は送れない');

p.active.card = global.CARDS['鳥居元忠'];
p.active.cardId = '鳥居元忠';
p.active.status = [];
E.applyStatus(p.active, '混乱');
ok(!p.active.status.includes('混乱'), '特性検査: 伏見の忠義で状態異常を受けない');

p.active.card = global.CARDS['石田三成'];
p.active.cardId = '石田三成';
p.energy = 0;
E.endTurn();
E.endTurn();
ok(p.energy >= 3, '特性検査: 兵站奉行で自分の番開始時に兵糧+1');

const compact = global.COMMANDS.find(c => c.id === 'compact');
ok(!!compact && compact.effect.energy === 2, '命令検査: /compactで兵糧を補給できる');
global.COMMANDS.forEach(cmd => {
  ok(!!cmd.learn && !!cmd.learn.title && !!cmd.learn.practice && !!cmd.learn.real, `命令検査: ${cmd.cmd}にClaude Code修行がある`);
});

if (fail) {
  console.log(`検査失敗: ${fail}`);
  process.exit(1);
}
console.log('ゲーム性検査 OK');
