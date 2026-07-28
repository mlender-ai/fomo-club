# 아키타입 골든셋 검증 (WO-SUB-02 §8)

- 룰셋: `archetype-v1.0.0`
- 라벨링 순서: 팩트시트를 보지 않고 **사업 내용 기준으로 먼저** 라벨 → 그 다음 실측 대조(§8-1)
- 생성 스크립트: `scripts/archetype-goldenset.ts` · 원본 `docs/archetype/goldenset_raw.json`

## 1. 측정 결과

| 구분 | n | 일치 | 일치율 | 위험 오분류 | 위험률 | UNCLASSIFIED |
|---|---|---|---|---|---|---|
| 전체 | 100 | 72 | 72% | 4 | 4% | 24 (24%) |
| KR | 50 | 36 | 72% | 1 | 2% | 13 (26%) |
| US | 50 | 36 | 72% | 3 | 6% | 11 (22%) |

- 목표: 일치율 ≥ 85% → **미달**
- 목표: 위험 오분류율 ≤ 5% → **달성**

> **`UNCLASSIFIED` 는 오분류가 아니다.** 프레임을 씌우지 않았으므로 오도하지 않는다(WO §8-2).
> 일치율과 별도로 집계한다.

## 2. 혼동 행렬 (행 = 정답, 열 = 분류기)

| 정답 \ 분류 | BANK FINANCIAL | BIOTECH PIPELINE | CYCLICAL COMMODITY | HYPERGROWTH UNPROFITABLE | MATURE INCOME | PHARMA STABLE | QUALITY COMPOUNDER | TURNAROUND LOSS | UNCLASSIFIED |
|---|---|---|---|---|---|---|---|---|---|
| BANK FINANCIAL | **20** | · | · | · | · | · | · | · | · |
| BIOTECH PIPELINE | · | · | · | · | · | · | · | 1 | 1 |
| CYCLICAL COMMODITY | · | · | **40** | · | · | · | · | · | · |
| HYPERGROWTH UNPROFITABLE | · | · | 2 | **1** | · | · | · | · | · |
| MATURE INCOME | · | · | · | · | · | · | · | · | 8 |
| PHARMA STABLE | · | · | · | · | · | **9** | · | · | 2 |
| QUALITY COMPOUNDER | · | · | · | · | · | · | **2** | · | 13 |
| TURNAROUND LOSS | · | · | · | 1 | · | · | · | · | · |
| UNCLASSIFIED | · | · | · | · | · | · | · | · | · |

## 3. 불일치 상세

| 종목 | 시장 | 기대 | 분류 | 성격 | 업종 | 규칙/사유 |
|---|---|---|---|---|---|---|
| 알테오젠 | KR | BIOTECH_PIPELINE | UNCLASSIFIED | 안전(프레임 없음) | 생물공학 | no_rule_matched |
| 리가켐바이오 | KR | BIOTECH_PIPELINE | TURNAROUND_LOSS | **위험(잘못된 프레임)** | 제약 | loss |
| 덴티움 | KR | PHARMA_STABLE | UNCLASSIFIED | 안전(프레임 없음) | 건강관리장비와용품 | no_rule_matched |
| 파마리서치 | KR | PHARMA_STABLE | UNCLASSIFIED | 안전(프레임 없음) | 건강관리장비와용품 | no_rule_matched |
| 한국전력 | KR | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | 전기유틸리티 | no_rule_matched |
| 한국가스공사 | KR | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | 가스유틸리티 | no_rule_matched |
| SK텔레콤 | KR | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | 무선통신서비스 | no_rule_matched |
| KT | KR | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | 다각화된통신서비스 | no_rule_matched |
| LG유플러스 | KR | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | 무선통신서비스 | no_rule_matched |
| NAVER | KR | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | 양방향미디어와서비스 | no_rule_matched |
| 카카오 | KR | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | 양방향미디어와서비스 | no_rule_matched |
| 삼성에스디에스 | KR | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | IT서비스 | no_rule_matched |
| 한화에어로스페이스 | KR | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | 우주항공과국방 | no_rule_matched |
| LIG넥스원 | KR | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | 우주항공과국방 | no_rule_matched |
| Microsoft | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Computer Software: Prepackaged Software | no_rule_matched |
| Adobe | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Computer Software: Prepackaged Software | no_rule_matched |
| Salesforce | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Computer Software: Prepackaged Software | no_rule_matched |
| Visa | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Business Services | no_rule_matched |
| Mastercard | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Business Services | no_rule_matched |
| Alphabet | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Computer Software: Programming, Data Processing | no_rule_matched |
| Costco | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Department/Specialty Retail Stores | no_rule_matched |
| Oracle | US | QUALITY_COMPOUNDER | UNCLASSIFIED | 안전(프레임 없음) | Computer Software: Prepackaged Software | no_rule_matched |
| Rivian | US | HYPERGROWTH_UNPROFITABLE | CYCLICAL_COMMODITY | **위험(잘못된 프레임)** | Auto Manufacturing | industry:cyclical+stdev |
| Lucid | US | HYPERGROWTH_UNPROFITABLE | CYCLICAL_COMMODITY | **위험(잘못된 프레임)** | Auto Manufacturing | industry:cyclical+stdev |
| Moderna | US | TURNAROUND_LOSS | HYPERGROWTH_UNPROFITABLE | **위험(잘못된 프레임)** | Biotechnology: Biological Products (No Diagnostic Substances) | loss+revenue_yoy>θ |
| Verizon | US | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | Telecommunications Equipment | no_rule_matched |
| AT&T | US | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | Telecommunications Equipment | no_rule_matched |
| Southern Company | US | MATURE_INCOME | UNCLASSIFIED | 안전(프레임 없음) | Electric Utilities: Central | no_rule_matched |

