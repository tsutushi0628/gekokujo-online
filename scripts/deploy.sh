#!/bin/bash
#
# deploy.sh - gekokujo-online Firebase デプロイ
#
# 事前設定:
#   export DEPLOY_ACCOUNT="your-account@example.com"
#
# Usage:
#   ./scripts/deploy.sh                    # 全デプロイ（hosting + functions + firestore）
#   ./scripts/deploy.sh --only hosting     # hosting のみ
#   ./scripts/deploy.sh --only functions   # functions のみ
#   ./scripts/deploy.sh --only firestore   # firestore rules + indexes のみ
#

set -euo pipefail

ACCOUNT="${DEPLOY_ACCOUNT:?DEPLOY_ACCOUNT is required}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$ROOT_DIR/functions"

echo "=== gekokujo-online デプロイ ==="
echo "Account: $ACCOUNT"
echo ""

# --- プリフライトチェック + ビルド ---
echo "[preflight] functions TypeScript ビルド..."
cd "$FUNCTIONS_DIR"
npx tsc
echo "[preflight] ビルド OK"
echo ""

# --- デプロイ対象の決定 ---
if [ $# -eq 0 ]; then
  DEPLOY_ARGS="--only hosting,functions,firestore"
  echo "[deploy] 全デプロイ (hosting + functions + firestore)"
else
  DEPLOY_ARGS="$*"
  echo "[deploy] 部分デプロイ ($*)"
fi

# --- Firebase デプロイ実行 ---
cd "$ROOT_DIR"
npx firebase-tools deploy $DEPLOY_ARGS --account "$ACCOUNT"

echo ""
echo "=== デプロイ完了 ==="
echo "https://gekokujo-online.web.app"
