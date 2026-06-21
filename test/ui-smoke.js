/* UI描画のスモークテスト：最小DOMスタブで render/各HTMLビルダを実行し例外が出ないか確認。
   node test/ui-smoke.js */
global.window = global;
global.setTimeout = () => 0;
const appEl = { innerHTML: '', style: {}, id: 'app' };
const made = {};
global.document = {
  getElementById: (id) => { if (id === 'app') return appEl; return (made[id] = made[id] || { id, style: {}, innerHTML: '', appendChild() {} }); },
  addEventListener: () => {},
  querySelector: () => null,
  createElement: () => ({ style: {}, innerHTML: '', appendChild() {} }),
  body: { appendChild() {} },
};
const path = require('path'); const base = path.join(__dirname, '..');
['src/data/cards.js','src/data/commands.js','src/data/decks.js','src/engine/engine.js','src/ui/ui.js'].forEach(f => require(path.join(base, f)));

try {
  global.Engine.newGame('oda', 'takeda', true);
  global.UI.render();
  console.log('render OK / board html length =', appEl.innerHTML.length);
  // 命令メニューも描画してみる（オーバーレイ生成パス）
  // openCmdMenu は内部関数なのでクリック経路で再現は省略。代わりに勝利画面パスを検査。
  global.Engine.GAME.winner = 'p1';
  global.UI.render();
  console.log('gameover render OK / overlay html length =', (made['overlay'] && made['overlay'].innerHTML.length) || 0);
  console.log('SMOKE TEST PASSED — UIの描画系に実行時エラーなし');
} catch (e) {
  console.log('SMOKE TEST FAILED:', e.message);
  console.log(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