## 4. 통계로 확인되지 않은 시클리컬 판정

26건 — 업종 코드 단독 판정(독트린 §4-3). `stdev_confirmed: false` 로 남아 WO-SUB-07 이 분리 집계한다.

- 삼성전자(KR, 반도체와반도체장비)
- SK하이닉스(KR, 반도체와반도체장비)
- 한미반도체(KR, 반도체와반도체장비)
- DB하이텍(KR, 반도체와반도체장비)
- LG화학(KR, 화학)
- 롯데케미칼(KR, 화학)
- POSCO홀딩스(KR, 철강)
- 현대제철(KR, 철강)
- S-Oil(KR, 석유와가스)
- SK이노베이션(KR, 석유와가스)
- HD한국조선해양(KR, 조선)
- 삼성중공업(KR, 조선)
- HMM(KR, 해운사)
- 팬오션(KR, 해운사)
- 현대차(KR, 자동차)
- 기아(KR, 자동차)
- 현대모비스(KR, 자동차부품)
- OCI홀딩스(KR, 화학)
- 풍산(KR, 비철금속)
- 세아베스틸지주(KR, 철강)
- Nucor(US, Steel/Iron Ore)
- Dow(US, Major Chemicals)
- Phillips 66(US, Integrated oil Companies)
- Alcoa(US, Aluminum)
- Deere(US, Industrial Machinery/Components)
- Lucid(US, Auto Manufacturing)

## 5. 전체 라벨과 근거

