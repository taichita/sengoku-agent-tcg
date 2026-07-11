/* ===========================================================
   ゲームエンジン ── 状態・ターン進行・戦闘・出世・状態異常・命令層
   依存: window.CARDS, window.COMMANDS, window.DECKS（先に読み込む）
   公開: window.Engine
   表（合戦）と裏（軍師の命令）を1つの状態で回す。
   =========================================================== */
(function () {
  let _uid = 1;
  const uid = () => 'u' + (_uid++);
  const coin = () => Math.random() < 0.5; // オモテ=true（軍配）
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function makeInst(cardId) {
    const card = CARDS[cardId];
    if (!card) throw new Error('未知のカード: ' + cardId);
    return {
      uid: uid(), cardId, card,
      damage: 0, energy: 0, equip: null, status: [],
      atkBuff: 0,            // /code-review 等の恒久バフ（この武将に付く）
      hpBonus: 0,            // CPU(敵)の兵力上乗せ（兵力に勝る相手の表現）
      evolvedThisTurn: false, placedThisTurn: false, suppliedThisTurn: 0,
    };
  }
  function maxHp(inst) {
    let hp = inst.card.hp + (inst.hpBonus || 0);
    if (inst.equip && inst.equip.effect && inst.equip.effect.maxhp) hp += inst.equip.effect.maxhp;
    return hp;
  }
  function curHp(inst) { return maxHp(inst) - inst.damage; }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function newPlayer(deckDef, isAI) {
    const deck = shuffle(deckDef.cards.map(makeInst));
    return {
      id: null, name: deckDef.name, faction: deckDef.faction, isAI: !!isAI,
      deck, hand: [], discard: [],
      active: null, bench: [null, null, null],
      honjin: deckDef.daimyo ? makeInst(deckDef.daimyo) : null, // 本陣に控える大名（前線全滅で出陣）
      daimyoFallen: false, warlordsLost: 0,
      energy: 0, context: 100, contextMax: 100,
      kubi: 0, parallelMax: 2, tasks: [], noAgent: false,
      buffs: { nextAttack: 0, allAtk: 0, speedUp: false, shield: 0, planActive: false, counterTrap: 0 },
      supportUsed: false, retreated: false, stadiumUsed: false,
      firstTurnTaken: false,
    };
  }

  // 開幕の手札：5枚、たね（stage0）を最低2枚保証（先鋒＋後備えを最初から組める）、引き直しなし
  function openingHand(p) {
    for (let k = 0; k < 2; k++) {
      const bi = p.deck.findIndex(c => c.card.stage === 0 && c.card.type === 'warlord');
      if (bi >= 0) p.hand.push(p.deck.splice(bi, 1)[0]);
    }
    while (p.hand.length < 5 && p.deck.length) p.hand.push(p.deck.shift());
  }

  const G = { GAME: null, onChange: null };

  function emit() { if (G.onChange) G.onChange(); }
  function log(msg, who) {
    G.GAME.log.unshift({ t: G.GAME.turn, who: who || G.GAME.current, msg });
    if (G.GAME.log.length > 60) G.GAME.log.pop();
  }
  G.log = (m) => log(m);

  G.cur = () => G.GAME.players[G.GAME.current];
  G.opp = () => G.GAME.players[G.GAME.current === 'p1' ? 'p2' : 'p1'];
  G.maxHp = maxHp; G.curHp = curHp;

  G.newGame = function (p1DeckId, p2DeckId, p2IsAI, p1IsAI) {
    _uid = 1;
    const p1 = newPlayer(DECKS[p1DeckId], !!p1IsAI); p1.id = 'p1';
    const p2 = newPlayer(DECKS[p2DeckId], !!p2IsAI); p2.id = 'p2';
    openingHand(p1); openingHand(p2);
    // 対CPU戦（相手AI・自分は人間）では、相手に軍師はつかない＝プレイヤーだけが転生軍師。
    // その代わり敵は兵力に勝る（HP上乗せ）。逆転して倒すストーリーモード。
    const cpuMode = !!p2IsAI && !p1IsAI;
    if (cpuMode) {
      p2.noAgent = true;
      p2.deck.forEach(i => { if (i.card.type === 'warlord') i.hpBonus = 20; });
      if (p2.honjin) p2.honjin.hpBonus = 20; // 本陣の大名も兵力に勝る
    }
    const heads = coin(); // 軍配：オモテならプレイヤー先攻
    G.GAME = {
      turn: 1, current: heads ? 'p1' : 'p2', firstPlayer: heads ? 'p1' : 'p2', coinHeads: heads,
      winner: null, stadium: null, players: { p1, p2 }, log: [],
      phase: 'setup', setupReady: { p1: false, p2: false }, firstMoveDone: false,
      pendingPromote: null, fx: [], // 繰り上げ保留・演出イベントキュー
      p1DeckId, p2DeckId,
    };
    log('合戦開始。軍配を投げる…', 'p1');
    log(heads ? '軍配はオモテ。あなた（軍師）が先攻。' : '軍配はウラ。敵軍が先攻。', 'p1');
    // AIは自動で布陣
    if (p1.isAI) { autoPlaceOpening(p1); G.GAME.setupReady.p1 = true; }
    if (p2.isAI) { autoPlaceOpening(p2); G.GAME.setupReady.p2 = true; }
    maybeBeginPlay();
    emit();
    return G.GAME;
  };

  function maybeBeginPlay() {
    if (G.GAME.phase !== 'setup') return;
    if (G.GAME.setupReady.p1 && G.GAME.setupReady.p2) beginPlay();
  }
  function beginPlay() {
    G.GAME.phase = 'play';
    log('両軍、布陣完了。いざ、開戦！');
    startTurn();
    if (G.cur().isAI && !G.GAME.winner) setTimeout(() => G.aiTurn(), 600);
  }

  // --- 開幕セットアップ：プレイヤーが先鋒/後備えを自分で選ぶ ---
  // 今、手動で布陣すべきプレイヤー（AIでなく、まだ布陣完了していない先頭）
  function setupCurrent() { return ['p1', 'p2'].find(id => !G.GAME.players[id].isAI && !G.GAME.setupReady[id]) || null; }
  G.setupCurrent = setupCurrent;
  G.setupPlace = function (handUid, slot) {
    if (G.GAME.phase !== 'setup') return fail('今は布陣の時間ではありません。');
    const cur = setupCurrent(); if (!cur) return fail('');
    const p = G.GAME.players[cur];
    const i = p.hand.findIndex(c => c.uid === handUid);
    if (i < 0) return fail('その札は手札にありません。');
    const c = p.hand[i];
    if (c.card.type !== 'warlord' || c.card.stage !== 0) return fail('開幕に伏せられるのは、たね（無名の兵士）だけです。');
    if (slot === 'active') { if (p.active) return fail('先鋒はもう決めています。'); p.active = c; }
    else { const bi = +slot; if (p.bench[bi]) return fail('その後備え枠は埋まっています。'); p.bench[bi] = c; }
    p.hand.splice(i, 1);
    return ok();
  };
  G.setupReturn = function (uid) {
    if (G.GAME.phase !== 'setup') return fail('');
    const cur = setupCurrent(); if (!cur) return fail('');
    const p = G.GAME.players[cur];
    if (p.active && p.active.uid === uid) { p.hand.push(p.active); p.active = null; return ok(); }
    const bi = p.bench.findIndex(b => b && b.uid === uid);
    if (bi >= 0) { p.hand.push(p.bench[bi]); p.bench[bi] = null; return ok(); }
    return fail('');
  };
  G.confirmSetup = function () {
    if (G.GAME.phase !== 'setup') return fail('');
    const cur = setupCurrent(); if (!cur) return fail('');
    const p = G.GAME.players[cur];
    if (!p.active) return fail('先鋒を1体、必ず選んでください。');
    G.GAME.setupReady[cur] = true;
    log(`${p.name}の布陣、完了。`);
    maybeBeginPlay(); // 開戦と先攻AIの起動は beginPlay 内で行う
    return ok();
  };

  function autoPlaceOpening(p) {
    const i = p.hand.findIndex(c => c.card.type === 'warlord' && c.card.stage === 0);
    if (i >= 0) { p.active = p.hand.splice(i, 1)[0]; p.active.placedThisTurn = false; }
    // 追加のたねがあればベンチに1体
    const j = p.hand.findIndex(c => c.card.type === 'warlord' && c.card.stage === 0);
    if (j >= 0) { p.bench[0] = p.hand.splice(j, 1)[0]; }
  }

  // ---------------- ターン開始 ----------------
  function startTurn() {
    const p = G.cur();
    // プレイしやすさ優先：毎ターン必ずドロー＋兵站供給（先攻初手も供給する）
    G.GAME.firstMoveDone = true;
    draw(p, 1);
    p.energy += 2; // 兵站の配給。在庫として兵站庫に貯まり、好きな武将へ好きなだけ配れる
    const stObj = G.GAME.stadium;
    const st = stObj && stObj.inst.card.effect;
    if (st && st.supplyLine && stObj.owner === p.id) p.energy += st.supplyLine;
    if (!p.noAgent) p.context = clamp(p.context + 5, 0, p.contextMax); // コンテキストの自然回復は控えめ＝毎ターン義務的に撃つのでなく「ここぞ」で撃つ資源に
    // 特性：兵站役=兵+1 / 豊臣秀吉=context+5 / 直江兼続=回復15
    forEachOwn(p, inst => {
      if (!inst) return;
      const ab = inst.card.ability;
      if (!ab) return;
      if (ab.name === '出世の才' || ab.name === '兵站奉行' || ab.name === '三河武士の統率') p.energy += 1;
      if (ab.name === '人たらし') p.context = clamp(p.context + 5, 0, p.contextMax);
      if (ab.name === '軍師官兵衛') p.context = clamp(p.context + 3, 0, p.contextMax);
      if (ab.name === '愛の兜' || ab.name === '不敗の勇将' || ab.name === '越後の鍾馗') inst.damage = Math.max(0, inst.damage - 15);
    });
    p.supportUsed = false; p.retreated = false; p.stadiumUsed = false;
    // 金縛りは自分の番開始で解除予約（自番終了時に解除）。新規配置フラグ・兵糧補給フラグ解除
    [p.active, ...p.bench, p.honjin].forEach(inst => { if (inst) { inst.evolvedThisTurn = false; inst.placedThisTurn = false; inst.suppliedThisTurn = 0; } });
    log(`${p.name}の番。早馬と兵站が届いた。`);
  }

  function draw(p, n) {
    for (let k = 0; k < n; k++) { if (p.deck.length) p.hand.push(p.deck.shift()); }
  }
  function forEachOwn(p, fn) { fn(p.active); p.bench.forEach(fn); }

  // ---------------- プレイヤー操作 ----------------
  G.attachEnergy = function (targetUid) {
    const p = G.cur();
    if (p.energy <= 0) return fail('兵糧の在庫がありません。毎ターン少しずつ届き、采配で増やせます。');
    let t = findOwn(p, targetUid);
    if (!t && p.honjin && p.honjin.uid === targetUid) t = p.honjin; // 本陣の大名にも兵糧を蓄えられる
    if (!t) return fail('送り先の武将がいません。');
    // 兵站の都合：同じ武将へ送れるのは1ターンに1つまで（前線に付けて下げて再付与…の二重取りを防ぐ）
    const activeTarget = p.active && p.active.uid === t.uid;
    const supplyLimit = activeTarget ? 2 : 1;
    const supplied = Number(t.suppliedThisTurn || 0);
    if (supplied >= supplyLimit) return fail(`${t.card.name}へは今ターンもう兵糧を送り切りました（先鋒は2つ、後備えと本陣は1つまで）。`);
    t.suppliedThisTurn = supplied + 1;
    p.energy -= 1; t.energy += 1;
    pushFx({ kind: 'attach', uid: t.uid });
    log(`${t.card.name}へ兵糧を送った（今ターン${t.suppliedThisTurn}/${supplyLimit}・その武将の兵糧${t.energy}／在庫の残り${p.energy}）。`);
    return ok();
  };

  G.playFromHand = function (handIndex, slot) {
    // slot: 'active'(空のとき) | 0,1,2(ベンチ)  — たね武将の配置
    const p = G.cur();
    const c = p.hand[handIndex];
    if (!c) return fail('その手札はありません。');
    if (c.card.type !== 'warlord' || c.card.stage !== 0) return fail('場に直接出せるのは、たね（無名の兵士）だけです。');
    if (slot === 'active') {
      if (p.active) return fail('先鋒はすでにいます。');
      p.active = c; c.placedThisTurn = true; p.hand.splice(handIndex, 1);
    } else {
      if (p.bench[slot]) return fail('その後備えの枠は埋まっています。');
      p.bench[slot] = c; c.placedThisTurn = true; p.hand.splice(handIndex, 1);
    }
    log(`${c.card.name}を場に出した。`);
    return ok();
  };

  G.evolve = function (handIndex, targetUid) {
    const p = G.cur();
    const ev = p.hand[handIndex];
    if (!ev || ev.card.type !== 'warlord' || ev.card.stage === 0) return fail('それは出世カードではありません。');
    const base = findOwn(p, targetUid);
    if (!base) return fail('出世させる武将を選んでください。');
    if (base.card.id !== ev.card.evolvesFrom) return fail(`${ev.card.name}は「${ev.card.evolvesFrom}」からしか出世できません。`);
    if (G.GAME.turn < 2) return fail('最初の手番は出世できません（次の手番から名を挙げられます）。');
    if (base.placedThisTurn) return fail('場に出したばかりの武将は、次のターンまで出世できません。');
    if (base.evolvedThisTurn) return fail('1ターンに2段階は出世できません。');
    // 引き継ぎ：ダメージ・兵・装備・バフ。状態異常はリセット。
    ev.damage = base.damage; ev.energy = base.energy; ev.equip = base.equip;
    ev.atkBuff = base.atkBuff; ev.status = []; ev.evolvedThisTurn = true; ev.placedThisTurn = false;
    // 兵力上限が上がるのでダメージが上限超過なら詰める
    ev.damage = Math.min(ev.damage, maxHp(ev) - 1 < 0 ? 0 : ev.damage);
    replaceInst(p, base, ev);
    p.hand.splice(handIndex, 1);
    log(`${base.card.name}が出世して【${ev.card.name}】に！ 名を挙げた。`);
    return ok();
  };

  G.equip = function (handIndex, targetUid) {
    const p = G.cur();
    const e = p.hand[handIndex];
    if (!e || e.card.type !== 'equip') return fail('それは装備カードではありません。');
    const t = findOwn(p, targetUid);
    if (!t) return fail('装備させる武将を選んでください。');
    if (t.equip) return fail('その武将はすでに装備を持っています（1人1点）。');
    t.equip = e; p.hand.splice(handIndex, 1);
    log(`${t.card.name}が【${e.card.name}】を装備。`);
    return ok();
  };

  G.useTrainer = function (handIndex, targetUid) {
    const p = G.cur();
    const c = p.hand[handIndex];
    if (!c || c.card.type !== 'trainer') return fail('それは采配カードではありません。');
    if (c.card.kind === 'support') {
      if (p.supportUsed) return fail('軍師の采配は1ターンに1枚だけです。');
    }
    const ef = c.card.effect || {};
    if (ef.heal != null) { const t = findOwn(p, targetUid) || p.active; if (t) t.damage = Math.max(0, t.damage - ef.heal); }
    if (ef.draw != null) draw(p, ef.draw);
    if (ef.energy != null) p.energy += ef.energy;
    if (ef.activeEnergy != null && p.active) { p.active.energy += ef.activeEnergy; pushFx({ kind: 'attach', uid: p.active.uid }); }
    if (ef.atkThisTurn != null) p.buffs.nextAttack += ef.atkThisTurn;
    if (ef.statusEnemy != null) applyStatus(G.opp().active, ef.statusEnemy);
    if (c.card.kind === 'support') p.supportUsed = true;
    p.discard.push(c); p.hand.splice(handIndex, 1);
    log(`采配【${c.card.name}】を使用。`);
    return ok();
  };

  G.playStadium = function (handIndex) {
    const p = G.cur();
    const c = p.hand[handIndex];
    if (!c || c.card.type !== 'stadium') return fail('それは陣形カードではありません。');
    if (p.stadiumUsed) return fail('陣形は1ターンに1枚だけ敷けます。');
    if (G.GAME.stadium) G.GAME.players[G.GAME.stadium.owner].discard.push(G.GAME.stadium.inst);
    G.GAME.stadium = { inst: c, owner: p.id };
    p.stadiumUsed = true; p.hand.splice(handIndex, 1);
    log(`陣形【${c.card.name}】を敷いた。`);
    return ok();
  };

  G.retreat = function (benchIndex) {
    const p = G.cur();
    if (p.retreated) return fail('退き口（交代）は1ターンに1回までです。');
    if (!p.active) return fail('先鋒がいません。');
    const target = p.bench[benchIndex];
    if (!target) return fail('交代する後備えを選んでください。');
    // 退き口は兵糧を消費（種1・侍大将2・大名1）。采配旗を装備していれば無料。
    const free = p.active.equip && p.active.equip.effect && p.active.equip.effect.retreatFree;
    const cost = free ? 0 : (p.active.card.retreat || 0);
    if (p.active.energy < cost) return fail(`退き口には兵糧が${cost}必要です（${p.active.card.name}の今の兵糧は${p.active.energy}）。`);
    p.active.energy -= cost;
    p.active.status = []; // 交代で状態異常リセット
    const old = p.active; p.active = target; p.bench[benchIndex] = old;
    p.retreated = true;
    log(`退き口。${target.card.name}を先鋒に（兵糧${cost}消費）。${old.card.name}は後備えへ（状態回復）。`);
    return ok();
  };

  // ---------------- 裏：命令層 ----------------
  G.issueCommand = function (cmdId) {
    const p = G.cur();
    const cmd = COMMANDS.find(c => c.id === cmdId);
    if (!cmd) return fail('未知の命令です。');
    if (p.tasks.length >= p.parallelMax) return fail(`同時に走らせられる命令は${p.parallelMax}個までです（/agents で増やせます）。`);
    if (p.context < cmd.contextCost) return fail(`コンテキスト予算が足りません（必要${cmd.contextCost}・残${p.context}）。`);
    p.context -= cmd.contextCost;
    const tree = cmd.subs.map(s => ({ name: s.name, worktree: !!s.worktree, progress: 0, done: false }));
    p.tasks.push({
      uid: uid(), cmdId: cmd.id, cmd, progress: 0, turns: cmd.turns,
      contextCost: cmd.contextCost, agentType: cmd.agentType, tree, done: false,
    });
    log(`軍師が命令【${cmd.cmd}（${cmd.name}）】を発注。家臣が動き出した。`);
    return ok();
  };

  // 自分の手番が終わるたびに、その人の命令だけ1段階（/model で2段階）進める。
  // ＝turns手番ぶん「自分の番」が必要なので、ほぼ1巡で完成…にならず、数手番かけて効いてくる。
  function advanceTasks(p) {
    const step = p.buffs.speedUp ? 2 : 1;
    p.tasks.forEach(task => {
      if (task.done) return;
      task.progress = Math.min(task.turns, task.progress + step);
      // 家臣ツリーの進捗（演出）
      const ratio = task.progress / task.turns;
      task.tree.forEach((sub, i) => {
        const threshold = (i + 1) / (task.tree.length + 1);
        sub.progress = clamp(Math.round((ratio - threshold + 0.34) * 100 * 1.6), 0, 100);
        sub.done = ratio >= threshold || task.progress >= task.turns;
      });
      if (task.progress >= task.turns) {
        task.done = true;
        completeCommand(p, task);
      }
    });
    p.tasks = p.tasks.filter(t => !t.done);
  }

  function completeCommand(p, task) {
    const opp = G.GAME.players[p.id === 'p1' ? 'p2' : 'p1'];
    const e = task.cmd.effect; const amt = e.amount || 0;
    // ※完遂してもコンテキストは戻さない（戻すと使い得で無限に撃てるため）。回復は /compact と毎ターンの微回復のみ。
    let msg = `命令【${task.cmd.cmd}（${task.cmd.name}）】が完成！ `;
    switch (e.kind) {
      case 'buffNextAttack': p.buffs.nextAttack += amt; msg += `次の攻撃+${amt}。`; break;
      case 'buffActivePersistent': if (p.active) { p.active.atkBuff += amt; msg += `${p.active.card.name}のワザ+${amt}（持続）。`; } break;
      case 'buffAllPersistent': p.buffs.allAtk += amt; msg += `全武将のワザ+${amt}（持続）。`; break;
      case 'spyStrike':
        if (G.GAME.stadium) { G.GAME.players[G.GAME.stadium.owner].discard.push(G.GAME.stadium.inst); G.GAME.stadium = null; msg += '相手の陣形を破壊。'; }
        if (opp.active) { dealRaw(opp.active, amt); msg += `相手先鋒に${amt}のダメージ。`; }
        break;
      case 'directDamage': if (opp.active) { dealRaw(opp.active, amt); msg += `相手先鋒に${amt}のダメージ。`; } break;
      case 'siege': {
        if (opp.active) { dealRaw(opp.active, amt); msg += `相手先鋒に${amt}`; }
        const sp = e.splash || 0;
        opp.bench.forEach(t => { if (t) dealRaw(t, sp); });
        msg += `、後備え全員に${sp}の一斉ダメージ。`;
        break;
      }
      case 'restoreContext':
        p.context = clamp(p.context + amt, 0, p.contextMax);
        msg += `コンテキスト予算+${amt}`;
        if (e.energy) { p.energy += e.energy; msg += `、兵糧+${e.energy}`; }
        msg += '。';
        break;
      case 'shield': p.buffs.shield += amt; msg += `次の相手ターン、受けるダメージ-${amt}。`; break;
      case 'parallelUp': p.parallelMax += amt; msg += `並列上限が${p.parallelMax}に。`; break;
      case 'fullHeal': if (p.active) { p.active.damage = 0; msg += `${p.active.card.name}のダメージを全回復。`; } break;
      case 'speedUp': p.buffs.speedUp = true; msg += '以後、命令の進行が毎ターン2段階に。'; break;
      case 'counterTrap': p.buffs.counterTrap += amt; msg += `伏兵の号令を敷いた。相手の次の攻撃に${amt}の反撃。`; break;
      case 'recklessStrike':
        if (opp.active) { dealRaw(opp.active, amt); msg += `相手先鋒に${amt}の大打撃`; }
        if (p.active) { dealRaw(p.active, e.selfDamage || 0); msg += `、無理を押した自軍にも${e.selfDamage || 0}のダメージ。`; }
        break;
      case 'revive': {
        let idx = p.discard.findIndex(inst => inst.card.type === 'warlord' && inst.card.stage === 1);
        if (idx < 0) idx = p.discard.findIndex(inst => inst.card.type === 'warlord' && inst.card.stage === 0);
        if (idx >= 0) {
          const revived = makeInst(p.discard[idx].cardId);
          p.discard.splice(idx, 1); p.hand.push(revived);
          msg += `討死した${revived.card.name}を呼び戻し、手札に加えた。`;
        } else { msg += 'だが、呼び戻せる兵はいなかった。'; }
        break;
      }
      default: break;
    }
    log(msg, p.id);
    pushFx({ kind: 'commandDone', side: p.id });
    checkKO(opp); checkWin();
  }

  // ---------------- 戦闘 ----------------
  G.canAttack = function () {
    const p = G.cur();
    if (!p.active) return false;
    const a = p.active;
    if (a.status.includes('金縛り') || a.status.includes('油断')) return false;
    return a.card.moves.some(m => a.energy >= m.cost);
  };

  G.attack = function (moveIndex) {
    const p = G.cur(); const opp = G.opp();
    if (!p.active) return fail('先鋒がいません。');
    const a = p.active;
    if (a.status.includes('金縛り')) return fail('金縛りで動けません。');
    if (a.status.includes('油断')) return fail('油断（熟睡）で動けません。');
    const move = a.card.moves[moveIndex];
    if (!move) return fail('そのワザはありません。');
    if (a.energy < move.cost) return fail(`兵糧が足りません（必要${move.cost}・今${a.energy}）。`);
    if (!opp.active) return fail('相手に先鋒がいません。');
    // 混乱：コインで失敗
    if (a.status.includes('混乱')) {
      if (!coin()) { log(`${a.card.name}は混乱して空振り！ 番が終わった。`); endTurnInternal(); return ok(); }
    }
    let dmg = computeDamage(p, opp, a, move);
    pushFx({ kind: 'attack', uid: a.uid }); // 攻撃側の突き演出
    dealDamage(opp, opp.active, dmg);
    // 攻撃で兵糧を消費（無限に撃てないように。1兵糧=兵糧1）
    a.energy = Math.max(0, a.energy - move.cost);
    log(`${a.card.name}の「${move.name}」！ ${opp.active ? opp.active.card.name : '相手'}に${dmg}のダメージ。（兵糧${move.cost}消費）`);
    // 伏兵の号令：相手が仕掛けた罠。攻撃を受けると1回だけ反撃ダメージ
    if (opp.buffs.counterTrap > 0) {
      dealRaw(a, opp.buffs.counterTrap);
      log(`伏兵の号令が発動！ ${a.card.name}に反撃${opp.buffs.counterTrap}のダメージ。`, opp.id);
      opp.buffs.counterTrap = 0;
    }
    // ワザ付随効果
    applyMoveEffect(p, opp, move);
    // バフ消費
    p.buffs.nextAttack = 0;
    checkKO(opp); checkKO(p); checkWin();
    if (!G.GAME.winner) endTurnInternal();
    return ok();
  };

  function computeDamage(p, opp, a, move) {
    let dmg = move.dmg;
    dmg += a.atkBuff;                 // 恒久バフ（/code-review等）
    dmg += p.buffs.allAtk;            // 全体バフ（/memory）
    dmg += p.buffs.nextAttack;        // 単発（/plan・総攻撃）
    if (a.equip && a.equip.effect && a.equip.effect.atk) dmg += a.equip.effect.atk;
    // 相性（弱点）+20
    if (opp.active && opp.active.card.weakness && opp.active.card.weakness === a.card.faction) dmg += 20;
    // 陣形
    const stObj = G.GAME.stadium;
    const st = stObj && stObj.inst.card.effect;
    if (st) {
      if (st.plainsCavalry && a.card.heisyu === '騎') dmg += st.plainsCavalry;
      if (st.rainGuns && a.card.heisyu === '砲') dmg += st.rainGuns;
      if (st.gunline && a.card.heisyu === '砲') dmg += st.gunline;
      if (st.spearWall && a.card.heisyu === '槍') dmg += st.spearWall;
      if (st.archerNest && a.card.heisyu === '弓') dmg += st.archerNest;
    }
    // 特性
    forEachOwn(p, inst => {
      if (!inst || !inst.card.ability) return;
      if (inst.card.ability.name === '風林火山' && a.card.heisyu === '騎') dmg += 10;
    });
    if (a.card.ability) {
      if (a.card.ability.name === '毘沙門天' && coin()) dmg += 30;
      if (a.card.ability.name === '忍耐' && a.damage >= 100) dmg += 40;
      if (a.card.ability.name === '鬼柴田' && a.damage >= a.card.hp / 2) dmg += 20;
    }
    return Math.max(0, dmg);
  }

  function applyMoveEffect(p, opp, move) {
    const e = move.effect; if (!e) return;
    // 狙撃・巻き添えは後備えのみ対象。本陣に控える大名は無傷（出陣するまで傷つかない）。
    const bench = opp.bench.filter(x => x);
    if (e.status && opp.active) { applyStatus(opp.active, e.status); log(`${opp.active.card.name}は「${e.status}」を受けた。`); }
    if (e.benchSplash) { const b = bench[0]; if (b) { dealRaw(b, e.benchSplash); log(`巻き添えで後備えの${b.card.name}に${e.benchSplash}のダメージ。`); } }
    if (e.benchAll) { let any = false; opp.bench.forEach(b => { if (b) { dealRaw(b, e.benchAll); any = true; } }); if (any) log(`相手の後備え全員に${e.benchAll}の巻き添え。`); }
    if (e.benchTarget) { const b = bench[0]; if (b) { dealRaw(b, e.benchTarget); log(`後備えの${b.card.name}に${e.benchTarget}のダメージ。`); } }
  }

  function pushFx(ev) { if (G.GAME && G.GAME.fx) G.GAME.fx.push(ev); }

  // 防御側のシールド・陣形(城)を考慮してダメージ
  function dealDamage(owner, inst, dmg) {
    if (!inst) return;
    let d = dmg;
    const st = G.GAME.stadium && G.GAME.stadium.inst.card.effect;
    if (st && st.fortify) d = Math.max(0, d - st.fortify);
    if (owner.buffs.shield > 0) { d = Math.max(0, d - owner.buffs.shield); }
    inst.damage += d;
    if (d > 0) pushFx({ kind: 'dmg', uid: inst.uid, amount: d });
  }
  function dealRaw(inst, dmg) { if (inst) { inst.damage += dmg; if (dmg > 0) pushFx({ kind: 'dmg', uid: inst.uid, amount: dmg }); } }

  function applyStatus(inst, st) {
    if (!inst) return;
    if (inst.equip && inst.equip.effect && inst.equip.effect.statusImmune) return;
    if (inst.card.ability && (inst.card.ability.name === '律儀者' || inst.card.ability.name === '生涯無傷' || inst.card.ability.name === '伏見の忠義')) return;
    // 行動阻害系は上書き（同時1つ）
    if (['油断', '金縛り', '混乱'].includes(st)) inst.status = inst.status.filter(s => !['油断', '金縛り', '混乱'].includes(s));
    if (!inst.status.includes(st)) inst.status.push(st);
  }
  G.applyStatus = applyStatus;

  // ターン終了：状態異常処理→命令進捗→手番交代
  function endTurnInternal() {
    const p = G.cur();
    // 自分の先鋒の金縛りは自番終了で解除（確実1ターン）
    if (p.active) p.active.status = p.active.status.filter(s => s !== '金縛り');
    // 状態異常処理（両者の先鋒）
    ['p1', 'p2'].forEach(pid => {
      const pl = G.GAME.players[pid]; const a = pl.active; if (!a) return;
      if (a.status.includes('毒矢')) { dealRaw(a, 10); }
      if (a.status.includes('火攻め')) { dealRaw(a, 20); if (coin()) a.status = a.status.filter(s => s !== '火攻め'); }
      if (a.status.includes('油断') && coin()) a.status = a.status.filter(s => s !== '油断');
    });
    // 大名・織田信長「第六天魔王」：出陣している間、自分の番の終わりに相手先鋒へ20のダメージ（終盤の決め手）
    if (p.active && p.active.card.ability && p.active.card.ability.name === '第六天魔王') {
      const opp = G.GAME.players[p.id === 'p1' ? 'p2' : 'p1'];
      if (opp.active) { dealRaw(opp.active, 25); log('「第六天魔王」発動。相手先鋒に25のダメージ。', p.id); }
    }
    // シールドは相手の番が来る直前まで→ここで相手のシールドは保持、自分のは消費済み扱い。簡略化：自分のシールドは次の相手攻撃後に消える→ターン交代時にクリア
    // 命令は「自分の手番が終わるたび」に進む（自分の時間で家臣が働く）
    advanceTasks(p);
    ['p1', 'p2'].forEach(pid => checkKO(G.GAME.players[pid]));
    checkWin();
    if (G.GAME.winner) { emit(); return; }
    // 手番交代
    G.GAME.current = (G.GAME.current === 'p1') ? 'p2' : 'p1';
    if (G.GAME.current === 'p1') G.GAME.turn += 1;
    // 新しい手番側のシールドは前ターンに張ったものを維持、古いものは消す：張った本人の番が来たら消費
    const nxt = G.cur();
    // 相手から殴られるための盾なので、自分の番開始時にクリア
    nxt.buffs.shield = 0;
    startTurn();
    emit();
    // AIなら自動進行
    if (G.cur().isAI && !G.GAME.winner) setTimeout(() => G.aiTurn(), 650);
  }
  G.endTurn = function () { if (G.GAME.winner) return; endTurnInternal(); return ok(); };

  function checkKO(p) {
    const taker = G.GAME.players[p.id === 'p1' ? 'p2' : 'p1'];
    // 先鋒が討たれた
    if (p.active && curHp(p.active) <= 0) {
      const dead = p.active;
      taker.kubi += 1; p.warlordsLost += 1;
      pushFx({ kind: 'ko', name: dead.card.name, daimyo: !!dead.card.daimyo });
      sendToDiscard(p, dead); p.active = null;
      if (dead.card.daimyo) { p.daimyoFallen = true; log(`大名【${dead.card.name}】、討死！ ${p.name}は天下を失う。`, taker.id); }
      else log(`${dead.card.name}、討死！（${p.name}の陥落 ${p.warlordsLost}/3）`, taker.id);
    }
    // ベンチの討死（範囲攻撃等）
    p.bench.forEach((b, i) => {
      if (b && curHp(b) <= 0) { taker.kubi += 1; p.warlordsLost += 1; pushFx({ kind: 'ko', name: b.card.name }); sendToDiscard(p, b); p.bench[i] = null; log(`${b.card.name}が後備えで討死。（${p.name}の陥落 ${p.warlordsLost}/3）`); }
    });
    // 本陣の大名は無傷（ここでは討たれない）。前線の補充・大名の出陣を解決。
    resolveFrontline(p);
  }

  // 先鋒の補充：2体陥落したら本陣の大名を「3体目の砦」として出陣（最優先）。それ未満なら後備えを繰り上げ。
  function resolveFrontline(owner) {
    if (owner.daimyoFallen) return;
    if (owner.warlordsLost >= 2 && owner.honjin) {
      if (!owner.active) { deployDaimyo(owner); return; }
      if (!owner.active.card.daimyo) {
        const slot = owner.bench.indexOf(null);
        if (slot >= 0) { owner.bench[slot] = owner.active; owner.active = null; deployDaimyo(owner); }
        // 後備えが満杯なら、次に先鋒が空いた時に出陣
      }
      return;
    }
    if (!owner.active) promoteBench(owner);
  }
  function deployDaimyo(owner) {
    if (!owner.honjin) return;
    owner.active = owner.honjin; owner.honjin = null;
    owner.active.placedThisTurn = false; owner.active.evolvedThisTurn = false; owner.active.status = [];
    pushFx({ kind: 'deploy', uid: owner.active.uid });
    log(`本陣の大名【${owner.active.card.name}】が出陣！ 満身の兵力で最後の砦に立つ。`, owner.id);
  }
  function promoteBench(owner) {
    const alive = [];
    owner.bench.forEach((b, i) => { if (b && curHp(b) > 0) alive.push({ b, i }); });
    if (alive.length === 0) return; // 後備えなし→手札からたねを出す（自分の番に）
    if (alive.length === 1 || owner.isAI) {
      let pick = alive[0];
      if (owner.isAI) alive.forEach(x => { if (curHp(x.b) > curHp(pick.b)) pick = x; });
      owner.active = pick.b; owner.bench[pick.i] = null;
      log(`${owner.name}は${pick.b.card.name}を先鋒に繰り上げた。`, owner.id);
      return;
    }
    G.GAME.pendingPromote = owner.id; // 人間は誰を出すか選ぶ
  }

  // プレイヤーが繰り上げる後備えを選んだ
  G.choosePromote = function (benchUid) {
    const pid = G.GAME.pendingPromote; if (!pid) return fail('');
    const owner = G.GAME.players[pid];
    const i = owner.bench.findIndex(b => b && b.uid === benchUid && curHp(b) > 0);
    if (i < 0) return fail('繰り上げる後備えを選んでください。');
    owner.active = owner.bench[i]; owner.bench[i] = null;
    G.GAME.pendingPromote = null;
    log(`${owner.name}は${owner.active.card.name}を先鋒に繰り上げた。`, owner.id);
    return ok();
  };

  function sendToDiscard(p, inst) {
    p.discard.push(inst);
    if (inst.equip) p.discard.push(inst.equip);
  }

  // 勝敗：味方が3体討たれたら（＝大名を含む3体目が落ちたら）その陣営の負け。
  function checkWin() {
    if (G.GAME.winner) return;
    ['p1', 'p2'].forEach(pid => {
      const p = G.GAME.players[pid];
      if (p.warlordsLost >= 3 || p.daimyoFallen) G.GAME.winner = (pid === 'p1' ? 'p2' : 'p1');
    });
    if (G.GAME.winner) {
      const w = G.GAME.players[G.GAME.winner];
      log(`勝鬨！ ${w.name}が敵を3たび討ち取り、降した。天下に最も近づいた。`, G.GAME.winner);
    }
  }

  // ---------------- 補助 ----------------
  function findOwn(p, u) {
    if (p.active && p.active.uid === u) return p.active;
    return p.bench.find(b => b && b.uid === u) || null;
  }
  G.findOwn = findOwn;
  function replaceInst(p, oldI, newI) {
    if (p.active === oldI) { p.active = newI; return; }
    const i = p.bench.indexOf(oldI); if (i >= 0) p.bench[i] = newI;
  }
  function ok(msg) { emit(); return { ok: true, msg }; }
  function fail(msg) { return { ok: false, msg }; }

  // ---------------- 対戦AI（簡易・CPU軍師）----------------
  G.aiTurn = function () {
    const p = G.cur(); if (!p.isAI || G.GAME.winner) return;
    let guard = 0;
    // 1) 出世できるなら出世
    tryEvolveAI(p);
    // 2) たねをベンチに展開
    while (p.bench.includes(null)) {
      const hi = p.hand.findIndex(c => c.card.type === 'warlord' && c.card.stage === 0);
      if (hi < 0) break;
      const slot = p.bench.indexOf(null);
      if (!p.active) { G.playFromHand(hi, 'active'); }
      else G.playFromHand(hi, slot);
    }
    if (!p.active) { // 先鋒がいなければ出す
      const hi = p.hand.findIndex(c => c.card.type === 'warlord' && c.card.stage === 0);
      if (hi >= 0) G.playFromHand(hi, 'active');
    }
    // 3) 兵糧を配備（前線に1・後備え/本陣に最大2＝上限まで。後方の大名も育てる）
    if (p.active) {
      const costs = p.active.card.moves.map(m => m.cost).sort((a, b) => a - b);
      const want = costs.find(c => c > p.active.energy) || costs[costs.length - 1] || 1;
      while (p.energy > 0 && p.active.energy < want && (p.active.suppliedThisTurn || 0) < 2) G.attachEnergy(p.active.uid);
    }
    [p.bench[0], p.bench[1], p.bench[2], p.honjin].filter(Boolean).forEach(t => { if (p.energy > 0) G.attachEnergy(t.uid); });
    if (p.active && p.energy > 0 && (p.active.suppliedThisTurn || 0) < 2) G.attachEnergy(p.active.uid);
    // 4) 装備があれば先鋒へ
    const eqi = p.hand.findIndex(c => c.card.type === 'equip');
    if (eqi >= 0 && p.active && !p.active.equip) G.equip(eqi, p.active.uid);
    // 5) 采配（軍需品→サポート）
    let ti;
    while ((ti = p.hand.findIndex(c => c.card.type === 'trainer' && c.card.kind === 'item')) >= 0 && guard++ < 8) {
      G.useTrainer(ti, p.active && p.active.uid);
    }
    const si = p.hand.findIndex(c => c.card.type === 'trainer' && c.card.kind === 'support');
    if (si >= 0) G.useTrainer(si, p.active && p.active.uid);
    // 6) 陣形
    const sti = p.hand.findIndex(c => c.card.type === 'stadium');
    if (sti >= 0) G.playStadium(sti);
    // 7) 命令（予算と枠があれば、安いものを優先）
    issueAICommands(p);
    // 8) 攻撃（撃てる最大ダメージのワザ）→ なければ番終了
    if (G.canAttack()) {
      const a = p.active; let bi = -1, best = -1;
      a.card.moves.forEach((m, i) => { if (a.energy >= m.cost && m.dmg > best) { best = m.dmg; bi = i; } });
      if (bi >= 0) { G.attack(bi); return; }
    }
    // 攻撃しないなら番終了
    endTurnInternal();
  };
  function tryEvolveAI(p) {
    [p.active, ...p.bench].forEach(base => {
      if (!base) return;
      const hi = p.hand.findIndex(c => c.card.type === 'warlord' && c.card.evolvesFrom === base.card.id);
      if (hi >= 0 && G.GAME.turn >= 2 && !base.placedThisTurn && !base.evolvedThisTurn) G.evolve(hi, base.uid);
    });
  }
  function issueAICommands(p) {
    if (p.noAgent) return; // 対CPUのCPUは軍師なし（兵力で攻める）
    const order = ['compact', 'plan', 'code-review', 'security-review', 'codex-exec', 'memory', 'deep-research', 'sandbox', 'agents', 'hooks', 'yolo', 'resume'];
    for (const id of order) {
      if (p.tasks.length >= p.parallelMax) break;
      const cmd = COMMANDS.find(c => c.id === id);
      if (cmd && p.context >= cmd.contextCost && Math.random() < 0.7) G.issueCommand(id);
    }
  }

  window.Engine = G;
})();
