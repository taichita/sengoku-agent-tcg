# キャラ画像を GPT Image 2 で一括生成する手順

結論：**下の「コピペ用」をそのまま Codex（または Claude Code）に貼れば、全キャラの絵が `art/images/` に出来上がります。** APIキーだけ先に通してください。

---

## 0. 一度だけ準備（APIキー）

PowerShell で（`sk-...` は自分のOpenAIキー）：

```powershell
setx OPENAI_API_KEY "sk-あなたのキー"
```

> `setx` の後は**新しいターミナルを開く**と反映されます。

---

## 1. コピペ用（Codex / Claude Code に貼る）

下のブロックを丸ごとコピーして、`C:\dev\sengoku-agent-tcg` で起動した Codex か Claude Code に貼ってください。

```
このリポジトリの art/prompts/prompts.json を読んでください。
各エントリ（characters と equipment）について、styleAnchor を prompt の先頭に必ず連結し、
OpenAI の画像生成モデル gpt-image-2 で画像を1枚ずつ生成し、
絶対パス C:\dev\sengoku-agent-tcg\art\images\<file> に PNG で保存してください。
サイズは 1024x1536（縦長）、quality は high。
OPENAI_API_KEY は環境変数から読みます。
すでに images に同名ファイルがあるものはスキップしてください。
art/generate_images.py が使えるなら、それを実行してくれて構いません（python art/generate_images.py）。
生成後、足りない/失敗した画像があれば一覧で報告してください。
```

---

## 2. 自分で実行する場合（スクリプト直叩き）

```powershell
cd C:\dev\sengoku-agent-tcg
pip install openai
python art\generate_images.py          # 武将15体を生成
python art\generate_images.py --equip  # 装備の絵も生成
python art\generate_images.py nobunaga.png shingen.png   # 一部だけ作り直し
```

生成された絵は `art/images/` に入り、ゲーム（index.html）を開くと**自動でカードに表示**されます。
（画像が無い間は、カードは家紋色の枠＋武将名のプレースホルダで表示されます。ゲームは画像なしでも遊べます。）

---

## 3. 一貫した画風で量産するコツ（調査済み・反映済み）

- **スタイルアンカー**（`prompts.json` の `styleAnchor`）を毎回プロンプト先頭に貼るのが、画風を揃える最強の方法です。すでに各 prompt の先頭に付けて生成します。
- **同じ武将を複数ポーズで作る**ときは、最初の1枚を「設定画」として保存し、それを参照画像（image-to-image）に渡して「顔・甲冑・配色は保持、ポーズだけ変更」と指示します。
- 参照画像は**3〜5枚に絞る**（入れすぎると逆に崩れます）。
- gpt-image-2 のサイズ上限は**長辺3840px・16の倍数・縦横3:1以内**。1024x1536 は安全圏です（世間で言う4K=4096はAPIで弾かれることがあります）。

---

## 生成されるファイルとカードの対応

| ファイル | キャラ |
|---|---|
| ashigaru.png | 足軽（たね） |
| kiba.png | 騎馬武者（たね） |
| yari.png | 槍足軽（たね） |
| yumi.png | 弓兵（たね） |
| teppo.png | 鉄砲足軽（たね） |
| mitsuhide.png | 明智光秀（侍大将） |
| yamagata.png | 山県昌景（侍大将） |
| kanetsugu.png | 直江兼続（侍大将） |
| tadakatsu.png | 本多忠勝（侍大将） |
| tokichiro.png | 木下藤吉郎（侍大将） |
| nobunaga.png | 織田信長（大名・伝説） |
| shingen.png | 武田信玄（大名・伝説） |
| kenshin.png | 上杉謙信（大名・伝説） |
| ieyasu.png | 徳川家康（大名・伝説） |
| hideyoshi.png | 豊臣秀吉（大名・伝説） |
| （--equip）katana / gusoku / sashimono / horo | 装備カード |
