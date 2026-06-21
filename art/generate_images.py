#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
全キャラ画像を GPT Image 2（gpt-image-2）で一括生成する。
prompts/prompts.json を読み、styleAnchor を各 prompt の先頭に付けて生成し、
images/<file> に1枚ずつ保存する。すでにある画像はスキップ。

使い方:
    1) pip install openai
    2) 環境変数に APIキーを入れる:  setx OPENAI_API_KEY "sk-..."（新シェルで有効）
    3) python art/generate_images.py        # 全部生成
       python art/generate_images.py nobunaga.png shingen.png   # 一部だけ
       python art/generate_images.py --equip # 装備も生成

注意: gpt-image-2 は2026-04-21公開のモデル。APIの引数名（size/quality等）は
      公開時点の仕様に合わせている。もし引数エラーが出たら、その時点の
      公式リファレンスに合わせて size / quality を調整すること。
"""
import os, sys, json, base64, time

HERE = os.path.dirname(os.path.abspath(__file__))
PROMPTS = os.path.join(HERE, "prompts", "prompts.json")
OUT = os.path.join(HERE, "images")

def main():
    args = [a for a in sys.argv[1:]]
    do_equip = "--equip" in args
    only = [a for a in args if not a.startswith("--")]

    with open(PROMPTS, encoding="utf-8") as f:
        data = json.load(f)

    anchor = data["styleAnchor"]
    model = data.get("model", "gpt-image-2")
    size = data.get("size", "1024x1536")
    quality = data.get("quality", "high")

    items = list(data["characters"])
    if do_equip:
        items += list(data.get("equipment", []))
    if only:
        items = [it for it in items if it["file"] in only]

    os.makedirs(OUT, exist_ok=True)

    try:
        from openai import OpenAI
    except ImportError:
        print("openai パッケージが要ります:  pip install openai")
        sys.exit(1)
    client = OpenAI()  # OPENAI_API_KEY を環境変数から読む

    print(f"モデル={model} サイズ={size} 品質={quality} 生成枚数={len(items)}")
    for it in items:
        path = os.path.join(OUT, it["file"])
        if os.path.exists(path):
            print(f"  skip (既存): {it['file']}")
            continue
        full = anchor + "\n\n" + it["prompt"]
        print(f"  生成中: {it['file']}  ({it['name']}) ...", end="", flush=True)
        try:
            resp = client.images.generate(model=model, prompt=full, size=size, quality=quality)
            b64 = resp.data[0].b64_json
            with open(path, "wb") as g:
                g.write(base64.b64decode(b64))
            print(" 保存OK")
        except Exception as e:
            print(f" 失敗: {e}")
        time.sleep(1)

    print("完了。images/ を確認してください。")

if __name__ == "__main__":
    main()
