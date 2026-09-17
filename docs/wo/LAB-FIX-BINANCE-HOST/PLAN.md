# PLAN: GitHub 러너 공개 시세 수집 복구

## 1. 접근
- 기존 `fetchBinancePrices`·`fetchBinanceCandles`와 응답 검증을 그대로 재사용한다.
- 현물 공개 API base URL만 `data-api.binance.vision`으로 교체한다.
- 벤치마크 수집도 같은 공식 호스트를 쓴다.

## 2. 파일 영향
| 파일 | 변경 이유 | 리스크 |
|---|---|---|
| `scripts/lab/collect/sources.ts` | 실시간 시세·봉 공식 공개 호스트 | URL 회귀 |
| `scripts/lab/collect-benchmark.ts` | 벤치마크 공식 공개 호스트 | URL 회귀 |
| `packages/lab/__tests__/source-host.test.ts` | 호스트 고정 | 없음 |
| `docs/lab/DATA_SOURCES.md` | 실행 위치 실측 기록 | 없음 |

## 3. 데이터 흐름
1. GitHub Actions가 공개 시세/봉을 요청한다.
2. 기존 모양 검증과 확정 봉 필터를 통과한다.
3. 기존 Prisma 테이블에 upsert/createMany 한다.
4. HTTP 오류나 모양 오류는 그대로 실패한다.

## 4. 검증 계획
- 관련 vitest
- `npm test`
- `npm run typecheck`
- `npm run build`
- Actions `latest`, `candles`
