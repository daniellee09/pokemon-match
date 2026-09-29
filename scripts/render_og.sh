#!/bin/sh
# 링크 미리보기 카드(og-image.png)를 headless Chrome으로 렌더링
cd "$(dirname "$0")/.."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=8000 \
  --screenshot="$PWD/og-image.png" "file://$PWD/scripts/og-image.html"