| 종목 | 시장 | 라벨 근거 | 기대 | 분류 | coverage |
|---|---|---|---|---|---|
| KB금융 | KR | 은행지주 — 예대마진이 수익의 대부분 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 신한지주 | KR | 은행지주 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 하나금융지주 | KR | 은행지주 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 우리금융지주 | KR | 은행지주 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| BNK금융지주 | KR | 지방 은행지주 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 기업은행 | KR | 국책 은행 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 삼성화재 | KR | 손해보험 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 삼성생명 | KR | 생명보험 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| NH투자증권 | KR | 증권 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 삼성증권 | KR | 증권 | BANK_FINANCIAL | BANK_FINANCIAL | partial |
| 삼성전자 | KR | 메모리 반도체 비중 — 제품 가격 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| SK하이닉스 | KR | 메모리 반도체 — 사이클 대표 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 한미반도체 | KR | 반도체 장비 — 설비 투자 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| DB하이텍 | KR | 파운드리 — 가동률 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| LG화학 | KR | 석유화학 — 스프레드 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 롯데케미칼 | KR | 석유화학 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| POSCO홀딩스 | KR | 철강 — 원료·제품 가격 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 현대제철 | KR | 철강 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| S-Oil | KR | 정유 — 정제마진 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| SK이노베이션 | KR | 정유·배터리 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| HD한국조선해양 | KR | 조선 — 수주 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 삼성중공업 | KR | 조선 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| HMM | KR | 컨테이너 해운 — 운임 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 팬오션 | KR | 벌크 해운 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 현대차 | KR | 완성차 — 수요 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 기아 | KR | 완성차 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 현대모비스 | KR | 자동차 부품 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| OCI홀딩스 | KR | 폴리실리콘 — 가격 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 풍산 | KR | 비철금속(구리) — 가격 사이클 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 세아베스틸지주 | KR | 특수강 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | partial |
| 종근당 | KR | 판매 중인 전문·일반의약품 매출 | PHARMA_STABLE | PHARMA_STABLE | partial |
| 유한양행 | KR | 제약 — 판매 매출 기반 | PHARMA_STABLE | PHARMA_STABLE | partial |
| 대웅제약 | KR | 제약 | PHARMA_STABLE | PHARMA_STABLE | partial |
| 한미약품 | KR | 제약 | PHARMA_STABLE | PHARMA_STABLE | partial |
| 종근당홀딩스 | KR | 제약 지주 | PHARMA_STABLE | PHARMA_STABLE | partial |
| SK바이오팜 | KR | 세노바메이트 판매 매출 발생 — 개발단계 아님 | PHARMA_STABLE | PHARMA_STABLE | partial |
| 알테오젠 | KR | 기술이전 중심 — 제품 매출 미미 | BIOTECH_PIPELINE | UNCLASSIFIED ⚠︎ | partial |
| 리가켐바이오 | KR | ADC 개발단계 | BIOTECH_PIPELINE | TURNAROUND_LOSS ⚠︎ | partial |
| 덴티움 | KR | 임플란트 — 판매 매출 기반 의료기기 | PHARMA_STABLE | UNCLASSIFIED ⚠︎ | partial |
| 파마리서치 | KR | 필러·의료기기 판매 | PHARMA_STABLE | UNCLASSIFIED ⚠︎ | partial |
| 한국전력 | KR | 규제 유틸리티 — 저성장 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | partial |
| 한국가스공사 | KR | 가스 유틸리티 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | partial |
| SK텔레콤 | KR | 통신 — 저성장·고배당 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | partial |
| KT | KR | 통신 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | partial |
| LG유플러스 | KR | 통신 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | partial |
| NAVER | KR | 플랫폼 — 성장 + 흑자 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | partial |
| 카카오 | KR | 플랫폼 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | partial |
| 삼성에스디에스 | KR | IT서비스 — 안정 흑자 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | partial |
| 한화에어로스페이스 | KR | 방산 — 수주 성장 + 흑자 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | partial |
| LIG넥스원 | KR | 방산 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | partial |
| JPMorgan | US | 대형 은행 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| Bank of America | US | 대형 은행 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| Wells Fargo | US | 대형 은행 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| Columbia Financial | US | 저축은행 지주 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| Rhinebeck Bancorp | US | 저축은행 지주 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| SoFi | US | 대출 기반 핀테크 — 예대마진 구조 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| Charles Schwab | US | 증권·은행 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| Allstate | US | 손해보험 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| MetLife | US | 생명보험 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| BlackRock | US | 자산운용 | BANK_FINANCIAL | BANK_FINANCIAL | full |
| Micron | US | 메모리 반도체 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Western Digital | US | HDD·낸드 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Seagate | US | HDD | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Nucor | US | 철강 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Steel Dynamics | US | 철강 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Cleveland-Cliffs | US | 철강·철광석 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Dow | US | 석유화학 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| LyondellBasell | US | 석유화학 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Celanese | US | 화학 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Valero | US | 정유 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Marathon Petroleum | US | 정유 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Phillips 66 | US | 정유 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| CF Industries | US | 비료 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Mosaic | US | 비료 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Freeport-McMoRan | US | 구리 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Alcoa | US | 알루미늄 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Matson | US | 해운 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Caterpillar | US | 건설기계 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Deere | US | 농기계 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Ford | US | 완성차 | CYCLICAL_COMMODITY | CYCLICAL_COMMODITY | full |
| Microsoft | US | 소프트웨어 — 성장 + 흑자 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| Adobe | US | 소프트웨어 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| ServiceNow | US | 엔터프라이즈 SaaS | QUALITY_COMPOUNDER | QUALITY_COMPOUNDER | full |
| Salesforce | US | SaaS | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| Shopify | US | 커머스 플랫폼 | QUALITY_COMPOUNDER | QUALITY_COMPOUNDER | full |
| Visa | US | 결제 네트워크 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| Mastercard | US | 결제 네트워크 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| Alphabet | US | 광고·클라우드 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| Costco | US | 회원제 소매 — 안정 성장 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| Oracle | US | 소프트웨어 — 전환기 경계 케이스 | QUALITY_COMPOUNDER | UNCLASSIFIED ⚠︎ | full |
| CoreWeave | US | AI 인프라 — 매출 급증 + 적자 | HYPERGROWTH_UNPROFITABLE | HYPERGROWTH_UNPROFITABLE | full |
| Rivian | US | 전기차 — 매출 성장 + 대규모 적자 | HYPERGROWTH_UNPROFITABLE | CYCLICAL_COMMODITY ⚠︎ | full |
| Lucid | US | 전기차 — 적자 | HYPERGROWTH_UNPROFITABLE | CYCLICAL_COMMODITY ⚠︎ | full |
| Moderna | US | 코로나 매출 급감 후 적자 — 성장 없음 | TURNAROUND_LOSS | HYPERGROWTH_UNPROFITABLE ⚠︎ | full |
| Pfizer | US | 대형 제약 — 판매 매출 기반 | PHARMA_STABLE | PHARMA_STABLE | full |
| Johnson & Johnson | US | 제약·헬스케어 | PHARMA_STABLE | PHARMA_STABLE | full |
| Abbott | US | 의료기기·진단 | PHARMA_STABLE | PHARMA_STABLE | full |
| Verizon | US | 통신 — 저성장·고배당 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | full |
| AT&T | US | 통신 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | full |
| Southern Company | US | 전기 유틸리티 | MATURE_INCOME | UNCLASSIFIED ⚠︎ | full |
