#!/bin/bash
# クラウドの Claude Code セッション開始時に依存パッケージを入れる（.claude/settings.json の SessionStart フックから呼ばれる）。
# ローカルでは何もしない。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm ci --no-audit --no-fund
