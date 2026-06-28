# Data Source Enrichment — 2026-06-28

이 문서는 발견 카드/상세의 근거를 강화하기 위해 바로 연결했거나, 후속으로 검토할 공개 데이터 소스를 정리한다. 원칙은 `PRODUCT_VISION`과 동일하다: 행동 지시나 미래 단정이 아니라, 종목 발견을 돕는 확인 가능한 사실만 쓴다.

## 이번에 제품에 연결한 것

### DART 공시
- API: `https://opendart.fss.or.kr/api/list.json`
- Env: `DART_API_KEY` 또는 `DART_CRTFC_KEY`
- 사용처: 국내 종목 발견 이벤트와 상세 공식 근거.
- 반영: 공시명뿐 아니라 DART 원문 링크(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=...`)를 보존한다.

### FRED 공식 거시 지표
- 키리스 CSV: `https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES_ID}`
- 키 기반 JSON(선택): `https://api.stlouisfed.org/fred/series/observations`
- Env: `FRED_API_KEY` 선택.
- 사용처: 종목 상세의 공식 지표. 원/달러 환율, 미국 금리, 나스닥, S&P 500, VIX, WTI 등 섹터/국가별 배경 지표를 붙인다.
- 주의: 거시 지표는 강세/약세 판정이 아니라 배경 근거로만 노출한다.

## 이미 있는 경로

### 수급/KRX 계열
- 사용처: 외국인·기관 수급 facts.
- 현재 구현: `apps/web/lib/supply-demand-store.ts`, `scripts/supply-demand-collect.ts`.
- 다음 보강: 최근 5일 누적/연속 수급을 공식 지표 섹션에 더 선명하게 표시.

### Yahoo Finance RSS
- 사용처: 미국 종목별 뉴스 제목 수집.
- 주의: 차트/quote API는 Node 환경에서 429 리스크가 있어 사용하지 않는다. RSS 뉴스만 제한적으로 사용한다.

## 후속 후보

### Finnhub
- API: `https://finnhub.io/docs/api`
- 장점: 미국 종목 뉴스, 실적 캘린더, 재무 지표.
- 필요: API key, 비용/쿼터 검토.
- 제품 적용 후보: 미국 종목의 실적 일정·뉴스 재료 보강.

### Investing.com / MacroMicro / Finviz
- 장점: 경제 일정, 히트맵, 매크로 대시보드.
- 주의: 공식 API 또는 재배포 가능 조건 확인 필요. 스크래핑 우선 도입 금지.

### TradingView
- 장점: 차트 UX 레퍼런스.
- 주의: 데이터 소스가 아니라 UI/차트 표현 참고에 가깝다. 라이선스 확인 전 데이터 수집원으로 쓰지 않는다.
