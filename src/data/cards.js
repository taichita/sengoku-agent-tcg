/* ===========================================================
   カードデータ
   たね → 侍大将 → 大名（本陣）の三層で、各家の勝ち筋を作る。
   =========================================================== */
(function () {
  const FACTIONS = {
    織田: { color: 'var(--shu)',    soft: 'var(--shu-soft)', kana: 'おだ',     strongVs: '武田' },
    武田: { color: 'var(--ai)',     soft: '#E3E9F1',         kana: 'たけだ',   strongVs: '上杉' },
    上杉: { color: 'var(--gunjo)',  soft: '#E1EAF3',         kana: 'うえすぎ', strongVs: '徳川' },
    徳川: { color: 'var(--kincha)', soft: '#EFE9D9',         kana: 'とくがわ', strongVs: '豊臣' },
    豊臣: { color: 'var(--kin)',    soft: 'var(--kin-soft)', kana: 'とよとみ', strongVs: '織田' },
    無所属: { color: 'var(--sumi3)', soft: 'var(--washi-d)', kana: '',         strongVs: null },
  };

  const C = {};

  // ---------- たね ----------
  C['足軽'] = { id:'足軽', type:'warlord', name:'足軽', yomi:'あしがる', rank:'たね', stage:0, evolvesFrom:null, faction:'無所属', heisyu:'歩',
    hp:90, ability:null, moves:[{name:'槍ぶすま', cost:1, dmg:25, text:''}], weakness:null, retreat:1, kubi:1,
    art:'art/images/ashigaru.png', flavor:'名もなき歩兵。されど、ここから天下人が生まれる。' };
  C['騎馬武者'] = { id:'騎馬武者', type:'warlord', name:'騎馬武者', yomi:'きばむしゃ', rank:'たね', stage:0, evolvesFrom:null, faction:'無所属', heisyu:'騎',
    hp:100, ability:null, moves:[{name:'駆け抜け', cost:1, dmg:20, text:'相手の後備え1体に5。', effect:{benchSplash:5}}], weakness:null, retreat:1, kubi:1,
    art:'art/images/kiba.png', flavor:'土煙を上げ戦場を駆ける。' };
  C['槍足軽'] = { id:'槍足軽', type:'warlord', name:'槍足軽', yomi:'やりあしがる', rank:'たね', stage:0, evolvesFrom:null, faction:'無所属', heisyu:'槍',
    hp:100, ability:null, moves:[{name:'一番槍', cost:1, dmg:30, text:''},{name:'繰り出し突き', cost:2, dmg:60, text:''}], weakness:null, retreat:1, kubi:1,
    art:'art/images/yari.png', flavor:'長柄の槍、密集して壁となる。進化せずとも一線を張る。' };
  C['弓兵'] = { id:'弓兵', type:'warlord', name:'弓兵', yomi:'ゆみへい', rank:'たね', stage:0, evolvesFrom:null, faction:'無所属', heisyu:'弓',
    hp:90, ability:null, moves:[{name:'遠矢', cost:1, dmg:15, text:'相手の後備え1体に20。', effect:{benchTarget:20}},{name:'差し矢', cost:2, dmg:55, text:''}], weakness:null, retreat:1, kubi:1,
    art:'art/images/yumi.png', flavor:'遠間から狙い澄ます。進化せずとも後方を脅かす狙撃兵。' };
  C['鉄砲足軽'] = { id:'鉄砲足軽', type:'warlord', name:'鉄砲足軽', yomi:'てっぽうあしがる', rank:'たね', stage:0, evolvesFrom:null, faction:'無所属', heisyu:'砲',
    hp:80, ability:null, moves:[{name:'斉射', cost:1, dmg:30, text:''},{name:'火縄', cost:2, dmg:70, text:'相手の先鋒を火攻めにする。', effect:{status:'火攻め'}}], weakness:null, retreat:1, kubi:1,
    art:'art/images/teppo.png', flavor:'新時代の轟音。' };

  // ---------- 侍大将 ----------
  C['明智光秀'] = { id:'明智光秀', type:'warlord', name:'明智光秀', yomi:'あけち みつひで', rank:'侍大将', stage:1, evolvesFrom:'足軽', faction:'織田', heisyu:'歩',
    hp:130, ability:{name:'律儀者', text:'このカードは相手から状態異常を受けない。', type:'passive'},
    moves:[{name:'寄せ太鼓', cost:1, dmg:35, text:''},{name:'桔梗の采', cost:2, dmg:75, text:''}], weakness:'豊臣', retreat:2, kubi:2,
    art:'art/images/mitsuhide.png', flavor:'秩序を重んじる智将。胸中に何を秘める。' };
  C['滝川一益'] = { id:'滝川一益', type:'warlord', name:'滝川一益', yomi:'たきがわ かずます', rank:'侍大将', stage:1, evolvesFrom:'鉄砲足軽', faction:'織田', heisyu:'砲',
    hp:125, ability:null,
    moves:[{name:'火線指揮', cost:1, dmg:35, text:''},{name:'一斉掃射', cost:2, dmg:85, text:'相手の先鋒を火攻めにする。', effect:{status:'火攻め'}}], weakness:'豊臣', retreat:2, kubi:2,
    art:'art/images/takigawa.png', flavor:'鉄砲隊を束ね、戦場の間合いを支配する。' };
  C['山県昌景'] = { id:'山県昌景', type:'warlord', name:'山県昌景', yomi:'やまがた まさかげ', rank:'侍大将', stage:1, evolvesFrom:'騎馬武者', faction:'武田', heisyu:'騎',
    hp:140, ability:null,
    moves:[{name:'物見', cost:1, dmg:35, text:''},{name:'赤備え', cost:2, dmg:75, text:'相手の後備え全員に10。', effect:{benchAll:10}}], weakness:'織田', retreat:2, kubi:2,
    art:'art/images/yamagata.png', flavor:'赤き軍装、武田最強の先鋒。' };
  C['馬場信春'] = { id:'馬場信春', type:'warlord', name:'馬場信春', yomi:'ばば のぶはる', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'武田', heisyu:'槍',
    hp:150, ability:null,
    moves:[{name:'不動の槍', cost:1, dmg:35, text:''},{name:'鬼美濃', cost:2, dmg:85, text:''}], weakness:'織田', retreat:2, kubi:2,
    art:'art/images/baba.png', flavor:'倒れぬ老将。武田の槍を支える柱。' };
  C['直江兼続'] = { id:'直江兼続', type:'warlord', name:'直江兼続', yomi:'なおえ かねつぐ', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'上杉', heisyu:'槍',
    hp:135, ability:{name:'愛の兜', text:'自分のターン開始時、この武将のダメージを15回復する。', type:'passive'},
    moves:[{name:'義の檄', cost:1, dmg:30, text:''},{name:'義の一槍', cost:2, dmg:80, text:''}], weakness:'武田', retreat:2, kubi:2,
    art:'art/images/kanetsugu.png', flavor:'兜に掲げし「愛」の一文字。' };
  C['甘粕景持'] = { id:'甘粕景持', type:'warlord', name:'甘粕景持', yomi:'あまかす かげもち', rank:'侍大将', stage:1, evolvesFrom:'弓兵', faction:'上杉', heisyu:'弓',
    hp:130, ability:null,
    moves:[{name:'援護射撃', cost:1, dmg:25, text:'相手の後備え1体に25。', effect:{benchTarget:25}},{name:'雨裂きの矢', cost:2, dmg:78, text:'相手の後備え1体に20。', effect:{benchTarget:20}}], weakness:'武田', retreat:1, kubi:2,
    art:'art/images/amakasu.png', flavor:'義の軍勢を遠間から支える弓取り。' };
  C['本多忠勝'] = { id:'本多忠勝', type:'warlord', name:'本多忠勝', yomi:'ほんだ ただかつ', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'徳川', heisyu:'槍',
    hp:150, ability:{name:'生涯無傷', text:'状態異常を受けない。', type:'passive'},
    moves:[{name:'名乗り', cost:1, dmg:35, text:''},{name:'蜻蛉切', cost:2, dmg:85, text:''}], weakness:'上杉', retreat:2, kubi:2,
    art:'art/images/tadakatsu.png', flavor:'蜻蛉が触れれば真っ二つ。生涯五十七戦無傷。' };
  C['鳥居元忠'] = { id:'鳥居元忠', type:'warlord', name:'鳥居元忠', yomi:'とりい もとただ', rank:'侍大将', stage:1, evolvesFrom:'鉄砲足軽', faction:'徳川', heisyu:'砲',
    hp:135, ability:{name:'伏見の忠義', text:'状態異常を受けない。', type:'passive'},
    moves:[{name:'守り撃ち', cost:1, dmg:35, text:''},{name:'伏見の銃声', cost:2, dmg:80, text:''}], weakness:'上杉', retreat:2, kubi:2,
    art:'art/images/torii.png', flavor:'退かぬ忠義が、銃声となって城を守る。' };
  C['木下藤吉郎'] = { id:'木下藤吉郎', type:'warlord', name:'木下藤吉郎', yomi:'きのした とうきちろう', rank:'侍大将', stage:1, evolvesFrom:'足軽', faction:'豊臣', heisyu:'歩',
    hp:130, ability:{name:'出世の才', text:'自分のターン開始時、兵糧の在庫を1多くためる。', type:'passive'},
    moves:[{name:'一夜城', cost:1, dmg:45, text:''},{name:'墨俣築城', cost:2, dmg:80, text:''}], weakness:'徳川', retreat:1, kubi:2,
    art:'art/images/tokichiro.png', flavor:'草履を胸で温めた男。天下はもう目の前。' };
  C['石田三成'] = { id:'石田三成', type:'warlord', name:'石田三成', yomi:'いしだ みつなり', rank:'侍大将', stage:1, evolvesFrom:'鉄砲足軽', faction:'豊臣', heisyu:'砲',
    hp:125, ability:{name:'兵站奉行', text:'自分のターン開始時、兵糧の在庫を1多くためる。', type:'passive'},
    moves:[{name:'算段撃ち', cost:1, dmg:30, text:''},{name:'奉行の火線', cost:2, dmg:75, text:'相手の後備え1体に15。', effect:{benchTarget:15}}], weakness:'徳川', retreat:2, kubi:2,
    art:'art/images/mitsunari.png', flavor:'戦は数と段取り。兵站を読み切る理の将。' };

  // ---------- 侍大将（増員・2026-07-11追加） ----------
  C['柴田勝家'] = { id:'柴田勝家', type:'warlord', name:'柴田勝家', yomi:'しばた かついえ', rank:'侍大将', stage:1, evolvesFrom:'足軽', faction:'織田', heisyu:'歩',
    hp:145, ability:{name:'鬼柴田', text:'この武将の兵力が半分以下のとき、ワザのダメージ+20。', type:'passive'},
    moves:[{name:'瓶割り', cost:1, dmg:32, text:''},{name:'鬼柴田の突撃', cost:2, dmg:78, text:''}], weakness:'豊臣', retreat:2, kubi:2,
    art:null, flavor:'退くを知らぬ猛将。されど賤ヶ岳に散る。' };
  C['丹羽長秀'] = { id:'丹羽長秀', type:'warlord', name:'丹羽長秀', yomi:'にわ ながひで', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'織田', heisyu:'槍',
    hp:140, ability:null,
    moves:[{name:'支え槍', cost:1, dmg:30, text:''},{name:'五郎左の采配', cost:2, dmg:72, text:''}], weakness:'豊臣', retreat:2, kubi:2,
    art:null, flavor:'米のように欠かせぬ男、と信長評す。' };
  C['前田利家'] = { id:'前田利家', type:'warlord', name:'前田利家', yomi:'まえだ としいえ', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'織田', heisyu:'槍',
    hp:135, ability:null,
    moves:[{name:'又左の一突き', cost:1, dmg:35, text:''},{name:'槍の又左', cost:2, dmg:82, text:''}], weakness:'豊臣', retreat:1, kubi:2,
    art:null, flavor:'槍働きの又左、天下に聞こえた男。' };
  C['内藤昌豊'] = { id:'内藤昌豊', type:'warlord', name:'内藤昌豊', yomi:'ないとう まさとよ', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'武田', heisyu:'槍',
    hp:145, ability:{name:'不敗の勇将', text:'自分のターン開始時、この武将のダメージを15回復する。', type:'passive'},
    moves:[{name:'隠れ武士', cost:1, dmg:30, text:''},{name:'昌豊の采配', cost:2, dmg:75, text:''}], weakness:'織田', retreat:2, kubi:2,
    art:null, flavor:'一度も後れを取らぬ、と称された武田の柱石。' };
  C['高坂昌信'] = { id:'高坂昌信', type:'warlord', name:'高坂昌信', yomi:'こうさか まさのぶ', rank:'侍大将', stage:1, evolvesFrom:'弓兵', faction:'武田', heisyu:'弓',
    hp:135, ability:null,
    moves:[{name:'海津の備え', cost:1, dmg:28, text:'相手の後備え1体に15。', effect:{benchTarget:15}},{name:'甲陽の軍配', cost:2, dmg:75, text:''}], weakness:'織田', retreat:1, kubi:2,
    art:null, flavor:'越後を睨み、海津城を守り抜いた智将。' };
  C['真田幸隆'] = { id:'真田幸隆', type:'warlord', name:'真田幸隆', yomi:'さなだ ゆきたか', rank:'侍大将', stage:1, evolvesFrom:'弓兵', faction:'武田', heisyu:'弓',
    hp:125, ability:null,
    moves:[{name:'調略の一手', cost:1, dmg:28, text:''},{name:'攻め弾正', cost:2, dmg:78, text:'相手の後備え1体に15。', effect:{benchTarget:15}}], weakness:'織田', retreat:2, kubi:2,
    art:null, flavor:'謀は敵より我が方に利あり。攻め弾正、その智謀。' };
  C['前田慶次'] = { id:'前田慶次', type:'warlord', name:'前田慶次', yomi:'まえだ けいじ', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'上杉', heisyu:'槍',
    hp:140, ability:null,
    moves:[{name:'傾奇の一撃', cost:1, dmg:33, text:''},{name:'大ふへん者', cost:2, dmg:80, text:''}], weakness:'武田', retreat:1, kubi:2,
    art:null, flavor:'天下御免の傾奇者。義に生き、伊達に生きる。' };
  C['柿崎景家'] = { id:'柿崎景家', type:'warlord', name:'柿崎景家', yomi:'かきざき かげいえ', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'上杉', heisyu:'槍',
    hp:145, ability:null,
    moves:[{name:'猛虎の一番槍', cost:1, dmg:35, text:''},{name:'景家の突撃', cost:2, dmg:85, text:''}], weakness:'武田', retreat:2, kubi:2,
    art:null, flavor:'越後の猛虎、常に軍の先頭に立つ。' };
  C['斎藤朝信'] = { id:'斎藤朝信', type:'warlord', name:'斎藤朝信', yomi:'さいとう とものぶ', rank:'侍大将', stage:1, evolvesFrom:'弓兵', faction:'上杉', heisyu:'弓',
    hp:130, ability:{name:'越後の鍾馗', text:'自分のターン開始時、この武将のダメージを15回復する。', type:'passive'},
    moves:[{name:'鍾馗の守り', cost:1, dmg:28, text:'相手の後備え1体に15。', effect:{benchTarget:15}},{name:'朝信の一矢', cost:2, dmg:72, text:''}], weakness:'武田', retreat:1, kubi:2,
    art:null, flavor:'越後の鍾馗と恐れられた、不敗の守将。' };
  C['井伊直政'] = { id:'井伊直政', type:'warlord', name:'井伊直政', yomi:'いい なおまさ', rank:'侍大将', stage:1, evolvesFrom:'槍足軽', faction:'徳川', heisyu:'槍',
    hp:140, ability:null,
    moves:[{name:'赤鬼の一閃', cost:1, dmg:36, text:''},{name:'井伊の赤備え', cost:2, dmg:88, text:''}], weakness:'上杉', retreat:2, kubi:2,
    art:null, flavor:'井伊の赤鬼、朱に染まりし精鋭を率いる。' };
  C['榊原康政'] = { id:'榊原康政', type:'warlord', name:'榊原康政', yomi:'さかきばら やすまさ', rank:'侍大将', stage:1, evolvesFrom:'弓兵', faction:'徳川', heisyu:'弓',
    hp:130, ability:{name:'三河武士の統率', text:'自分のターン開始時、兵站庫に兵糧を1多くためる。', type:'passive'},
    moves:[{name:'康政の備え', cost:1, dmg:28, text:''},{name:'三河武士の意地', cost:2, dmg:74, text:''}], weakness:'上杉', retreat:1, kubi:2,
    art:null, flavor:'筆を執っては檄文、槍を執っては武功。' };
  C['酒井忠次'] = { id:'酒井忠次', type:'warlord', name:'酒井忠次', yomi:'さかい ただつぐ', rank:'侍大将', stage:1, evolvesFrom:'鉄砲足軽', faction:'徳川', heisyu:'砲',
    hp:135, ability:null,
    moves:[{name:'忠次の采配', cost:1, dmg:30, text:''},{name:'東三河の旗頭', cost:2, dmg:74, text:'相手の後備え1体に10。', effect:{benchTarget:10}}], weakness:'上杉', retreat:2, kubi:2,
    art:null, flavor:'徳川家中随一の宿老、その旗の下に兵集う。' };
  C['加藤清正'] = { id:'加藤清正', type:'warlord', name:'加藤清正', yomi:'かとう きよまさ', rank:'侍大将', stage:1, evolvesFrom:'足軽', faction:'豊臣', heisyu:'歩',
    hp:145, ability:null,
    moves:[{name:'虎退治', cost:1, dmg:35, text:''},{name:'清正の一番槍', cost:2, dmg:85, text:''}], weakness:'徳川', retreat:2, kubi:2,
    art:null, flavor:'虎をも恐れぬ豪傑。賤ヶ岳の七本槍、その一人。' };
  C['福島正則'] = { id:'福島正則', type:'warlord', name:'福島正則', yomi:'ふくしま まさのり', rank:'侍大将', stage:1, evolvesFrom:'足軽', faction:'豊臣', heisyu:'歩',
    hp:140, ability:null,
    moves:[{name:'猪武者', cost:1, dmg:35, text:''},{name:'正則の豪傑', cost:2, dmg:82, text:''}], weakness:'徳川', retreat:1, kubi:2,
    art:null, flavor:'酒と武勇を好む猪武者。前線で吠える。' };
  C['黒田官兵衛'] = { id:'黒田官兵衛', type:'warlord', name:'黒田官兵衛', yomi:'くろだ かんべえ', rank:'侍大将', stage:1, evolvesFrom:'鉄砲足軽', faction:'豊臣', heisyu:'砲',
    hp:120, ability:{name:'軍師官兵衛', text:'自分のターン開始時、コンテキスト予算を3多く回復する。', type:'passive'},
    moves:[{name:'播磨の智謀', cost:1, dmg:25, text:'相手の後備え1体に15。', effect:{benchTarget:15}},{name:'二兵衛の号令', cost:2, dmg:65, text:''}], weakness:'徳川', retreat:2, kubi:2,
    art:null, flavor:'如水と号す、天下無双の軍師。この采配、信長・秀吉すら恐れた。' };

  // ---------- 大名 ----------
  C['織田信長'] = { id:'織田信長', type:'warlord', name:'織田信長', yomi:'おだ のぶなが', rank:'大名', stage:2, daimyo:true, evolvesFrom:null, faction:'織田', heisyu:'歩', legend:true,
    hp:180, ability:{name:'第六天魔王', text:'出陣している間、自分の番の終わりに相手の先鋒へ25のダメージ。', type:'passive'},
    moves:[{name:'天下布武', cost:3, dmg:130, text:''},{name:'鉄砲三段', cost:2, dmg:75, text:'相性を突くとさらに+20。'}], weakness:'豊臣', retreat:1, kubi:3,
    art:'art/images/nobunaga.png', flavor:'是非に及ばず。新時代を切り拓く覇王。' };
  C['武田信玄'] = { id:'武田信玄', type:'warlord', name:'武田信玄', yomi:'たけだ しんげん', rank:'大名', stage:2, daimyo:true, evolvesFrom:null, faction:'武田', heisyu:'騎', legend:true,
    hp:190, ability:{name:'風林火山', text:'出陣している間、自分の騎馬（騎）の武将のワザ+10。', type:'passive'},
    moves:[{name:'騎馬突撃', cost:3, dmg:125, text:''}], weakness:'織田', retreat:1, kubi:3,
    art:'art/images/shingen.png', flavor:'動かざること山の如し。甲斐の虎。' };
  C['上杉謙信'] = { id:'上杉謙信', type:'warlord', name:'上杉謙信', yomi:'うえすぎ けんしん', rank:'大名', stage:2, daimyo:true, evolvesFrom:null, faction:'上杉', heisyu:'槍', legend:true,
    hp:185, ability:{name:'毘沙門天', text:'コイン（軍配）がオモテなら、ワザのダメージ+30。', type:'passive'},
    moves:[{name:'車懸り', cost:2, dmg:100, text:''}], weakness:'武田', retreat:1, kubi:3,
    art:'art/images/kenshin.png', flavor:'我は毘沙門天の化身なり。軍神、降臨。' };
  C['徳川家康'] = { id:'徳川家康', type:'warlord', name:'徳川家康', yomi:'とくがわ いえやす', rank:'大名', stage:2, daimyo:true, evolvesFrom:null, faction:'徳川', heisyu:'槍', legend:true,
    hp:200, ability:{name:'忍耐', text:'ダメージが100以上のとき、ワザのダメージ+40。', type:'passive'},
    moves:[{name:'鶴翼の陣', cost:3, dmg:115, text:''}], weakness:'上杉', retreat:1, kubi:3,
    art:'art/images/ieyasu.png', flavor:'鳴くまで待とう。最後に天下を掴む。' };
  C['豊臣秀吉'] = { id:'豊臣秀吉', type:'warlord', name:'豊臣秀吉', yomi:'とよとみ ひでよし', rank:'大名', stage:2, daimyo:true, evolvesFrom:null, faction:'豊臣', heisyu:'歩', legend:true,
    hp:180, ability:{name:'人たらし', text:'出陣している間、自分のターン開始時、コンテキスト予算を5多く回復する。', type:'passive'},
    moves:[{name:'太閤の采配', cost:3, dmg:120, text:''}], weakness:'徳川', retreat:1, kubi:3,
    art:'art/images/hideyoshi.png', flavor:'裸一貫から天下人へ。出世の極み。' };

  // ---------- 装備 ----------
  C['名刀'] = { id:'名刀', type:'equip', name:'名刀 正宗', yomi:'めいとう まさむね', faction:'無所属',
    text:'装備した武将のワザのダメージ+20。', effect:{atk:20}, art:'art/images/katana.png', flavor:'天下五剣の煌めき。' };
  C['具足'] = { id:'具足', type:'equip', name:'当世具足', yomi:'とうせいぐそく', faction:'無所属',
    text:'装備した武将の兵力上限+40。', effect:{maxhp:40}, art:'art/images/gusoku.png', flavor:'鉄壁の防御。' };
  C['采配旗'] = { id:'采配旗', type:'equip', name:'采配旗', yomi:'さいはいき', faction:'無所属',
    text:'装備した武将は退き口（交代）の兵がいらない。', effect:{retreatFree:true}, art:'art/images/sashimono.png', flavor:'軍を統べる旗印。' };
  C['母衣'] = { id:'母衣', type:'equip', name:'母衣', yomi:'ほろ', faction:'無所属',
    text:'装備した武将は状態異常を受けない。', effect:{statusImmune:true}, art:'art/images/horo.png', flavor:'背に流れる絹の盾。' };

  // ---------- 采配 ----------
  C['金瘡医'] = { id:'金瘡医', type:'trainer', kind:'item', name:'金瘡医', yomi:'きんそうい', faction:'無所属',
    text:'自分の武将1体の兵力を30回復する。', effect:{heal:30}, art:null, flavor:'戦場を駆ける、刀傷の治療師。' };
  C['早馬'] = { id:'早馬', type:'trainer', kind:'item', name:'早馬', yomi:'はやうま', faction:'無所属',
    text:'陣容（山札）から2枚引く。', effect:{draw:2}, art:null, flavor:'報せは戦の生命線。' };
  C['伝令'] = { id:'伝令', type:'trainer', kind:'item', name:'伝令', yomi:'でんれい', faction:'無所属',
    text:'陣容（山札）から2枚引く。手札を回し、欲しい札を手繰り寄せる。', effect:{draw:2}, art:null, flavor:'駆けよ、陣から陣へ。' };
  C['狼煙'] = { id:'狼煙', type:'trainer', kind:'item', name:'狼煙', yomi:'のろし', faction:'無所属',
    text:'兵站庫に兵糧を2ためる。重いワザの準備を早める。', effect:{energy:2}, art:null, flavor:'天に立ち上る合図。' };
  C['総攻撃'] = { id:'総攻撃', type:'trainer', kind:'support', name:'軍師の采配・総攻撃', yomi:'そうこうげき', faction:'無所属',
    text:'このターン、自分の先鋒のワザのダメージ+30。', effect:{atkThisTurn:30}, art:null, flavor:'全軍、かかれッ！' };
  C['兵糧調達'] = { id:'兵糧調達', type:'trainer', kind:'support', name:'軍師の采配・兵糧調達', yomi:'ひょうろうちょうたつ', faction:'無所属',
    text:'兵站庫に兵糧を2ため、先鋒にも兵糧を1直送する。', effect:{energy:2, activeEnergy:1}, art:null, flavor:'兵站を制する者が戦を制す。' };
  C['離反工作'] = { id:'離反工作', type:'trainer', kind:'support', name:'軍師の采配・離反工作', yomi:'りはんこうさく', faction:'無所属',
    text:'相手の先鋒を「混乱」状態にする。', effect:{statusEnemy:'混乱'}, art:null, flavor:'内側から崩す調略。' };

  // ---------- 陣形 ----------
  C['城'] = { id:'城', type:'stadium', name:'陣形・堅城', yomi:'けんじょう', faction:'無所属',
    text:'両者の先鋒が受けるダメージを10減らす。', effect:{fortify:10}, art:null, flavor:'高石垣、寄せ手を阻む。' };
  C['平野'] = { id:'平野', type:'stadium', name:'陣形・平野', yomi:'へいや', faction:'無所属',
    text:'両者の騎馬武者・騎の武将のワザ+20。', effect:{plainsCavalry:20}, art:null, flavor:'遮るもののない決戦場。' };
  C['大雨'] = { id:'大雨', type:'stadium', name:'陣形・大雨', yomi:'おおあめ', faction:'無所属',
    text:'両者の鉄砲（砲）の武将のワザ-30。', effect:{rainGuns:-30}, art:null, flavor:'火縄、湿りて沈黙す。' };
  C['鉄砲陣地'] = { id:'鉄砲陣地', type:'stadium', name:'陣形・鉄砲陣地', yomi:'てっぽうじんち', faction:'無所属',
    text:'両者の鉄砲（砲）の武将のワザ+20。', effect:{gunline:20}, art:null, flavor:'杭を打ち、火線を揃える。' };
  C['山道'] = { id:'山道', type:'stadium', name:'陣形・山道', yomi:'やまみち', faction:'無所属',
    text:'両者の槍の武将のワザ+15。', effect:{spearWall:15}, art:null, flavor:'細い道では長柄が戦場を支配する。' };
  C['矢倉'] = { id:'矢倉', type:'stadium', name:'陣形・矢倉', yomi:'やぐら', faction:'無所属',
    text:'両者の弓の武将のワザ+20。', effect:{archerNest:20}, art:null, flavor:'高所から戦場を射抜く。' };
  C['兵站道'] = { id:'兵站道', type:'stadium', name:'陣形・兵站道', yomi:'へいたんどう', faction:'無所属',
    text:'この陣形を敷いた陣営は、自分のターン開始時に兵站庫へ兵糧+1。', effect:{supplyLine:1}, art:null, flavor:'荷駄が絶えなければ、戦は止まらない。' };

  window.FACTIONS = FACTIONS;
  window.CARDS = C;
})();
