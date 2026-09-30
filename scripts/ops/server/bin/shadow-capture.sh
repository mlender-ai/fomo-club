#!/usr/bin/env bash
# 그림자 기록 — 업로드할 페이로드를 **파일로만** 남긴다 (OPS-04 PART D).
# `fce-upload.ts --emit` 은 push 전에 돌아온다. 랩에 아무것도 가지 않는다.
set -euo pipefail
DIR="${SHADOW_DIR:-/var/lib/fomo/shadow}"
KEEP_DAYS="${SHADOW_KEEP_DAYS:-14}"
mkdir -p "$DIR"
out="$DIR/fce-$(date -u +%Y%m%dT%H%M%SZ).json"
cd /opt/fomo-club
/usr/bin/node node_modules/tsx/dist/cli.mjs scripts/lab/fce-upload.ts --emit="$out"
find "$DIR" -maxdepth 1 -name 'fce-*.json' -mtime +"$KEEP_DAYS" -delete
