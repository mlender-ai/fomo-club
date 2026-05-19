#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$APP_DIR")")"
OUT=/tmp/tarot-verify-$$

echo "=== 타로 증권 번들 검증 ==="
echo ""

ERRORS=0

# 1. React 버전 확인
APP_REACT=$(node -e "console.log(require('$APP_DIR/node_modules/react/package.json').version)" 2>/dev/null || echo "MISSING")
ROOT_REACT=$(node -e "console.log(require('$ROOT_DIR/node_modules/react/package.json').version)" 2>/dev/null || echo "MISSING")
echo "[1] React 버전"
echo "    앱 로컬: $APP_REACT"
echo "    루트:    $ROOT_REACT"
if [ "$APP_REACT" = "MISSING" ]; then
  echo "    FAIL: 앱 로컬 react 없음"; ERRORS=$((ERRORS+1))
elif [ "$APP_REACT" = "$ROOT_REACT" ]; then
  echo "    OK (단일 버전)"
else
  echo "    OK (격리됨 — metro.config.js blockList 적용)"
fi

# 2. babel-preset-expo 경로 확인
BABEL_PRESET="$APP_DIR/node_modules/expo/node_modules/babel-preset-expo"
if [ -d "$BABEL_PRESET" ]; then
  echo "[2] babel-preset-expo: OK"
else
  echo "[2] babel-preset-expo: FAIL — 경로 없음"; ERRORS=$((ERRORS+1))
fi

# 3. metro.config.js blockList 패턴 확인
if grep -q "blockList" "$APP_DIR/metro.config.js"; then
  echo "[3] metro.config.js blockList: OK"
else
  echo "[3] metro.config.js blockList: FAIL — blockList 없음"; ERRORS=$((ERRORS+1))
fi

# 4. app config plugins 확인 (reanimated 없어야 함)
# app.config.ts (dynamic) 또는 app.json (static) 모두 지원
if [ -f "$APP_DIR/app.config.ts" ] || [ -f "$APP_DIR/app.config.js" ]; then
  # dynamic config — npx expo config로 최종 결과 확인
  RESOLVED=$(cd "$APP_DIR" && npx expo config --json 2>/dev/null || echo '{}')
  if echo "$RESOLVED" | node -e "
    const input = require('fs').readFileSync(0, 'utf8');
    const cfg = JSON.parse(input);
    const plugins = cfg.plugins || [];
    const bad = plugins.filter(p => typeof p === 'string' && p.includes('reanimated'));
    if (bad.length > 0) { process.exit(1); }
  " 2>/dev/null; then
    echo "[4] app.config plugins: OK"
  else
    echo "[4] app.config plugins: FAIL — reanimated plugin 감지"; ERRORS=$((ERRORS+1))
  fi
elif [ -f "$APP_DIR/app.json" ]; then
  if node -e "
    const a = require('$APP_DIR/app.json');
    const plugins = (a.expo || a).plugins || [];
    const bad = plugins.filter(p => typeof p === 'string' && p.includes('reanimated'));
    if (bad.length > 0) { process.exit(1); }
  " 2>/dev/null; then
    echo "[4] app.json plugins: OK"
  else
    echo "[4] app.json plugins: FAIL — reanimated plugin 감지"; ERRORS=$((ERRORS+1))
  fi
else
  echo "[4] FAIL — app.json 또는 app.config.ts 없음"; ERRORS=$((ERRORS+1))
fi

# 5. 네이티브 전용 모듈 직접 import 감지 (Expo Go 크래시 원인)
echo "[5] 네이티브 전용 모듈 직접 import 검사..."
NATIVE_MODULES=("react-native-google-mobile-ads" "react-native-purchases")
NATIVE_FAIL=0
for MOD in "${NATIVE_MODULES[@]}"; do
  # try-require 패턴이 아닌 직접 import/require 감지
  HITS=$(grep -rl "from ['\"]${MOD}" "$APP_DIR/app" "$APP_DIR/lib" 2>/dev/null | while read f; do
    # try { ... } catch 블록 안에 있으면 안전 — 없는 경우만 출력
    if ! grep -q "try {" "$f"; then echo "$f"; fi
  done || true)
  if [ -n "$HITS" ]; then
    echo "    FAIL: $MOD 직접 import 감지 (try-require 패턴 사용할 것):"
    echo "$HITS" | sed 's/^/      /'
    NATIVE_FAIL=1; ERRORS=$((ERRORS+1))
  fi
done
if [ "$NATIVE_FAIL" -eq 0 ]; then
  echo "    OK — 직접 import 없음"
fi

# 6. 실제 번들링 테스트
echo "[6] iOS 번들링 테스트 중..."
BUNDLE_OUT=$(npx expo export --platform ios --output-dir "$OUT" 2>&1)
if echo "$BUNDLE_OUT" | grep -q "Exported:"; then
  if echo "$BUNDLE_OUT" | grep -qi "Error:"; then
    echo "    WARN — 번들 생성됐으나 에러 메시지 포함:"
    echo "$BUNDLE_OUT" | grep -i "error" | sed 's/^/    /'
  else
    echo "    OK — 에러 없이 번들 생성 성공"
  fi
  rm -rf "$OUT"
else
  echo "    FAIL — 번들링 실패"
  echo "$BUNDLE_OUT" | tail -20 | sed 's/^/    /'
  ERRORS=$((ERRORS+1))
fi

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "=== 모든 검증 통과 ✓ ==="
  exit 0
else
  echo "=== 검증 실패: ${ERRORS}개 항목 — push 금지 ==="
  exit 1
fi
