#!/usr/bin/env bash
# OPS-04 A-2 — 서버 후보 지역에서 FCE · 랩 러너가 쓰는 외부 API 를 한 번씩 부른다.
#
#   bash probe-apis.sh            # 후보 서버에서. 키 없이 돈다
#
# 하나라도 지역 차단(403 · 451)이면 **그 지역은 탈락**이다. 종료 코드 1.
#
# 목록은 코드에서 뽑았다(2026-09-30):
#   FCE  backend/app — api.bitget.com · api.hyperliquid.xyz · stats-data.hyperliquid.xyz · openapi.tossinvest.com
#        open-api-v4.coinglass.com · marketdata.theocc.com · api.telegram.org · api.openai.com
#   랩   scripts/lab/collect — data-api.binance.vision · fapi.binance.com(펀딩비 — 미국 GitHub 러너에서 451 이었다)
#   폴리마켓(gamma-api · clob)은 **판정에 넣지 않는다.** 제외 유지 · 지역을 그것 때문에 고르지 않는다(OPS-04 A-2).
#
# 키가 필요한 곳(토스 · CoinGlass · OpenAI)은 키 없이 부르면 401 이 온다 — **닿았다는 뜻**이다(지역 차단은 403/451).
# 키로 200 을 확인하는 것은 🧑 키를 넣은 뒤 `probe-apis.sh --with-fce` (FCE 자기 진단)로 한다.
set -uo pipefail

UA="fomo-ops-probe/1"
fail=0
row() { printf '%-4s %-5s %-34s %s\n' "$1" "$2" "$3" "$4"; }

probe() { # 이름 기대 URL [POST 본문]
  local name="$1" want="$2" url="$3" body="${4:-}" code
  if [ -n "$body" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -A "$UA" -H 'content-type: application/json' -d "$body" "$url")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -A "$UA" "$url")
  fi
  local verdict
  case "$code" in
    200) verdict="✅" ;;
    401) if [ "$want" = "auth" ]; then verdict="✅"; else verdict="❌"; fi ;;  # 키가 필요한 곳 — 닿았다
    403|451) verdict="⛔"; fail=1 ;;                                          # 지역 · IP 차단
    000) verdict="❌"; fail=1 ;;                                               # 연결 안 됨
    *) verdict="❓" ;;
  esac
  [ "$verdict" = "❌" ] && fail=1
  row "$verdict" "$code" "$name" "$url"
}

echo "지역: $(curl -s --max-time 10 https://ipinfo.io/country 2>/dev/null || echo '?') · 공인 IP: $(curl -s --max-time 10 https://api.ipify.org 2>/dev/null || echo '?')"
echo
row "판정" "코드" "무엇" "주소"
probe "Bitget 선물 봉 (FCE 크립토)"      open "https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT&productType=USDT-FUTURES&granularity=4H&limit=1"
probe "Hyperliquid info (고래)"          open "https://api.hyperliquid.xyz/info" '{"type":"meta"}'
probe "Hyperliquid 리더보드 (고래)"      open "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard"
probe "Binance 현물 시세 (랩 러너)"      open "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT"
probe "Binance 선물 펀딩비 (랩 러너)"    open "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1"
probe "OCC 시장 자료 (FCE)"              open "https://marketdata.theocc.com/"
probe "Telegram API (알림)"              open "https://api.telegram.org/"
probe "토스 OpenAPI (주식 · 키 필요)"    auth "https://openapi.tossinvest.com/api/v1/market-calendar/KR"
probe "CoinGlass (키 필요)"              auth "https://open-api-v4.coinglass.com/api/futures/supported-coins"
probe "OpenAI (리포트 · 키 필요)"        auth "https://api.openai.com/v1/models"
probe "랩 정규 도메인"                   open "https://fomo-web-mlender-ais-projects.vercel.app/api/fomo/ops/version"

if [ "${1:-}" = "--with-fce" ]; then
  echo
  echo "── FCE 자기 진단 (🧑 키를 넣은 뒤 · FCE 가 떠 있어야 한다)"
  curl -s --max-time 30 http://127.0.0.1:8875/api/system/toss/auth-diagnosis | head -c 600; echo
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "통과 — 이 지역에서 막힌 API 가 없다."
else
  echo "탈락 — ⛔(지역·IP 차단) 또는 ❌(연결 안 됨)이 있다. 이 지역은 쓰지 않는다."
fi
exit "$fail"
