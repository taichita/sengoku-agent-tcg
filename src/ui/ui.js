/* ===========================================================
   UI ── 盤面描画・カード・サイドパネル（ワークツリー可視化）・操作
   依存: Engine, CARDS, COMMANDS, FACTIONS, CATEGORY_COLOR
   公開: window.UI
   操作はクリック方式（タップ）。選んだ手札→対象をクリックで確定。
   =========================================================== */
(function () {
  const E = window.Engine;
  let mode = 'idle';      // idle|place|evolve|equip|trainer|attach|retreat
  let selHand = -1;       // 選択中の手札index
  let uiMode = 'cpu';     // cpu | hotseat | spectate
  let startMode = 'cpu';  // スタート画面で選択中のモード
  let startP1 = 'oda', startP2 = 'takeda'; // スタート画面で選択中の家
  let root, panelEl, toastTimer;
  let cmdCart = [];       // 命令メニューで選択中の命令id（まとめて発令する）

  // 盤面の下側に表示する「自分」視点のプレイヤー
  function viewer() {
    const G = E.GAME; if (!G) return 'p1';
    if (G.phase === 'setup') return E.setupCurrent() || 'p1';
    if (uiMode === 'hotseat') return G.current;
    return 'p1';
  }
  function other(id) { return id === 'p1' ? 'p2' : 'p1'; }

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const ART_FOCUS = {
    'ashigaru.png': ['50%', '34%'],
    'yari.png': ['50%', '64%'],
    'kiba.png': ['50%', '30%'],
    'yumi.png': ['50%', '31%'],
    'teppo.png': ['51%', '31%'],
    'nobunaga.png': ['51%', '24%'],
    'shingen.png': ['50%', '22%'],
    'kenshin.png': ['50%', '22%'],
    'ieyasu.png': ['50%', '24%'],
    'hideyoshi.png': ['51%', '24%'],
    'mitsuhide.png': ['50%', '27%'],
    'takigawa.png': ['51%', '26%'],
    'kanetsugu.png': ['50%', '25%'],
    'amakasu.png': ['50%', '25%'],
    'tadakatsu.png': ['50%', '25%'],
    'torii.png': ['50%', '25%'],
    'tokichiro.png': ['50%', '27%'],
    'mitsunari.png': ['50%', '27%'],
    'yamagata.png': ['50%', '25%'],
    'baba.png': ['50%', '25%'],
    'katana.png': ['50%', '48%'],
    'gusoku.png': ['50%', '45%'],
    'sashimono.png': ['50%', '45%'],
    'horo.png': ['50%', '46%'],
  };
  function artFocus(c) {
    const file = String((c && c.art) || '').split('/').pop();
    return ART_FOCUS[file] || (c && c.daimyo ? ['50%', '24%'] : ['50%', '32%']);
  }
  function artVars(c) {
    const f = artFocus(c);
    return `--art-x:${f[0]};--art-y:${f[1]};`;
  }

  function toast(msg, bad) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2200);
  }

  function clearMode() { mode = 'idle'; selHand = -1; }

  // -------- エフェクト＋効果音（Web Audioで和風の音をその場で合成。外部ファイル不要）--------
  let _ac = null, _master = null, _sfxAt = 0, _lastLog = 0, _lastTurnKey = '', sfxOn = true;
  let bgmOn = false, bgmAudio = null, bgmIndex = -1, bgmSourceIndex = 0;
  function ac() {
    if (!_ac) {
      _ac = new (window.AudioContext || window.webkitAudioContext)();
      _master = _ac.createGain(); _master.gain.value = 0.5; _master.connect(_ac.destination);
    }
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  }
  // 連続する効果音が同時に重なって団子にならないよう、わずかにずらして並べる
  function slot() { const t = ac().currentTime; _sfxAt = Math.max(t, _sfxAt + 0.055); return _sfxAt; }
  function noiseBuf(dur) {
    const a = ac(), n = Math.max(1, Math.floor(a.sampleRate * dur)), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function tone(t, freq, dur, type, gain, freqEnd) {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(_master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(t, dur, gain, ftype, f0, f1) {
    const a = ac(), s = a.createBufferSource(); s.buffer = noiseBuf(dur);
    const f = a.createBiquadFilter(); f.type = ftype || 'bandpass'; f.frequency.setValueAtTime(f0 || 1200, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(gain || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(_master); s.start(t); s.stop(t + dur + 0.03);
  }
  function taiko(t, gain) { tone(t, 165, 0.18, 'sine', gain || 0.5, 55); noise(t, 0.05, (gain || 0.5) * 0.3, 'lowpass', 420, 120); }
  function chord(t, freqs, dur, type, gain, gap) {
    freqs.forEach((f, i) => tone(t + i * (gap == null ? 0.025 : gap), f, dur || 0.18, type || 'triangle', gain || 0.08));
  }
  function taikoRoll(t, count, gain, gap) {
    for (let i = 0; i < count; i++) taiko(t + i * (gap || 0.08), (gain || 0.32) * (1 - i * 0.08));
  }
  function paper(t, gain) {
    noise(t, 0.055, gain || 0.08, 'highpass', 1200, 2600);
    noise(t + 0.025, 0.04, (gain || 0.08) * 0.55, 'bandpass', 700, 1600);
  }
  function blade(t, gain) {
    noise(t, 0.13, gain || 0.14, 'highpass', 780, 6200);
    tone(t + 0.015, 880, 0.09, 'triangle', 0.075, 240);
    tone(t + 0.07, 1320, 0.05, 'sine', 0.04, 980);
  }
  function sfx(kind) {
    if (!sfxOn) return;
    try {
      const t = slot();
      if (kind === 'hit') { taiko(t, 0.46); noise(t + 0.015, 0.14, 0.24, 'bandpass', 2400, 420); tone(t + 0.02, 360, 0.1, 'square', 0.09, 110); }
      else if (kind === 'ko') { taikoRoll(t, 3, 0.56, 0.16); tone(t, 180, 0.55, 'sawtooth', 0.16, 42); noise(t + 0.09, 0.2, 0.1, 'lowpass', 340, 90); }
      else if (kind === 'done') { chord(t, [659, 880, 1175], 0.18, 'triangle', 0.1, 0.06); paper(t + 0.03, 0.04); }
      else if (kind === 'win') { taikoRoll(t, 6, 0.42, 0.1); chord(t + 0.08, [523, 659, 784, 1046, 1318], 0.3, 'triangle', 0.12, 0.1); }
      else if (kind === 'evolve') { tone(t, 175, 0.7, 'sine', 0.14, 120); chord(t + 0.04, [392, 523, 659, 880, 1175], 0.24, 'triangle', 0.1, 0.055); noise(t + 0.16, 0.18, 0.05, 'highpass', 2200, 5200); }
      else if (kind === 'deploy') { taikoRoll(t, 4, 0.5, 0.12); tone(t, 88, 0.95, 'sawtooth', 0.16, 68); chord(t + 0.15, [220, 330, 440], 0.26, 'triangle', 0.08, 0.035); }
      else if (kind === 'attach') { paper(t, 0.05); chord(t + 0.02, [540, 720, 960], 0.13, 'triangle', 0.07, 0.035); }
      else if (kind === 'supply') { noise(t, 0.1, 0.06, 'bandpass', 900, 1300); chord(t + 0.02, [520, 660, 820, 1040], 0.12, 'triangle', 0.07, 0.035); }
      else if (kind === 'slash') { blade(t, 0.14); }
      else if (kind === 'commandDone') { taiko(t, 0.44); paper(t + 0.04, 0.08); chord(t + 0.07, [440, 660, 990], 0.16, 'triangle', 0.08, 0.045); }
      else if (kind === 'command') { paper(t, 0.09); noise(t + 0.04, 0.16, 0.08, 'highpass', 420, 3200); tone(t + 0.08, 720, 0.12, 'sine', 0.06); }
      else if (kind === 'stadium') { taiko(t, 0.5); taiko(t + 0.11, 0.34); noise(t, 0.2, 0.14, 'lowpass', 360, 80); }
      else if (kind === 'turnMe') { taiko(t, 0.28); chord(t + 0.04, [523, 784], 0.18, 'triangle', 0.08, 0.04); }
      else if (kind === 'turnOp') { taiko(t, 0.22); tone(t + 0.04, 220, 0.22, 'triangle', 0.08, 160); }
      else if (kind === 'miss') { blade(t, 0.08); tone(t + 0.08, 180, 0.18, 'triangle', 0.05, 90); }
      else if (kind === 'click') { tone(t, 1080, 0.035, 'square', 0.035); noise(t, 0.025, 0.035, 'highpass', 1400, 2400); }
      else if (kind === 'place') { paper(t, 0.1); tone(t + 0.012, 270, 0.08, 'sine', 0.08, 190); }
    } catch (e) { }
  }
  function bgmTracks() {
    const list = Array.isArray(window.CADENZA_BGM) ? window.CADENZA_BGM : [];
    return list.filter(t => t && t.enabled !== false && bgmSources(t).length && ['owned', 'licensed', 'cleared'].includes(t.rights || 'owned'));
  }
  function bgmSources(track) {
    if (!track) return [];
    const sources = Array.isArray(track.sources) ? track.sources : [track.src];
    return sources.filter(Boolean);
  }
  function currentBgm() {
    const tracks = bgmTracks();
    if (!tracks.length) return null;
    if (bgmIndex < 0 || bgmIndex >= tracks.length) bgmIndex = Math.floor(Math.random() * tracks.length);
    return tracks[bgmIndex];
  }
  function currentBgmSrc() {
    const track = currentBgm();
    const sources = bgmSources(track);
    if (!sources.length) return '';
    if (bgmSourceIndex < 0 || bgmSourceIndex >= sources.length) bgmSourceIndex = 0;
    return sources[bgmSourceIndex];
  }
  function ensureBgmAudio() {
    const track = currentBgm();
    if (!track) return null;
    const src = currentBgmSrc();
    if (!src) return null;
    if (!bgmAudio) {
      bgmAudio = new Audio();
      bgmAudio.preload = 'auto';
      bgmAudio.volume = 0.38;
      bgmAudio.addEventListener('ended', () => nextBgm(false));
      bgmAudio.addEventListener('error', () => nextBgm(true));
    }
    bgmAudio.loop = bgmTracks().length === 1;
    if (bgmAudio.dataset.src !== src) {
      bgmAudio.src = src;
      bgmAudio.dataset.src = src;
    }
    return bgmAudio;
  }
  function playBgm() {
    const a = ensureBgmAudio();
    if (!a) { bgmOn = false; toast('BGMリストが空です'); return; }
    bgmOn = true;
    a.play().catch(() => toast('BGMはボタン操作後に再生できます', true));
  }
  function pauseBgm() {
    bgmOn = false;
    if (bgmAudio) bgmAudio.pause();
  }
  function nextBgm(fromError) {
    const tracks = bgmTracks();
    if (!tracks.length) { pauseBgm(); return; }
    const track = currentBgm();
    const sources = bgmSources(track);
    if (fromError && bgmSourceIndex < sources.length - 1) {
      bgmSourceIndex += 1;
      if (bgmAudio) {
        bgmAudio.src = sources[bgmSourceIndex];
        bgmAudio.dataset.src = sources[bgmSourceIndex];
      }
      if (bgmOn) playBgm();
      return;
    }
    if (tracks.length === 1 && fromError) { pauseBgm(); toast('BGMファイルを読み込めませんでした', true); render(); return; }
    bgmIndex = (bgmIndex + 1) % tracks.length;
    bgmSourceIndex = 0;
    if (bgmAudio) {
      const src = currentBgmSrc();
      bgmAudio.src = src;
      bgmAudio.dataset.src = src;
    }
    if (bgmOn) playBgm();
  }
  function toggleBgm() {
    if (bgmOn) pauseBgm();
    else playBgm();
    render();
  }
  function bgmButtonHTML() {
    const tracks = bgmTracks();
    const title = tracks.length ? `BGM: ${tracks.map(t => t.title || t.id || t.src).join(' / ')}` : 'C:\\dev\\shared-assets\\bgm\\mysongs に曲を追加';
    const label = tracks.length ? (bgmOn ? '曲 ON' : '曲 OFF') : '曲なし';
    return `<button class="railbtn ghost bgm ${bgmOn ? 'on' : ''}" data-act="bgmtoggle" title="${esc(title)}">${label}</button>`;
  }
  function flash(color) {
    let f = document.getElementById('flash');
    if (!f) { f = document.createElement('div'); f.id = 'flash'; document.body.appendChild(f); }
    f.style.background = color; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  function processFx(G) {
    // ログベース：行動ごとの効果音（新しいログだけ拾う）
    const n = G.log.length;
    if (n > _lastLog) {
      const fresh = G.log.slice(0, n - _lastLog); // 先頭が最新
      let bannered = false;
      fresh.forEach(l => {
        const m = l.msg;
        if (/勝鬨/.test(m)) { sfx('win'); flash('var(--kin)'); }
        else if (/完成/.test(m)) sfx('done');
        else if (/出世して/.test(m)) { sfx('evolve'); flash('var(--kin)'); }
        else if (/出陣/.test(m)) { sfx('deploy'); flash('var(--kin)'); }
        else if (/発注|発令|動き出した/.test(m)) sfx('command');
        else if (/陣形【/.test(m)) sfx('stadium');
        else if (/兵糧を送った/.test(m)) sfx('attach');
        else if (/場に出した|繰り上げた/.test(m)) sfx('place');
        if (!bannered && /「.+」！|ダメージ|発注|発令|完成|動き出した|陣形【|兵糧を送った|場に出した|繰り上げた|出世して|討死|勝鬨/.test(m)) {
          actionBanner(m, l.who === viewer() ? 'me' : 'op');
          bannered = true;
        }
      });
    }
    _lastLog = n;
    const turnKey = `${G.turn}:${G.current}`;
    if (_lastTurnKey && turnKey !== _lastTurnKey) {
      turnBanner(G);
      sfx(G.current === viewer() ? 'turnMe' : 'turnOp');
    }
    _lastTurnKey = turnKey;
    // イベントキュー：ダメージ数字・揺れ・突き・討死バナー（emit のたびに消費）
    const fx = G.fx || [];
    if (fx.length) {
      fx.forEach(ev => {
        if (ev.kind === 'dmg') { floatDamage(ev.uid, ev.amount); shakeEl(ev.uid); sfx('hit'); }
        else if (ev.kind === 'ko') { koBanner(ev.name, ev.daimyo); sfx('ko'); flash('var(--sumi)'); }
        else if (ev.kind === 'attack') { lungeEl(ev.uid); slashFx(ev.uid); sfx('slash'); }
        else if (ev.kind === 'attach') { supplyBurst(ev.uid); sfx('supply'); }
        else if (ev.kind === 'commandDone') { commandSeal(ev.side); sfx('commandDone'); }
        else if (ev.kind === 'deploy') { deployBurst(ev.uid); sfx('deploy'); }
      });
      G.fx = [];
    }
  }
  // 被弾カードを揺らす／攻撃カードを突き出す（再描画に強いよう毎回クラス付け直し）
  function animClass(uid, cls, ms) {
    const el = document.querySelector(`[data-uid="${uid}"]`); if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => { if (el) el.classList.remove(cls); }, ms);
  }
  function shakeEl(uid) { animClass(uid, 'fx-shake', 360); }
  function lungeEl(uid) { animClass(uid, 'fx-lunge', 320); }
  function uidRect(uid) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    return el ? el.getBoundingClientRect() : null;
  }
  function placeFx(el, uid, xPct, yPct) {
    const r = uidRect(uid);
    if (r) {
      el.style.left = (r.left + r.width * (xPct == null ? 0.5 : xPct)) + 'px';
      el.style.top = (r.top + r.height * (yPct == null ? 0.5 : yPct)) + 'px';
    } else {
      el.style.left = '50%';
      el.style.top = '45%';
    }
    document.body.appendChild(el);
  }
  function slashFx(uid) {
    const d = document.createElement('div');
    d.className = 'fx-slash';
    d.innerHTML = '<i></i><i></i>';
    placeFx(d, uid, 0.5, 0.42);
    setTimeout(() => d.remove(), 520);
  }
  function supplyBurst(uid) {
    const d = document.createElement('div');
    d.className = 'fx-supply';
    d.innerHTML = '<i></i><i></i><i></i><i></i><i></i><b>+1</b>';
    placeFx(d, uid, 0.5, 0.78);
    setTimeout(() => d.remove(), 900);
  }
  function deployBurst(uid) {
    const d = document.createElement('div');
    d.className = 'fx-deploy';
    d.innerHTML = '<i></i><b>出陣</b>';
    placeFx(d, uid, 0.5, 0.42);
    setTimeout(() => d.remove(), 1000);
  }
  function commandSeal(side) {
    const d = document.createElement('div');
    d.className = `fx-command-seal ${side === viewer() ? 'me' : 'op'}`;
    d.innerHTML = '<span>命令完了</span>';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }
  // ダメージ数字を対象カードの上にふわっと出す（盤の再描画に巻き込まれないよう body に出す）
  function floatDamage(uid, amount) {
    const el = document.querySelector(`[data-uid="${uid}"]`);
    const d = document.createElement('div'); d.className = 'fx-dmg'; d.textContent = '-' + amount;
    if (el) { const r = el.getBoundingClientRect(); d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + 6) + 'px'; }
    else { d.style.left = '50%'; d.style.top = '42%'; }
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 950);
  }
  function koBanner(name, daimyo) {
    const d = document.createElement('div'); d.className = 'fx-ko' + (daimyo ? ' daimyo' : '');
    d.innerHTML = `<span class="fk-name">${esc(name)}</span><span class="fk-x">${daimyo ? '大名 討死！' : '討死'}</span>`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), daimyo ? 1500 : 1050);
  }
  function actionBanner(msg, side) {
    const short = String(msg || '').replace(/^.*?：\s*/, '').slice(0, 54);
    const d = document.createElement('div'); d.className = `fx-action ${side === 'me' ? 'me' : 'op'}`;
    d.innerHTML = `<span>${side === 'me' ? 'あなた' : '敵軍'}</span><b>${esc(short)}</b>`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1550);
  }
  function turnBanner(G) {
    const mine = G.current === viewer();
    const d = document.createElement('div');
    d.className = `fx-turn ${mine ? 'me' : 'op'}`;
    d.innerHTML = `<span>${mine ? 'あなたの番' : '敵軍の番'}</span><b>第${G.turn}手番</b>`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1150);
  }

  // -------- 起動 --------
  UIInit();
  function UIInit() {
    root = document.getElementById('app');
    E.onChange = render;
    document.addEventListener('click', onClick);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    applyResponsiveScale();
    window.addEventListener('resize', applyResponsiveScale);
    window.addEventListener('orientationchange', applyResponsiveScale);
  }

  // 盤面は基準サイズ(1180x720)固定で描画し、実画面に収まるよう縮小率を都度計算する（主にスマホ対応）。
  // window.innerWidth/Height は本UI自体の描画サイズに引っ張られて信頼できないため、
  // documentElement.clientWidth/Height（真の表示領域）を使う。
  function applyResponsiveScale() {
    const DESIGN_W = 1180, DESIGN_H = 720;
    const cw = document.documentElement.clientWidth;
    const ch = document.documentElement.clientHeight;
    const scale = Math.min(cw / DESIGN_W, ch / DESIGN_H);
    document.documentElement.style.setProperty('--ui-scale', scale);
  }
  window.UI = {
    start(p1, p2, m) {
      uiMode = m || 'cpu'; clearMode(); _lastLog = 0; _lastTurnKey = '';
      const p2ai = uiMode !== 'hotseat';   // ホットシート以外は相手(p2)がAI
      const p1ai = uiMode === 'spectate';  // 観戦は自分(p1)もAI
      E.newGame(p1, p2, p2ai, p1ai);
      hideOverlay(); render();
    },
    render,
  };

  // -------- クリック処理 --------
  function onClick(ev) {
    const t = ev.target.closest('[data-act]'); if (!t) return;
    const act = t.dataset.act; const ds = t.dataset;
    // ゲーム未生成でも効く操作（スタート画面・チュートリアル）
    if (act === 'newgame') { showStart(); return; }
    if (act === 'closeoverlay') { hideOverlay(); render(); return; } // 閉じた後、正しい画面（スタート/布陣/盤面）を描き直す
    if (act === 'startgame') { UI.start(ds.p1, ds.p2, ds.mode || 'cpu'); return; }
    if (act === 'setmode') { startMode = ds.mode; showStart(); return; }
    if (act === 'setp1') { startP1 = ds.deck; showStart(); return; }
    if (act === 'setp2') { startP2 = ds.deck; showStart(); return; }
    if (act === 'tut') { toggleTutorial(); return; }
    if (act === 'sfxtoggle') { sfxOn = !sfxOn; if (sfxOn) sfx('click'); render(); return; }
    if (act === 'bgmtoggle') { toggleBgm(); return; }
    if (act === 'deckguide') { showDeckGuide(ds.deck); return; }
    const G = E.GAME; if (!G) return;
    const human = G.current === viewer() && !G.players[G.current].isAI;
    // 開幕の布陣（自分のターンか否かに関わらず操作可）
    if (act === 'setupCard') { setupClickCard(ds.uid); return; }
    if (act === 'setupReturn') { do_(E.setupReturn(ds.uid)); return; }
    if (act === 'confirmSetup') { const r = E.confirmSetup(); if (!r.ok) toast(r.msg, true); else render(); return; } // 次の布陣者がいれば render が布陣画面を再表示、開戦なら盤面へ
    if (act === 'cmdmenu') { cmdCart = []; openCmdMenu(); return; }
    if (act === 'cmdtoggle') { toggleCmd(ds.id); return; }
    if (act === 'cmdclear') { cmdCart = []; renderCmdMenu(); return; }
    if (act === 'cmdissue') { issueCart(); return; }
    if (act === 'promote') { do_(E.choosePromote(ds.uid)); hideOverlay(); render(); return; } // 繰り上げ選択（自分の番以外でも自陣の決定）
    if ((act === 'energyReserve' || act === 'selectAttack' || act === 'selectRetreat') && (G.winner || !human)) {
      toast('自分の番に操作できます', true);
      return;
    }
    if (act === 'energyReserve') {
      if (E.cur().energy <= 0) { toast('送れる兵糧がありません', true); return; }
      mode = (mode === 'attach' ? 'idle' : 'attach'); selHand = -1; hideOverlay();
      toast(mode === 'attach' ? '兵糧を送る武将をクリック、または兵糧をドラッグ' : '');
      render();
      return;
    }
    if (act === 'selectAttack') { hideOverlay(); onAttackButton(); return; }
    if (act === 'selectRetreat') { hideOverlay(); mode = 'retreat'; selHand = -1; toast('交代する後備えをクリック'); render(); return; }

    if (G.winner || !human) return; // 自分の番以外は操作不可

    switch (act) {
      case 'hand': showCardDetail(+ds.i); break;
      case 'useHand': hideOverlay(); selectHand(+ds.i); break;
      case 'slot': onSlot(ds.slot); break;
      case 'warlord': onWarlord(ds.uid); break;
      case 'honjin': onHonjin(ds.uid); break;
      case 'energy': mode = (mode === 'attach' ? 'idle' : 'attach'); selHand = -1; toast(mode === 'attach' ? '兵糧を送る武将をクリック' : ''); render(); break;
      case 'attack': onAttackButton(); break;
      case 'move': hideOverlay(); do_(E.attack(+ds.i)); clearMode(); break;
      case 'retreatStart': mode = (mode === 'retreat' ? 'idle' : 'retreat'); selHand = -1; toast(mode === 'retreat' ? '交代する後備えをクリック' : ''); render(); break;
      case 'endturn': do_(E.endTurn()); clearMode(); break;
    }
  }

  function do_(r) { if (r && !r.ok) toast(r.msg, true); else if (r && r.msg) toast(r.msg); }

  function canUseEnergyReserve() {
    const G = E.GAME;
    return !!(G && G.current === viewer() && !G.players[G.current].isAI && E.cur().energy > 0);
  }

  function isOwnEnergyTarget(uid) {
    const p = E.cur();
    return !!(E.findOwn(p, uid) || (p.honjin && p.honjin.uid === uid));
  }

  function onDragStart(ev) {
    const reserve = ev.target.closest && ev.target.closest('.energy-reserve');
    if (!reserve || !E.GAME) return;
    if (!canUseEnergyReserve()) {
      ev.preventDefault();
      return;
    }
    ev.dataTransfer.setData('text/plain', 'energy');
    ev.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(ev) {
    if (!E.GAME) return;
    const target = ev.target.closest && ev.target.closest('[data-uid]');
    if (!target) return;
    if (!canUseEnergyReserve() || !isOwnEnergyTarget(target.dataset.uid)) return;
    ev.preventDefault();
  }

  function onDrop(ev) {
    if (!E.GAME) return;
    if (ev.dataTransfer.getData('text/plain') !== 'energy') return;
    const target = ev.target.closest && ev.target.closest('[data-uid]');
    if (!target) return;
    if (!canUseEnergyReserve() || !isOwnEnergyTarget(target.dataset.uid)) return;
    ev.preventDefault();
    const r = E.attachEnergy(target.dataset.uid);
    do_(r);
    if (E.cur().energy <= 0) clearMode();
  }

  function selectHand(i) {
    const p = E.cur(); const c = p.hand[i]; if (!c) return;
    selHand = i; mode = 'idle';
    const card = c.card;
    if (card.type === 'warlord' && card.stage === 0) { mode = 'place'; toast('出す場所（先鋒/後備え）をクリック'); }
    else if (card.type === 'warlord') { mode = 'evolve'; toast(`出世元（${card.evolvesFrom}）をクリック`); }
    else if (card.type === 'equip') { mode = 'equip'; toast('装備させる武将をクリック'); }
    else if (card.type === 'stadium') { do_(E.playStadium(i)); clearMode(); }
    else if (card.type === 'trainer') {
      const ef = card.effect || {};
      if (ef.heal != null) { mode = 'trainer'; toast('回復する武将をクリック'); }
      else { do_(E.useTrainer(i, null)); clearMode(); }
    }
    render();
  }

  function onSlot(slot) {
    if (mode !== 'place' || selHand < 0) return;
    do_(E.playFromHand(selHand, slot === 'active' ? 'active' : +slot)); clearMode();
  }
  function onWarlord(uid) {
    if (mode === 'evolve' && selHand >= 0) { do_(E.evolve(selHand, uid)); clearMode(); return; }
    if (mode === 'equip' && selHand >= 0) { do_(E.equip(selHand, uid)); clearMode(); return; }
    if (mode === 'trainer' && selHand >= 0) { do_(E.useTrainer(selHand, uid)); clearMode(); return; }
    if (mode === 'attach') {
      do_(E.attachEnergy(uid));
      if (E.cur().energy <= 0) clearMode(); // 在庫が残るなら続けて別の武将にも配れる
      return;
    }
    if (mode === 'retreat') {
      const p = E.cur(); const bi = p.bench.findIndex(b => b && b.uid === uid);
      if (bi >= 0) { do_(E.retreat(bi)); clearMode(); } else toast('後備えの武将を選んでください', true);
      return;
    }
    const own = E.findOwn(E.cur(), uid);
    if (own && E.GAME.current === viewer() && !E.GAME.players[E.GAME.current].isAI) {
      showWarlordActions(uid);
      return;
    }
    showWarlordDetail(uid);
  }

  // 本陣の大名：兵糧モードなら兵糧を蓄える（前線に出る前に育てられる）。それ以外は詳細表示。
  function onHonjin(uid) {
    if (mode === 'attach') { do_(E.attachEnergy(uid)); if (E.cur().energy <= 0) clearMode(); return; }
    showWarlordDetail(uid);
  }

  function showWarlordActions(uid) {
    const p = E.cur();
    const inst = E.findOwn(p, uid) || (p.honjin && p.honjin.uid === uid ? p.honjin : null);
    if (!inst) return;
    const isActive = p.active && p.active.uid === uid;
    const retreatCost = p.active ? ((p.active.equip && p.active.equip.effect && p.active.equip.effect.retreatFree) ? 0 : (p.active.card.retreat || 0)) : 0;
    const canAttack = isActive && E.canAttack();
    const canRetreat = isActive && p.bench.some(Boolean) && !p.retreated;
    const moves = isActive
      ? inst.card.moves.map(m => {
          const prev = damagePreview(p, E.opp(), inst, m);
          const ready = inst.energy >= m.cost;
          return `<div class="wa-move ${ready ? 'ready' : 'dim'}"><span>${esc(m.name)}</span><b>${prev.variable ? `${prev.certainTotal}-${prev.maxTotal}` : prev.total}</b><small>兵糧${m.cost}</small></div>`;
        }).join('')
      : '<div class="wa-hint">後備えは交代で先鋒に出せます。</div>';
    overlay(`<div class="warlord-actions">
      <div class="ov-h">${esc(inst.card.name)} の行動</div>
      <div class="wa-summary">
        <span>兵力 ${E.curHp(inst)}/${E.maxHp(inst)}</span>
        <span>兵糧 ${inst.energy}</span>
        ${inst.status.length ? `<span>状態 ${inst.status.map(esc).join('・')}</span>` : '<span>状態なし</span>'}
      </div>
      <div class="wa-moves">${moves}</div>
      <div class="wa-actions">
        <button class="btn atk ${canAttack ? '' : 'dim'}" ${canAttack ? 'data-act="selectAttack"' : ''}>攻撃を選ぶ</button>
        <button class="btn ${canRetreat ? '' : 'dim'}" ${canRetreat ? 'data-act="selectRetreat"' : ''}>退き口 <small>兵糧${retreatCost}</small></button>
        <button class="btn ghost" data-act="energyReserve">兵糧を送る</button>
        <button class="btn ghost" data-act="closeoverlay">閉じる</button>
      </div>
    </div>`);
  }

  // ⚔攻撃ボタン：撃てるワザがあれば攻撃（複数なら選択）、足りなければ理由を表示
  function onAttackButton() {
    const G = E.GAME; const p = E.cur();
    if (G.current !== viewer() || G.players[G.current].isAI) { toast('自分の番に攻撃できます', true); return; }
    const a = p.active;
    if (!a) { toast('先鋒がいません', true); return; }
    if (a.status.includes('金縛り') || a.status.includes('油断')) { toast(`${a.card.name}は動けません（${a.status.join('・')}）`, true); return; }
    const usable = a.card.moves.map((m, i) => ({ m, i })).filter(x => a.energy >= x.m.cost);
    if (!usable.length) {
      const cheapest = Math.min.apply(null, a.card.moves.map(m => m.cost));
      toast(`兵糧が足りません。「兵糧を送る」で先鋒に兵糧を付けてください（あと${cheapest - a.energy}）`, true);
      return;
    }
    showMoveChooser(a, usable);
  }
  function showMoveChooser(a, usable) {
    const p = E.cur();
    const opp = E.opp();
    const rows = usable.map(({ m, i }) => {
      const prev = damagePreview(p, opp, a, m);
      const after = opp.active ? Math.max(0, E.curHp(opp.active) - prev.total) : 0;
      return `<article class="move-pick">
        <div class="mp-main">
          <span class="mp-cost">兵糧 ${m.cost}消費</span>
          <span class="mp-name">${esc(m.name)}</span>
          <span class="mp-dmg">${prev.variable ? `${prev.certainTotal}-${prev.maxTotal}` : prev.total}</span>
        </div>
        <div class="mp-calc">${previewPartsHTML(prev)}</div>
        ${opp.active ? `<div class="mp-result">${esc(opp.active.card.name)} 兵力 ${E.curHp(opp.active)} → ${after}</div>` : ''}
        ${m.text ? `<div class="mp-text">追加効果：${esc(m.text)}</div>` : ''}
        <button class="mp-fire" data-act="move" data-i="${i}">放つ</button>
      </article>`;
    }).join('');
    overlay(`<div class="movechooser">
      <div class="ov-h">${esc(a.card.name)} — 攻撃予測</div>
      <div class="ov-note">コスト、ダメージの理由、攻撃後の兵力を確認してから放てます。攻撃すると兵糧を消費し、番が終了します。</div>
      <div class="mp-list">${rows}</div>
      <div class="ov-foot"><button class="btn ghost" data-act="closeoverlay">やめる</button></div>
    </div>`);
  }

  // -------- 描画 --------
  function render() {
    const G = E.GAME; if (!G) { showStart(); return; }
    root.innerHTML =
      `<div class="rail">${railHTML(G)}</div>` +
      `<div class="board">${boardHTML(G)}</div>` +
      `<aside class="side">${panelHTML(G)}</aside>`;
    processFx(G);
    if (G.phase === 'setup' && E.setupCurrent()) { showSetup(G); return; }
    if (G.winner) { showGameOver(G); return; }
    if (G.pendingPromote && G.pendingPromote === viewer()) { showPromoteChooser(G); return; } // 先鋒が討たれた→誰を出すか選ぶ
    // 布陣/開始系のオーバーレイが残っていたら閉じる（命令メニュー・遊び方は閉じない）
    const o = $('#overlay');
    if (o && o.style.display === 'flex' && (o.querySelector('.setup') || o.querySelector('.start'))) hideOverlay();
  }

  function boardHTML(G) {
    const v = viewer(); const me = G.players[v], op = G.players[other(v)];
    const myTurn = G.current === v;
    const isSpec = uiMode === 'spectate';
    const named = isSpec || uiMode === 'hotseat';
    const cur = G.players[G.current];
    let turnTxt;
    if (isSpec) turnTxt = `観戦：${esc(cur.name)}の番`;
    else if (uiMode === 'hotseat') turnTxt = `${esc(cur.name)}の番`;
    else turnTxt = myTurn ? 'あなた（軍師）の番' : '敵軍の番';
    return `
      <div class="battle-bg"><div class="bg-castle"></div><div class="bg-banner"></div><div class="bg-ring"></div></div>
      <div class="battle-hud">
        <section class="hud-strip enemy-hud">${commanderHUD(op, named ? op.name : '敵軍', false)}</section>
        <section class="turn-orb"><span>第${G.turn}手番</span><b class="${myTurn || isSpec ? 'me' : 'op'}">${turnTxt}</b></section>
        <section class="hud-strip player-hud">${commanderHUD(me, named ? me.name : 'あなた', true)}</section>
      </div>

      <div class="playarea battle-table">
        <div class="field enemy">
          <div class="rowline enemy-line"><span class="zone-label label">${named ? esc(op.name) : '敵'}・後備え</span><div class="bench">${benchHTML(op, false)}</div>${honjinHTML(op)}</div>
          <div class="rowactive enemy-active">${activeHTML(op, false)}</div>
        </div>

        <div class="midline">
          ${stadiumHTML(G)}
          ${actionForecastHTML(me, op, myTurn, isSpec)}
        </div>

        <div class="field mine">
          <div class="rowactive player-active">${activeHTML(me, true)}</div>
          <div class="rowline player-line"><span class="zone-label label">${named ? esc(me.name) : '自'}・後備え</span><div class="bench">${benchHTML(me, true)}</div>${honjinHTML(me)}</div>
        </div>
      </div>

      <div class="handbar">
        <div class="hand">${handHTML(me, isSpec)}</div>
      </div>

      ${energyReserveHTML(me, myTurn, isSpec)}`;
  }

  function commanderHUD(p, label, mine) {
    return `<span class="hud-side">${mine ? '軍師' : '敵軍'}</span>
      <strong>${esc(label)}</strong>
      <span>陥落 ${p.warlordsLost}/3</span>
      <span>兵糧 ${p.energy}</span>
      <span>脳容量 ${p.context}/${p.contextMax}</span>
      <span>山札 ${p.deck.length}</span>
      ${p.tasks.length ? `<span>命令 ${p.tasks.length}/${p.parallelMax}</span>` : ''}`;
  }

  function actionForecastHTML(me, op, myTurn, isSpec) {
    const G = E.GAME;
    if (isSpec) return `<section class="action-forecast"><span class="af-label">観戦中</span><strong>${esc(G.players[G.current].name)}の判断を再生中</strong><p>行動、コスト、ダメージは戦況ログと盤面エフェクトで追えます。</p></section>`;
    if (!myTurn) return `<section class="action-forecast wait"><span class="af-label">敵軍の番</span><strong>相手の行動を確認</strong><p>被弾、命令完成、状態異常の原因がここに表示されます。</p></section>`;
    if (mode === 'attach') return `<section class="action-forecast"><span class="af-label">兵糧</span><strong>送る武将を選択</strong><p>在庫を1消費し、選んだ武将の兵糧を+1します。先鋒は今手番2つ、後備えと本陣は1つまで。</p></section>`;
    if (mode === 'retreat') return `<section class="action-forecast"><span class="af-label">退き口</span><strong>交代する後備えを選択</strong><p>先鋒の退き口コストを兵糧で支払い、状態異常を解除します。</p></section>`;
    const a = me.active;
    if (!a) return `<section class="action-forecast warn"><span class="af-label">先鋒なし</span><strong>武将を前線へ</strong><p>手札からたね武将を先鋒へ出してください。</p></section>`;
    const usable = a.card.moves.map((m, i) => ({ m, i, prev: damagePreview(me, op, a, m) })).filter(x => a.energy >= x.m.cost);
    if (!usable.length) {
      const cheapest = Math.min.apply(null, a.card.moves.map(m => m.cost));
      return `<section class="action-forecast warn"><span class="af-label">攻撃不可</span><strong>兵糧が不足</strong><p>${esc(a.card.name)}にあと${Math.max(0, cheapest - a.energy)}兵糧送ると攻撃できます。</p></section>`;
    }
    const best = usable.slice().sort((x, y) => y.prev.total - x.prev.total)[0];
    return `<section class="action-forecast ready">
      <span class="af-label">攻撃予測</span>
      <strong>${esc(best.m.name)}：${best.prev.total}ダメージ</strong>
      <p>${previewPartsText(best.prev)} / コスト 兵糧${best.m.cost}</p>
    </section>`;
  }

  function energyReserveHTML(p, myTurn, isSpec) {
    const usable = myTurn && !isSpec && !p.isAI && p.energy > 0;
    const pips = p.energy > 0
      ? Array.from({ length: Math.min(p.energy, 8) }, () => '<i></i>').join('')
      : '<i class="empty"></i>';
    return `<button class="energy-reserve ${usable ? 'ready' : ''} ${mode === 'attach' ? 'on' : ''}"
        data-act="energyReserve" draggable="${usable ? 'true' : 'false'}" title="兵糧の在庫。先鋒には1ターン2つまで、後備えと本陣には1つまで送れる。毎ターン届き、采配でも増やせる">
      <span class="er-label label">兵糧</span>
      <span class="er-sack"><i></i><i></i></span>
      <b>${p.energy}</b>
      <span class="er-pips">${pips}</span>
      <small>${mode === 'attach' ? '送る武将を選択' : 'ドラッグで補給'}</small>
    </button>`;
  }

  // 左下の小型システム操作
  function railHTML(G) {
    if (uiMode === 'spectate') {
      return `<div class="rail-title label">観戦</div>
        <div class="rail-spec">AI対AI${G.winner ? '・決着' : '・自動進行中'}<br><small>両者の手は戦記で確認</small></div>
        ${G.winner ? '<button class="railbtn end" data-act="newgame">もう一戦</button>' : ''}
        ${bgmButtonHTML()}
        <button class="railbtn ghost" data-act="newgame">モード選択へ</button>`;
    }
    return `<button class="railbtn end" data-act="endturn">番終了</button>
      <button class="railbtn ghost" data-act="sfxtoggle">${sfxOn ? '音 ON' : '音 OFF'}</button>
      ${bgmButtonHTML()}
      <button class="railbtn ghost" data-act="tut">遊び方</button>
      <button class="railbtn ghost" data-act="newgame">戻る</button>`;
  }

  // プレイヤーの資源帯（陥落・兵糧の在庫・脳容量・山札/捨札）
  function playerStripHTML(p, mine) {
    return `<div class="strip ${mine ? 'mine' : 'enemy'}">
      <span class="kubi" title="この陣営が討たれた数。3体討たれると敗北（大名が3体目）">陥落 <b>${p.warlordsLost}</b>/3</span>
        <span class="res hei" title="兵糧の在庫。先鋒には1ターン2つまで、後備えと本陣には1つまで送れる。毎ターン届き、采配でも増やせる">兵糧の在庫 <b>${p.energy}</b></span>
      <span class="res ctx" title="脳容量（コンテキスト）。軍師の命令の燃料。回復は控えめなので“ここぞ”で使う">脳容量 <b>${p.context}</b>/${p.contextMax}</span>
      <span class="res deck" title="まだ動員していない手勢（山札）">山札 ${p.deck.length}</span>
      <span class="res disc" title="使い終えた札・討死した武将の置き場">捨札 ${p.discard.length}</span>
      ${p.tasks.length ? `<span class="res task">命令 ${p.tasks.length}/${p.parallelMax}</span>` : ''}
    </div>`;
  }

  function activeHTML(p, mine) {
    const inst = p.active;
    const sel = (mode === 'attach' || mode === 'equip' || mode === 'evolve' || mode === 'trainer') && mine;
    if (!inst) return `<div class="slot active empty ${mine && mode === 'place' ? 'target' : ''}" data-act="slot" data-slot="active">先鋒（空）</div>`;
    // 自分の先鋒は大きくワザ付き、相手の先鋒は小型（盤を縦に収める）
    return cardHTML(inst, { big: mine, mine, owner: p, selectable: sel || (mine && mode === 'idle'), showMoves: false });
  }
  function benchHTML(p, mine) {
    let h = '';
    const selectable = mine && (mode === 'attach' || mode === 'equip' || mode === 'evolve' || mode === 'trainer' || mode === 'retreat');
    for (let i = 0; i < 3; i++) {
      const inst = p.bench[i];
      if (!inst) { h += `<div class="slot bench empty ${mine && mode === 'place' ? 'target' : ''}" data-act="slot" data-slot="${i}">後備え${i + 1}</div>`; }
      else h += cardHTML(inst, { mine, owner: p, selectable });
    }
    return h;
  }

  // 本陣の大名（前線が全滅すると最後の砦として出陣）。狙撃でダメージは受ける。
  function honjinHTML(p) {
    const inst = p.honjin;
    if (!inst) return `<div class="honjin gone" title="大名は出陣済み・または討死">本陣<br><small>${p.daimyoFallen ? '大名 討死' : '出陣済'}</small></div>`;
    const c = inst.card; const hp = E.curHp(inst), mhp = E.maxHp(inst);
    const pct = Math.max(0, Math.round(hp / mhp * 100));
    const fac = FACTIONS[c.faction] || FACTIONS['無所属'];
    return `<div class="honjin" style="--fac:${fac.color};--facsoft:${fac.soft};${artVars(c)}" data-act="honjin" data-uid="${inst.uid}" title="本陣の大名。前線（先鋒＋後備え）が全滅すると出陣する。討たれたら負け。">
      <span class="hj-art"><img src="${esc(c.art || '')}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('noart')"><span>${esc(c.name)}</span></span>
      <span class="hj-label label">本陣・大名</span>
      <span class="hj-name nowrap">${esc(c.name)}</span>
      <span class="hj-hp">兵力 <b>${hp}</b>/${mhp}</span>
      <span class="hj-bar"><span style="width:${pct}%"></span></span>
    </div>`;
  }

  function stadiumHTML(G) {
    if (!G.stadium) return `<div class="stadium none">陣形：なし</div>`;
    const c = G.stadium.inst.card;
    return `<div class="stadium"><span class="label">陣形</span> <b>${esc(c.name)}</b> — <span class="st-txt">${esc(c.text)}</span></div>`;
  }

  // 今かかっている効果（バフ/デバフ/装備/陣形）を [ラベル, 種別] の配列で返す
  function activeEffects(inst, owner, isActive) {
    const c = inst.card; const chips = [];
    if (inst.atkBuff) chips.push(['ワザ+' + inst.atkBuff, 'buff']);
    if (owner && owner.buffs.allAtk) chips.push(['全軍+' + owner.buffs.allAtk, 'buff']);
    if (isActive && owner && owner.buffs.nextAttack) chips.push(['次撃+' + owner.buffs.nextAttack, 'buff']);
    if (isActive && owner && owner.buffs.shield) chips.push(['結界 被-' + owner.buffs.shield, 'def']);
    const st = E.GAME.stadium && E.GAME.stadium.inst.card.effect;
    if (st) {
      if (st.plainsCavalry && c.heisyu === '騎') chips.push(['陣形+' + st.plainsCavalry, 'buff']);
      if (st.rainGuns && c.heisyu === '砲') chips.push(['陣形' + st.rainGuns, 'debuff']);
      if (st.gunline && c.heisyu === '砲') chips.push(['陣形+' + st.gunline, 'buff']);
      if (st.spearWall && c.heisyu === '槍') chips.push(['陣形+' + st.spearWall, 'buff']);
      if (st.archerNest && c.heisyu === '弓') chips.push(['陣形+' + st.archerNest, 'buff']);
      if (st.fortify && isActive) chips.push(['陣形 被-' + st.fortify, 'def']);
    }
    inst.status.forEach(s => chips.push([s, 'debuff']));
    if (inst.equip) chips.push(['装備:' + inst.equip.card.name, 'equip']);
    return chips;
  }

  function damagePreview(p, opp, attacker, move) {
    const parts = [{ label: '基本', value: move.dmg || 0 }];
    if (attacker.atkBuff) parts.push({ label: '添削', value: attacker.atkBuff });
    if (p.buffs.allAtk) parts.push({ label: '家訓', value: p.buffs.allAtk });
    if (p.buffs.nextAttack) parts.push({ label: '次攻撃', value: p.buffs.nextAttack });
    if (attacker.equip && attacker.equip.effect && attacker.equip.effect.atk) {
      parts.push({ label: attacker.equip.card.name, value: attacker.equip.effect.atk });
    }
    if (opp.active && opp.active.card.weakness && opp.active.card.weakness === attacker.card.faction) {
      parts.push({ label: '相性', value: 20 });
    }
    const st = E.GAME.stadium && E.GAME.stadium.inst.card.effect;
    if (st) {
      if (st.plainsCavalry && attacker.card.heisyu === '騎') parts.push({ label: '陣形・平野', value: st.plainsCavalry });
      if (st.rainGuns && attacker.card.heisyu === '砲') parts.push({ label: '陣形・大雨', value: st.rainGuns });
      if (st.gunline && attacker.card.heisyu === '砲') parts.push({ label: '陣形・鉄砲陣地', value: st.gunline });
      if (st.spearWall && attacker.card.heisyu === '槍') parts.push({ label: '陣形・山道', value: st.spearWall });
      if (st.archerNest && attacker.card.heisyu === '弓') parts.push({ label: '陣形・矢倉', value: st.archerNest });
    }
    [p.active, ...p.bench].forEach(inst => {
      if (!inst || !inst.card.ability) return;
      if (inst.card.ability.name === '風林火山' && attacker.card.heisyu === '騎') parts.push({ label: '風林火山', value: 10 });
    });
    if (attacker.card.ability) {
      if (attacker.card.ability.name === '忍耐' && attacker.damage >= 100) parts.push({ label: '忍耐', value: 40 });
      if (attacker.card.ability.name === '毘沙門天') parts.push({ label: '毘沙門天(軍配成功)', value: 30, chance: true });
    }

    const variable = parts.some(x => x.chance);
    const rawCertain = parts.filter(x => !x.chance).reduce((s, x) => s + x.value, 0);
    const rawMax = parts.reduce((s, x) => s + x.value, 0);
    const defense = [];
    if (st && st.fortify) defense.push({ label: '陣形・堅城', value: -st.fortify });
    if (opp.buffs.shield > 0) defense.push({ label: '結界', value: -opp.buffs.shield });
    const defTotal = defense.reduce((s, x) => s + x.value, 0);
    const certainTotal = Math.max(0, rawCertain + defTotal);
    const maxTotal = Math.max(0, rawMax + defTotal);
    return {
      parts,
      defense,
      total: variable ? maxTotal : certainTotal,
      certainTotal,
      maxTotal,
      variable,
      rawCertain,
      rawMax,
    };
  }

  function previewPartsText(prev) {
    const values = prev.parts.concat(prev.defense).map(p => `${p.label}${p.value >= 0 ? '+' : ''}${p.value}${p.chance ? '?' : ''}`);
    return values.join(' / ');
  }

  function previewPartsHTML(prev) {
    const all = prev.parts.concat(prev.defense);
    return all.map(p => `<span class="calc-chip ${p.value < 0 ? 'minus' : 'plus'}">${esc(p.label)} ${p.value >= 0 ? '+' : ''}${p.value}${p.chance ? ' 成功時' : ''}</span>`).join('');
  }

  // 武将カード
  function cardHTML(inst, o) {
    o = o || {};
    const c = inst.card;
    const fac = FACTIONS[c.faction] || FACTIONS['無所属'];
    const hp = E.curHp(inst), mhp = E.maxHp(inst);
    const hpPct = Math.max(0, Math.round(hp / mhp * 100));
    const legend = c.legend ? 'legend' : '';
    const rankClass = c.stage === 0 ? 'rank-basic' : (c.stage === 1 ? 'rank-mid' : 'rank-dai');
    const targetable = o.selectable ? 'targetable' : '';
    const energyPips = inst.energy > 0 ? '●'.repeat(Math.min(inst.energy, 6)) : '○';
    const chips = activeEffects(inst, o.owner, !!o.big);
    const chipsHTML = chips.map(([t, k]) => `<span class="eff-chip ${k}">${esc(t)}</span>`).join('');
    const moves = (o.showMoves && o.mine)
      ? `<div class="moves">${c.moves.map((m, i) => {
          const can = o.mine && inst.energy >= m.cost && E.GAME.current === viewer() && !E.GAME.players[E.GAME.current].isAI;
          const opp = o.owner ? E.GAME.players[other(o.owner.id)] : null;
          const prev = (o.owner && opp) ? damagePreview(o.owner, opp, inst, m) : null;
          const pips = '●'.repeat(Math.min(inst.energy, m.cost)) + '○'.repeat(Math.max(0, m.cost - inst.energy));
          return `<button class="move ${can ? 'ready' : 'dim'}" ${can ? `data-act="attack"` : ''} title="${can ? '攻撃予測を開く' : '必要な兵糧が足りません'}">
            <span class="cost" title="必要な兵糧（●=済 ○=不足）">${pips}</span>
            <span class="mname nowrap">${esc(m.name)}</span>
            <span class="dmg">${prev ? prev.total : (m.dmg || '')}</span>
            ${prev && prev.variable ? '<span class="chance">最大</span>' : ''}</button>`;
        }).join('')}</div>` : '';
    return `<div class="card warlord ${o.big ? 'big' : ''} ${legend} ${rankClass} ${targetable}"
        style="--fac:${fac.color};--facsoft:${fac.soft};${artVars(c)}"
        data-act="warlord" data-uid="${inst.uid}">
      <div class="c-top">
        <span class="c-rank label">${esc(c.rank)}</span>
        <span class="c-name nowrap">${esc(c.name)}</span>
        <span class="c-hp">兵力 <b>${hp}</b></span>
      </div>
      <div class="c-art" title="${esc(c.flavor || '')}">
        <img src="${esc(c.art || '')}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('noart')">
        <span class="c-art-fallback">${esc(c.name)}</span>
        <span class="c-fac label">${esc(c.faction)}</span>
      </div>
      <div class="c-hpbar"><span style="width:${hpPct}%"></span></div>
      ${c.ability ? `<div class="c-ability clip"><b>特性 ${esc(c.ability.name)}</b><span class="nowrap2">${esc(c.ability.text)}</span></div>` : ''}
      <div class="c-foot">
        <span class="energy" title="この武将に蓄えた兵糧（ワザの燃料）">兵糧 <b>${inst.energy}</b> ${energyPips}</span>
        ${c.weakness ? `<span class="weak">相性▽${esc(c.weakness)}</span>` : ''}
        <span class="kubi-mini">首級${c.kubi}</span>
      </div>
      ${chipsHTML ? `<div class="c-effects">${chipsHTML}</div>` : ''}
      ${moves}
    </div>`;
  }

  // 手札
  function handHTML(p, readonly) {
    if (!p.hand.length) return `<div class="hand-empty">手札なし</div>`;
    return p.hand.map((inst, i) => {
      const c = inst.card; const sel = i === selHand ? 'sel' : '';
      const fac = FACTIONS[c.faction] || FACTIONS['無所属'];
      let kind = '武将', kc = 'k-w';
      if (c.type === 'equip') { kind = '装備'; kc = 'k-e'; }
      else if (c.type === 'trainer') { kind = c.kind === 'support' ? '采配' : '軍需'; kc = 'k-t'; }
      else if (c.type === 'stadium') { kind = '陣形'; kc = 'k-s'; }
      else if (c.stage > 0) { kind = c.stage === 2 ? '大名' : '侍大将'; kc = 'k-d'; }
      const thumb = c.art
        ? `<span class="hc-thumb" style="--fac:${fac.color};${artVars(c)}"><img src="${esc(c.art)}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('noimg')"><span class="hc-thumb-fb">${esc(c.name)}</span></span>`
        : `<span class="hc-thumb noimg ${kc}" style="--fac:${fac.color}"><span class="hc-thumb-fb">${kind}</span></span>`;
      let eff;
      if (c.type === 'warlord') eff = c.evolvesFrom ? `兵力${c.hp}・${esc(c.evolvesFrom)}から出世` : `兵力${c.hp}・${esc(c.moves[0].name)}`;
      else eff = esc(c.text || '');
      // レア演出：侍大将＝✦／大名＝✦✦（金の光沢）
      const rare = (c.type === 'warlord' && c.stage === 2) ? 'rare2 gleam' : (c.type === 'warlord' && c.stage === 1) ? 'rare gleam' : '';
      const mark = (c.type === 'warlord' && c.stage === 2) ? '<span class="rare-mark">✦✦</span>' : (c.type === 'warlord' && c.stage === 1) ? '<span class="rare-mark">✦</span>' : '';
      return `<div class="handcard ${sel} ${rare} ${readonly ? 'ro' : ''}" ${readonly ? '' : `data-act="hand" data-i="${i}"`} style="--fac:${fac.color}">
        ${mark}${thumb}
        <span class="hc-kind ${kc} label">${kind}</span>
        <span class="hc-name nowrap">${esc(c.name)}</span>
        <span class="hc-eff">${eff}</span>
      </div>`;
    }).join('');
  }

  // -------- サイドパネル（軍師の陣：裏のメタ情報）--------
  function panelHTML(G) {
    const v = viewer(); const me = G.players[v], op = G.players[other(v)];
    const meLabel = uiMode === 'cpu' ? 'あなた' : me.name;
    const opLabel = uiMode === 'cpu' ? '敵軍' : op.name;
    return `
      <div class="panel-h label">軍師の陣 — 裏の戦況</div>
      ${ctxMeter(meLabel, me)}
      ${op.noAgent ? `<div class="ctx-row"><span class="ctx-name">${esc(opLabel)}</span><span class="noagent">軍師なし・兵力で攻める</span></div>` : ctxMeter(opLabel, op)}
      ${uiMode === 'spectate' || me.noAgent ? '' : `<button class="side-command" data-act="cmdmenu">
        <span>軍師の命令</span>
        <small>脳容量 ${me.context}/${me.contextMax} ・ 発注 ${me.tasks.length}/${me.parallelMax}</small>
      </button>`}
      <div class="panel-sec label">発注中の命令</div>
      ${tasksHTML(me, meLabel)}
      ${op.noAgent ? '' : tasksHTML(op, opLabel)}
      <div class="panel-sec label">Claude Code修行</div>
      ${learningHTML(me)}
      <div class="panel-sec label">ワークツリー（指揮系統）</div>
      ${worktreeHTML(me, meLabel)}
      <div class="panel-sec label">戦況メタ</div>
      ${metaHTML(G)}
      <div class="panel-sec label">戦記</div>
      <div class="logbox">${G.log.slice(0, 12).map(l => `<div class="logline ${l.who === 'p1' ? 'me' : 'op'}">${esc(l.msg)}</div>`).join('')}</div>
    `;
  }
  function ctxMeter(name, p) {
    const pct = Math.round(p.context / p.contextMax * 100);
    return `<div class="ctx-row"><span class="ctx-name">${name}</span>
      <span class="ctx-bar"><span style="width:${pct}%"></span></span>
      <span class="ctx-num">${p.context}/${p.contextMax}</span></div>`;
  }
  function tasksHTML(p, who) {
    if (!p.tasks.length) return `<div class="task-none">${who}：発注なし</div>`;
    return p.tasks.map(t => {
      const pct = Math.round(t.progress / t.turns * 100);
      const cc = CATEGORY_COLOR[t.cmd.category] || 'var(--sumi)';
      return `<div class="taskrow" style="--cc:${cc}">
        <div class="task-h"><span class="task-cmd">${esc(t.cmd.cmd)}</span><span class="task-name">${esc(t.cmd.name)}</span><span class="task-who ${p.id}">${who}</span></div>
        <div class="task-bar"><span style="width:${pct}%"></span></div>
        <div class="task-sub">残り ${t.turns - t.progress} 手番 ・ ${esc(t.agentType)}</div>
        ${t.cmd.learn ? `<div class="task-learn">修行：${esc(t.cmd.learn.title)} — ${esc(t.cmd.learn.practice)}</div>` : ''}
      </div>`;
    }).join('');
  }
  function learningHTML(p) {
    const lessons = p.tasks.filter(t => t.cmd.learn).map(t => t.cmd.learn);
    if (!lessons.length) {
      return `<div class="learnbox">
        <b>いまの型</b>
        <span>命令を選ぶ前に「何を調べるか」「何を実装するか」「どう検証するか」を分ける。</span>
        <small>Claude Codeは、曖昧な願いより具体的な任務で強く働く。</small>
      </div>`;
    }
    return `<div class="learnbox active">${lessons.slice(0, 2).map(l => `
      <div class="learnitem">
        <b>${esc(l.title)}</b>
        <span>${esc(l.real)}</span>
      </div>`).join('')}</div>`;
  }
  function worktreeHTML(p, label) {
    const lead = esc(label || 'あなた');
    if (!p.tasks.length) return `<div class="wt-none">軍師（${lead}）<br><span class="wt-idle">…命令待ち</span></div>`;
    let h = `<div class="wt"><div class="wt-root">軍師（${lead}）</div>`;
    p.tasks.forEach(t => {
      h += `<div class="wt-cmd">└─ <b>${esc(t.cmd.cmd)}</b> ${esc(t.cmd.name)} <span class="wt-agent">〔${esc(t.agentType)}〕</span> ${bar(t.progress / t.turns)}</div>`;
      t.tree.forEach((s, i) => {
        const last = i === t.tree.length - 1;
        h += `<div class="wt-sub">　${last ? '└─' : '├─'} ${s.worktree ? '⌖' : '・'}${esc(s.name)}${s.worktree ? '<span class="wt-tag">別働隊の陣地</span>' : ''} ${s.done ? '<span class="wt-done">完了</span>' : bar(s.progress / 100)}</div>`;
      });
    });
    h += `</div>`;
    return h;
  }
  function bar(r) {
    const n = Math.round(clamp(r, 0, 1) * 5);
    return `<span class="minibar">${'▮'.repeat(n)}${'▯'.repeat(5 - n)}</span>`;
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function metaHTML(G) {
    const rows = [];
    if (G.stadium) rows.push(`陣形：<b>${esc(G.stadium.inst.card.name)}</b>`);
    ['p1', 'p2'].forEach(pid => {
      const p = G.players[pid]; const a = p.active;
      if (a && a.status.length) rows.push(`${pid === 'p1' ? '自' : '敵'}先鋒：<b class="st">${a.status.map(esc).join('・')}</b>`);
      if (p.buffs.shield) rows.push(`${pid === 'p1' ? '自' : '敵'}：結界 -${p.buffs.shield}`);
      if (p.buffs.speedUp) rows.push(`${pid === 'p1' ? '自' : '敵'}：思考力UP（命令2段階/手番）`);
    });
    return `<div class="metabox">${rows.length ? rows.map(r => `<div>${r}</div>`).join('') : '特になし'}</div>`;
  }

  // -------- 命令メニュー（複数選んでまとめて発令）--------
  function cmdById(id) { return COMMANDS.find(c => c.id === id); }
  // 完成時の効果をひと目で分かる短い言葉に
  function effSummary(cmd) {
    const e = cmd.effect || {}; const a = e.amount || 0;
    switch (e.kind) {
      case 'buffNextAttack': return `次の攻撃 +${a}`;
      case 'buffActivePersistent': return `先鋒のワザ +${a}（持続）`;
      case 'buffAllPersistent': return `全軍のワザ +${a}（持続）`;
      case 'spyStrike': return `相手の陣形を破壊＋先鋒に ${a}`;
      case 'directDamage': return `相手先鋒に ${a} ダメージ`;
      case 'siege': return `先鋒に ${a}＋後方全員に ${e.splash}`;
      case 'restoreContext': return `脳容量 +${a}${e.energy ? `／兵糧 +${e.energy}` : ''}`;
      case 'shield': return `次の被ダメージ -${a}`;
      case 'parallelUp': return `命令の並列上限 +${a}`;
      case 'fullHeal': return `先鋒の兵力を全回復`;
      case 'speedUp': return `以後 命令が毎ターン2倍進行`;
      default: return cmd.name;
    }
  }
  function learnSummary(cmd) {
    return cmd.learn ? `${cmd.learn.title}：${cmd.learn.practice}` : '';
  }
  function cartCost() { return cmdCart.reduce((s, id) => { const c = cmdById(id); return s + (c ? c.contextCost : 0); }, 0); }

  function openCmdMenu() {
    const G = E.GAME; const p = E.cur();
    if (G.current !== viewer() || G.players[G.current].isAI) { toast('自分の番に発注できます', true); return; }
    if (p.noAgent) { toast('この陣営に軍師はいません（兵力で攻めます）', true); return; }
    renderCmdMenu();
  }

  function toggleCmd(id) {
    const p = E.cur(); const cmd = cmdById(id); if (!cmd) return;
    const i = cmdCart.indexOf(id);
    if (i >= 0) { cmdCart.splice(i, 1); renderCmdMenu(); return; }
    if (p.tasks.length + cmdCart.length >= p.parallelMax) { toast(`同時に走らせられる命令は${p.parallelMax}個までです（/agents で増やせます）`, true); return; }
    if (p.context - cartCost() < cmd.contextCost) { toast('脳容量（コンテキスト予算）が足りません', true); return; }
    cmdCart.push(id); renderCmdMenu();
  }

  function issueCart() {
    if (!cmdCart.length) return;
    const ids = cmdCart.slice(); cmdCart = [];
    let n = 0;
    ids.forEach(id => { const r = E.issueCommand(id); if (r && r.ok) n++; else if (r) toast(r.msg, true); });
    hideOverlay();
    if (n) toast(`${n}件の命令をまとめて発令。家臣が動き出した。`);
  }

  function renderCmdMenu() {
    const p = E.cur();
    const ctxLeft = p.context - cartCost();
    const slotsLeft = p.parallelMax - p.tasks.length - cmdCart.length;
    const cards = COMMANDS.map(cmd => {
      const inCart = cmdCart.includes(cmd.id);
      const canAdd = !inCart && slotsLeft > 0 && ctxLeft >= cmd.contextCost;
      const cc = CATEGORY_COLOR[cmd.category] || 'var(--sumi)';
      const cls = inCart ? 'picked' : (canAdd ? '' : 'cant');
      const clickable = inCart || canAdd;
      return `<div class="cmdcard ${cls}" ${clickable ? `data-act="cmdtoggle" data-id="${cmd.id}"` : ''} style="--cc:${cc}">
        ${inCart ? '<span class="cc-check">✓ 選択中</span>' : ''}
        <div class="cc-top"><span class="cc-cat label">${esc(cmd.category)}</span><span class="cc-cmd">${esc(cmd.cmd)}</span></div>
        <div class="cc-name">${esc(cmd.name)}</div>
        <div class="cc-eff">効果：${esc(effSummary(cmd))}</div>
        ${cmd.learn ? `<div class="cc-learn">学び：${esc(learnSummary(cmd))}</div>` : ''}
        <div class="cc-desc">${esc(cmd.desc)}</div>
        <div class="cc-foot"><span>脳容量 ${cmd.contextCost}</span><span>完成まで${cmd.turns}手番</span><span>${esc(cmd.agentType)}</span></div>
      </div>`;
    }).join('');
    const cartLine = cmdCart.length
      ? `選択 <b>${cmdCart.length}</b> 件 ／ 消費 脳容量 <b>${cartCost()}</b>（発令後の残り ${ctxLeft}）・並列 ${p.tasks.length + cmdCart.length}/${p.parallelMax}`
      : `命令はまとめて選べます。脳容量 ${p.context}/${p.contextMax}・並列の空き ${slotsLeft} 枠`;
    overlay(`<div class="cmdmenu">
      <div class="ov-h">軍師の命令メニュー　<span class="ov-sub">脳容量 ${p.context}/${p.contextMax}・並列 ${p.tasks.length}/${p.parallelMax}</span></div>
      <div class="ov-note">本物の Claude Code / Codex のコマンドです。<b>複数選んでまとめて発令</b>できます（クリックで選択／もう一度クリックで解除）。発注すると数手番かけて完成し、戦況に効きます。</div>
      <div class="cmdgrid">${cards}</div>
      <div class="cmd-cart">${cartLine}</div>
      <div class="ov-foot">
        <button class="btn ghost" data-act="cmdclear">選択を消す</button>
        <button class="btn cmd ${cmdCart.length ? '' : 'dim'}" ${cmdCart.length ? 'data-act="cmdissue"' : ''}>この命令を発令（${cmdCart.length}件）▶</button>
        <button class="btn ghost" data-act="closeoverlay">閉じる</button>
      </div>
    </div>`);
  }

  // -------- オーバーレイ共通 --------
  function overlay(html) {
    let o = $('#overlay');
    if (!o) { o = document.createElement('div'); o.id = 'overlay'; document.body.appendChild(o); }
    o.innerHTML = `<div class="ov-bg" data-act="closeoverlay"></div><div class="ov-box">${html}</div>`;
    o.style.display = 'flex';
  }
  function hideOverlay() { const o = $('#overlay'); if (o) o.style.display = 'none'; }

  // -------- カード詳細（読んでから使う・誤発動防止）--------
  function cardDetailBody(c, inst, owner, isActive) {
    const fac = FACTIONS[c.faction] || FACTIONS['無所属'];
    if (c.type === 'warlord') {
      const moves = c.moves.map(m => `<div class="cd-move"><span class="cd-cost">${'兵'.repeat(m.cost) || '—'}</span><b class="cd-mn">${esc(m.name)}</b><span class="cd-dmg">${m.dmg || ''}</span>${m.text ? `<div class="cd-mtext">${esc(m.text)}</div>` : ''}</div>`).join('');
      let effHTML = '';
      if (owner) {
        const eff = activeEffects(inst, owner, !!isActive);
        effHTML = eff.length
          ? `<div class="cd-eff"><b>いまの効果：</b>${eff.map(([t, k]) => `<span class="eff-chip ${k}">${esc(t)}</span>`).join('')}</div>`
          : `<div class="cd-eff none">いま付いている効果はありません</div>`;
      }
      const hpNow = inst ? E.curHp(inst) : null, hpMax = inst ? E.maxHp(inst) : c.hp;
      return `<div class="cd-head" style="--fac:${fac.color}">
          <span class="cd-rank label">${esc(c.rank)}・${esc(c.faction)}</span>
          <h3 class="cd-name">${esc(c.name)}</h3>
          <span class="cd-hp">兵力 ${hpMax}${inst ? ` ／ 残 ${hpNow}` : ''}</span></div>
        ${c.ability ? `<div class="cd-ability"><b>特性 ${esc(c.ability.name)}</b>：${esc(c.ability.text)}</div>` : ''}
        <div class="cd-moves">${moves}</div>
        <div class="cd-meta">${c.weakness ? `相性▽${esc(c.weakness)}（+20）　` : ''}退き口：兵${c.retreat}　討たれると首級${c.kubi}</div>
        ${effHTML}
        <div class="cd-evo">${c.evolvesFrom ? `「${esc(c.evolvesFrom)}」から出世した姿` : (c.daimyo ? '大名（本陣に控え、切り札として出陣）' : 'たね（無名の兵士・出世の起点）')}</div>
        <div class="cd-flavor">${esc(c.flavor || '')}</div>`;
    }
    const kind = c.type === 'equip' ? '装備（武将1人に1点）' : c.type === 'stadium' ? '陣形（場に1枚）' : (c.kind === 'support' ? '軍師の采配（1ターンに1枚）' : '軍需品（1ターンに何枚でも）');
    return `<div class="cd-head" style="--fac:${fac.color}"><span class="cd-rank label">${kind}</span><h3 class="cd-name">${esc(c.name)}</h3></div>
      <div class="cd-text">${esc(c.text || '')}</div><div class="cd-flavor">${esc(c.flavor || '')}</div>`;
  }
  function showCardDetail(i) {
    const p = E.cur(); const inst = p.hand[i]; if (!inst) return;
    const c = inst.card;
    const actLabel = c.type === 'warlord' ? (c.stage === 0 ? 'この武将を場に出す' : '出世させる') : c.type === 'equip' ? '装備する' : c.type === 'stadium' ? '陣形を敷く' : 'この采配を使う';
    overlay(`<div class="carddetail">${cardDetailBody(c, inst)}
      <div class="cd-foot">
        <button class="btn cmd" data-act="useHand" data-i="${i}">${actLabel}</button>
        <button class="btn ghost" data-act="closeoverlay">閉じる</button>
      </div></div>`);
  }
  function showWarlordDetail(uid) {
    let inst = null, owner = null, isActive = false;
    ['p1', 'p2'].forEach(pid => {
      const pl = E.GAME.players[pid];
      if (pl.active && pl.active.uid === uid) { inst = pl.active; owner = pl; isActive = true; }
      pl.bench.forEach(b => { if (b && b.uid === uid) { inst = b; owner = pl; } });
      if (pl.honjin && pl.honjin.uid === uid) { inst = pl.honjin; owner = pl; }
    });
    if (!inst) return;
    overlay(`<div class="carddetail">${cardDetailBody(inst.card, inst, owner, isActive)}
      <div class="cd-foot"><button class="btn ghost" data-act="closeoverlay">閉じる</button></div></div>`);
  }

  // -------- 開幕セットアップ（先鋒/後備えを自分で選ぶ）--------
  function setupClickCard(uid) {
    const p = E.GAME.players[E.setupCurrent() || 'p1'];
    if (!p.active) { do_(E.setupPlace(uid, 'active')); return; }
    const bi = p.bench.indexOf(null);
    if (bi >= 0) { do_(E.setupPlace(uid, bi)); return; }
    toast('先鋒と後備え3枠が埋まっています。要らない札はクリックで手札へ戻せます。', true);
  }
  function cardKindLabel(c) {
    if (c.type === 'equip') return '装備'; if (c.type === 'stadium') return '陣形';
    if (c.type === 'trainer') return c.kind === 'support' ? '采配' : '軍需';
    if (c.stage > 0) return '出世先'; return '武将';
  }
  function setupSlotCard(inst, label) {
    const c = inst.card; const fac = FACTIONS[c.faction] || FACTIONS['無所属'];
    return `<div class="setup-slot filled" style="--fac:${fac.color}" data-act="setupReturn" data-uid="${inst.uid}" title="クリックで手札に戻す">
      <span class="ss-label label">${label}</span>
      <span class="ss-name nowrap">${esc(c.name)}</span>
      <span class="ss-hp">兵力 ${c.hp}</span>
      <span class="ss-x">↩ 手札へ戻す</span>
    </div>`;
  }
  function showSetup(G) {
    const p = G.players[E.setupCurrent() || 'p1'];
    const placedActive = p.active ? setupSlotCard(p.active, '先鋒') : `<div class="setup-slot empty front">先鋒<br><small>（必須・1体）</small></div>`;
    let bench = '';
    for (let i = 0; i < 3; i++) bench += p.bench[i] ? setupSlotCard(p.bench[i], '後備え' + (i + 1)) : `<div class="setup-slot empty">後備え${i + 1}<br><small>（任意）</small></div>`;
    const handCards = p.hand.map(inst => {
      const c = inst.card; const basic = c.type === 'warlord' && c.stage === 0;
      return `<div class="setup-hand-card ${basic ? '' : 'no'}" ${basic ? `data-act="setupCard" data-uid="${inst.uid}"` : ''}>
        <span class="shc-kind label">${basic ? 'たね' : cardKindLabel(c)}</span>
        <span class="shc-name nowrap">${esc(c.name)}</span>
        <span class="shc-sub">${basic ? '兵力' + c.hp + '・先鋒/後備えに伏せる' : '開幕には出せない（戦中に使う）'}</span>
      </div>`;
    }).join('');
    const ready = !!p.active;
    const pid = E.setupCurrent() || 'p1';
    const deckId = pid === 'p1' ? G.p1DeckId : G.p2DeckId;
    const firstTxt = G.firstPlayer === pid ? 'あなたが先攻' : '相手が先攻';
    const who = uiMode === 'hotseat' ? `【${esc(p.name)}】の布陣　` : '開幕の布陣　';
    overlay(`<div class="setup">
      <div class="ov-h">${who}<span class="ov-sub">⚐ 軍配：${firstTxt}</span></div>
      <div class="ov-note">手札5枚が配られました。<b>たね（無名の兵士）</b>を、まず<b class="em">先鋒に1体（必須）</b>、続けて<b>後備えに最大3体（任意）</b>選んでください。誰を最前線に出すかが最初の駆け引きです。置いた札はクリックで手札に戻せます。</div>
      <div class="setup-board">
        <div class="setup-front">${placedActive}</div>
        <div class="setup-bench">${bench}</div>
      </div>
      <div class="setup-hand-label label">配られた手札</div>
      <div class="setup-hand deal">${handCards}</div>
      <div class="ov-foot">
        <button class="btn ghost" data-act="deckguide" data-deck="${deckId}">このデッキの中身を見る</button>
        <button class="btn big ${ready ? '' : 'dim'}" ${ready ? 'data-act="confirmSetup"' : ''}>この布陣で開戦 ▶</button>
      </div>
    </div>`);
  }

  // -------- デッキガイド（中身と効能）--------
  function warlordEffShort(c) {
    const m = c.moves[0];
    let s = `兵力${c.hp}・${m.name}${m.dmg ? '(' + m.dmg + ')' : ''}`;
    if (c.ability) s += `・特性「${c.ability.name}」`;
    if (c.evolvesFrom) s += `／「${c.evolvesFrom}」から出世`;
    return esc(s);
  }
  function showDeckGuide(deckId) {
    const deck = DECKS[deckId]; if (!deck) return;
    const counts = {}; deck.cards.forEach(id => counts[id] = (counts[id] || 0) + 1);
    const ids = Object.keys(counts); const get = id => CARDS[id];
    const pick = fn => ids.filter(id => fn(get(id)));
    const sections = [
      ['武将・たね（無名の兵士＝出世の起点）', pick(c => c.type === 'warlord' && c.stage === 0)],
      ['武将・侍大将（名を挙げた有名武将）', pick(c => c.type === 'warlord' && c.stage === 1)],
      ['装備（武将1人に1点）', pick(c => c.type === 'equip')],
      ['軍需品（1ターンに何枚でも）', pick(c => c.type === 'trainer' && c.kind === 'item')],
      ['軍師の采配（1ターンに1枚）', pick(c => c.type === 'trainer' && c.kind === 'support')],
      ['陣形（場に1枚）', pick(c => c.type === 'stadium')],
    ];
    let rows = '';
    // 本陣の大名（デッキ外・最初から控える切り札）
    const dai = deck.daimyo && CARDS[deck.daimyo];
    if (dai) {
      rows += `<tr class="dg-sec dg-honjin"><td colspan="3">本陣の大名（デッキ外・前線全滅で出陣／討たれたら負け）</td></tr>`;
      rows += `<tr><td class="dg-n">${esc(dai.name)}</td><td class="dg-c">本陣</td><td class="dg-e">${warlordEffShort(dai)}</td></tr>`;
    }
    sections.forEach(([title, list]) => {
      if (!list.length) return;
      rows += `<tr class="dg-sec"><td colspan="3">${esc(title)}</td></tr>`;
      list.forEach(id => {
        const c = get(id);
        const eff = c.type === 'warlord' ? warlordEffShort(c) : esc(c.text || '');
        rows += `<tr><td class="dg-n">${esc(c.name)}</td><td class="dg-c">×${counts[id]}</td><td class="dg-e">${eff}</td></tr>`;
      });
    });
    overlay(`<div class="deckguide">
      <div class="ov-h">${esc(deck.name)} の中身　<span class="ov-sub">全${deck.cards.length}枚＋本陣の大名</span></div>
      <div class="ov-note">このデッキに入っているカードと効能です（MVPでは組み替え不可）。<b>たね→侍大将</b>と出世させて前線を戦い、<b>大名は本陣の切り札</b>として最後に出陣します。</div>
      <div class="dg-wrap"><table class="dg"><thead><tr><th>カード</th><th>枚数</th><th>効能</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ov-foot"><button class="btn" data-act="closeoverlay">閉じる</button></div>
    </div>`);
  }

  function showStart() {
    const decks = ['oda', 'takeda', 'uesugi', 'tokugawa', 'toyotomi'];
    const modes = [['cpu', '対CPU', 'AI軍師と一戦'], ['hotseat', '1人二役', '1台で両陣営を操作']];
    const modeBtns = modes.map(([m, label, desc]) => `<button class="modebtn ${startMode === m ? 'on' : ''}" data-act="setmode" data-mode="${m}"><b>${label}</b><span>${desc}</span></button>`).join('');
    const col = (act, selected) => decks.map(id => {
      const d = DECKS[id];
      return `<button class="deckpick ${id} ${selected === id ? 'on' : ''}" data-act="${act}" data-deck="${id}">
        <b>${esc(d.name)}</b><span>${esc(d.tagline)}</span></button>`;
    }).join('');
    const p1who = startMode === 'hotseat' ? 'プレイヤー1（手前）' : 'あなた';
    const p2who = startMode === 'hotseat' ? 'プレイヤー2（奥）' : '相手';
    overlay(`<div class="start">
      <div class="start-title">戦国AIエージェント<span class="mark-line">TCG</span></div>
      <div class="start-sub">令和から転生した軍師となり、Claude Codeのコマンド感覚を戦場で覚えろ。</div>
      <div class="pick-label label">① 対戦モード</div>
      <div class="moderow">${modeBtns}</div>
      <div class="pick2">
        <div class="pickside">
          <div class="pick-label label">② ${p1who}の家</div>
          <div class="deckcol">${col('setp1', startP1)}</div>
          <button class="btn ghost sm" data-act="deckguide" data-deck="${startP1}">${esc(DECKS[startP1].name)}の中身を見る</button>
        </div>
        <div class="pickside">
          <div class="pick-label label">③ ${p2who}の家</div>
          <div class="deckcol">${col('setp2', startP2)}</div>
          <button class="btn ghost sm" data-act="deckguide" data-deck="${startP2}">${esc(DECKS[startP2].name)}の中身を見る</button>
        </div>
      </div>
      <div class="start-foot">
        <button class="btn big cmd" data-act="startgame" data-p1="${startP1}" data-p2="${startP2}" data-mode="${startMode}">この組み合わせで開戦 ▶</button>
        <button class="btn ghost" data-act="startgame" data-p1="${startP1}" data-p2="${startP2}" data-mode="spectate">観戦（AI対AI）</button>
        <button class="btn ghost" data-act="tut">遊び方</button>
      </div>
    </div>`);
  }

  // 先鋒が討たれたとき、後備えから次の先鋒を選ぶ
  function showPromoteChooser(G) {
    const p = G.players[G.pendingPromote];
    const cards = p.bench.map(b => (b && E.curHp(b) > 0) ? (function () {
      const fac = FACTIONS[b.card.faction] || FACTIONS['無所属'];
      const mv = b.card.moves[0];
      return `<button class="promote-pick" data-act="promote" data-uid="${b.uid}" style="--fac:${fac.color}">
        <span class="pp-name nowrap">${esc(b.card.name)}</span>
        <span class="pp-hp">兵力 ${E.curHp(b)}/${E.maxHp(b)}</span>
        <span class="pp-mv">${esc(mv.name)}${mv.dmg ? '（' + mv.dmg + '）' : ''}・兵糧${b.energy}</span>
      </button>`;
    })() : '').join('');
    overlay(`<div class="promote">
      <div class="ov-h">先鋒が討たれた — 次の先鋒を選ぶ</div>
      <div class="ov-note">後備えから前線に出す武将をクリックしてください（蓄えた兵糧はそのまま引き継ぎます）。</div>
      <div class="promote-row">${cards}</div>
    </div>`);
  }

  function showGameOver(G) {
    const win = G.players[G.winner];
    const youWin = G.winner === 'p1';
    overlay(`<div class="gameover">
      <div class="go-h ${youWin ? 'win' : 'lose'}">${youWin ? '勝鬨！ あなたの勝利' : '無念、敗北'}</div>
      <div class="go-sub">${esc(win.name)}が敵を3たび討ち取り、降した。天下に最も近づいた。</div>
      <button class="btn big" data-act="newgame">もう一戦</button>
    </div>`);
  }

  // -------- チュートリアル --------
  function toggleTutorial() {
    const exist = $('#overlay'); if (exist && exist.style.display === 'flex' && $('.tutorial')) { hideOverlay(); return; }
    overlay(`<div class="tutorial">
      <div class="ov-h">遊び方 — 3分で分かる</div>
      <div class="tut-grid">
        <div class="tut-card"><b>① あなたは「将軍」兼「軍師」</b><p>表で武将を動かして殴り合い（将軍）、裏でAIエージェントに命令を出して武器や有利を作る（軍師）。この二刀流が肝。</p></div>
        <div class="tut-card"><b>② 勝利は「3体討ち取る」</b><p>相手の武将を<b>3体討てば勝ち</b>（自分が3体討たれたら負け）。各家の大名は<b>本陣</b>に控え、味方が<b>2体討たれると3体目の砦として出陣</b>する（本陣にいる間は無傷で、満を持して出てくる）。大名を討てば、それが3体目＝勝ち。</p></div>
        <div class="tut-card"><b>③ 出世（進化）で強くなる</b><p>無名の足軽や騎馬武者が、名を挙げて有名武将（侍大将）へ。手札の出世カードを、その出世元の武将にクリックで重ねる。大名は出世では出ない（本陣の切り札）。</p></div>
        <div class="tut-card"><b>④ 兵糧を送ってワザを撃つ</b><p>右下の兵糧を武将へ送ります（<b>先鋒は1ターン2つまで、後備えと本陣は1つまで</b>）。必要な兵糧がたまったら武将をクリックして攻撃を選びます（攻撃で兵糧を消費し番が終わる）。退き口（交代）は兵糧を消費（種1・侍大将2・大名1）。</p></div>
        <div class="tut-card"><b>⑤ 軍師の命令（裏）</b><p>「軍師の命令」から本物のClaude Code系コマンド（/plan, /code-review など）を発注。各命令には、ゲーム効果とは別に<b>実務で学ぶ型</b>が付いています。</p></div>
        <div class="tut-card"><b>⑥ Claude Code修行</b><p>右パネルで、発注中の命令が「計画」「レビュー」「安全確認」「文脈整理」など何の練習なのか見えます。戦いながら、AIに仕事を渡す順番を覚える設計です。</p></div>
      </div>
      <div class="ov-foot"><button class="btn" data-act="closeoverlay">閉じて始める</button></div>
    </div>`);
  }

})();
