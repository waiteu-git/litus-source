#!/usr/bin/env bash
# ラズパイ側セットアップを1コマンドで行う。pi 上で litus repo を取得済みの状態から実行する。
#   例) cd ~/litus/ops/canary && bash deploy-pi.sh
# 事前条件: node/npm 導入済み、~/ops/ops.env に OPS_WEBHOOK_URL、
#           ~/ops/storageState.json をデスクトップからコピー済み（手動MFAキャプチャの成果物）。
# このスクリプトは資格情報を扱わない。cron 登録まで行い、最後に手動スモークを促す。
set -euo pipefail

CANARY_DIR="$(cd "$(dirname "$0")" && pwd)"
LITUS_ROOT="$(cd "$CANARY_DIR/../.." && pwd)"

echo "[deploy] litus root = $LITUS_ROOT"
echo "[deploy] canary dir = $CANARY_DIR"

# 1. litus src/parsers が内部で使う node-html-parser を litus root に1つだけ置く（重い全依存は不要）。
echo "[deploy] installing node-html-parser at litus root (single dep)"
( cd "$LITUS_ROOT" && npm install --no-save node-html-parser )

# 2. カナリア自身の依存（playwright/tsx/node-html-parser）と chromium。
echo "[deploy] installing canary deps + chromium"
( cd "$CANARY_DIR" && npm install && npx playwright install --with-deps chromium )

# 3. 実行時ディレクトリ。
mkdir -p "$HOME/ops/canary-fixtures" "$HOME/ops/logs"

# 4. 前提ファイルの存在チェック（無ければ警告して続行）。
[ -f "$HOME/ops/ops.env" ] || echo "[deploy] WARN: ~/ops/ops.env が無い（OPS_WEBHOOK_URL 未設定だと通知が飛ばない）"
[ -f "$HOME/ops/storageState.json" ] || echo "[deploy] WARN: ~/ops/storageState.json が無い（デスクトップで capture→scp してください。無いとスモークは storageState エラー）"

# 5. cron 登録（1日2回・JST 08:00/20:00・メンテ帯回避。既存の同一行は重複させない）。
CRON_LINE="0 8,20 * * * cd $CANARY_DIR && /usr/bin/npm run canary >> $HOME/ops/logs/canary.log 2>&1"
if crontab -l 2>/dev/null | grep -Fq "$CANARY_DIR && /usr/bin/npm run canary"; then
  echo "[deploy] cron already registered; skip"
else
  ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
  echo "[deploy] cron registered: $CRON_LINE"
fi

echo ""
echo "[deploy] done. 次:"
echo "  1) 資格情報不要の疎通確認: npm run smoke"
echo "  2) storageState 設置後の本番スモーク: npm run canary"
