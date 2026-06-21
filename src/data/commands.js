/* ===========================================================
   命令札データ ── 軍師（プレイヤー）がAIエージェントに出す命令
   元ネタは本物の Claude Code / Codex コマンド。名はアルファベットのまま。
   発注するとコンテキスト予算を消費し、数ターンかけて完成→効果を盤面に投入。
   完成までサブエージェント（家臣）がworktree（別働隊の陣地）で並列に働く。
   グローバル COMMANDS に格納。
   =========================================================== */
(function () {
  // agentType: 兵種（本物の3種に対応） 万能侍大将=general-purpose / 忍び=Explore / 軍師付き調役=Plan
  // contextCost: 走っている間ふさぐコンテキスト予算
  // turns: 完成までのターン数
  // subs: ワークツリーに出す家臣（サブエージェント）の作業名。worktree:true で別働隊の陣地
  // effect.kind: 完成時の効果
  const COMMANDS = [
    {
      id:'plan', cmd:'/plan', name:'軍議', category:'設計', icon:'⚑',
      contextCost:10, turns:2, agentType:'軍師付き調役',
      desc:'先に作戦を立て、次の一手を強くする。完成すると自分の先鋒のワザのダメージが次の攻撃だけ+30。',
      effect:{ kind:'buffNextAttack', amount:30 },
      subs:[ {name:'戦場の地勢を調べる', worktree:false} ],
    },
    {
      id:'code-review', cmd:'/code-review', name:'軍師の添削', category:'支援', icon:'筆',
      contextCost:20, turns:3, agentType:'万能侍大将',
      desc:'自軍の戦い方を点検し、恒久的に強化する。完成すると自分の先鋒のワザのダメージが+15（戦場を離れるまで持続）。',
      effect:{ kind:'buffActivePersistent', amount:15 },
      subs:[ {name:'弱点を洗い出す', worktree:false}, {name:'改善案を作る', worktree:true} ],
    },
    {
      id:'security-review', cmd:'/security-review', name:'忍び探索', category:'諜報', icon:'忍',
      contextCost:20, turns:3, agentType:'忍び',
      desc:'敵陣に忍びを放つ。完成すると相手の陣形を破壊し、相手の先鋒に20のダメージ。',
      effect:{ kind:'spyStrike', amount:20 },
      subs:[ {name:'敵陣に潜入', worktree:false}, {name:'伏兵を炙り出す', worktree:false} ],
    },
    {
      id:'codex-exec', cmd:'codex exec', name:'奇襲の一撃', category:'攻撃', icon:'稲',
      contextCost:14, turns:2, agentType:'万能侍大将',
      desc:'明確な狙いを一発で実行。完成（2手番後）に相手の先鋒へ25のダメージ。',
      effect:{ kind:'directDamage', amount:25 },
      subs:[ {name:'一点を急襲', worktree:false} ],
    },
    {
      id:'compact', cmd:'/compact', name:'兵站圧縮', category:'兵站', icon:'圧',
      contextCost:5, turns:1, agentType:'軍師付き調役',
      desc:'抱えた仕事を要点に圧縮する。完成すると脳容量（コンテキスト）を+40回復。脳容量が苦しいときの立て直しに。',
      effect:{ kind:'restoreContext', amount:40 },
      subs:[ {name:'荷駄を整理', worktree:false} ],
    },
    {
      id:'sandbox', cmd:'--sandbox', name:'結界', category:'防御', icon:'盾',
      contextCost:15, turns:1, agentType:'万能侍大将',
      desc:'安全な囲いを張る。完成すると次の相手ターン、自分の先鋒が受けるダメージを-30。',
      effect:{ kind:'shield', amount:30 },
      subs:[ {name:'結界を張る', worktree:true} ],
    },
    {
      id:'agents', cmd:'/agents', name:'軍団編成', category:'機構', icon:'衆',
      contextCost:20, turns:2, agentType:'万能侍大将',
      desc:'配下の軍団を編成する。完成すると同時に走らせられる命令の数が+1（並列上限UP・恒久）。',
      effect:{ kind:'parallelUp', amount:1 },
      subs:[ {name:'家臣Aを編成', worktree:true}, {name:'家臣Bを編成', worktree:true} ],
    },
    {
      id:'rewind', cmd:'/rewind', name:'時を遡る', category:'秘術', icon:'巻',
      contextCost:25, turns:2, agentType:'万能侍大将',
      desc:'時を巻き戻す秘術。完成すると自分の先鋒のダメージを全回復する。',
      effect:{ kind:'fullHeal' },
      subs:[ {name:'記録から復元', worktree:true} ],
    },
    {
      id:'model', cmd:'/model', name:'軍師交代', category:'設計', icon:'格',
      contextCost:25, turns:2, agentType:'軍師付き調役',
      desc:'指揮官の格を上げる。完成すると以後、走っている命令が毎ターン2段階ずつ進む（思考力UP・恒久）。',
      effect:{ kind:'speedUp' },
      subs:[ {name:'上位の軍師を招く', worktree:false} ],
    },
    {
      id:'memory', cmd:'/memory', name:'家訓', category:'支援', icon:'訓',
      contextCost:15, turns:2, agentType:'軍師付き調役',
      desc:'代々の掟を定める。完成すると自分の全武将のワザのダメージが+10（恒久）。',
      effect:{ kind:'buffAllPersistent', amount:10 },
      subs:[ {name:'家訓を起草', worktree:false} ],
    },
    {
      id:'deep-research', cmd:'/deep-research', name:'総力調査', category:'攻撃', icon:'極',
      contextCost:28, turns:4, agentType:'忍び',
      desc:'時間をかけ敵の全容を丸裸にする大調査。完成（4手番）すると相手の先鋒に50、後備え・本陣の全員に20の一斉ダメージ。決まれば戦況を一変させる切り札。',
      effect:{ kind:'siege', amount:50, splash:20 },
      subs:[ {name:'敵将を分析', worktree:true}, {name:'兵站線を洗う', worktree:true}, {name:'弱点を統合', worktree:false} ],
    },
  ];

  // カテゴリ色（UIバッジ用）
  const CATEGORY_COLOR = {
    設計:'var(--ai)', 支援:'var(--hei)', 諜報:'var(--sumi)', 攻撃:'var(--shu)',
    兵站:'var(--token)', 防御:'var(--gunjo)', 機構:'var(--kincha)', 秘術:'var(--kin)',
  };

  window.COMMANDS = COMMANDS;
  window.CATEGORY_COLOR = CATEGORY_COLOR;
})();
