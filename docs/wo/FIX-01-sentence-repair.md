# FIX-01 — 말이 안 되는 문장 고치기

> 정본은 이 문서다. 코드(`packages/fomo-core/src/keyword-cards/company-read.ts` ·
> `sector-display.ts` · `apps/fomo-web/components/DepthSteps.tsx` · `MacroDepth.tsx`)와
> 함께 바꾼다. 지시: 2026-09-04 광혁 — "화면에 모순되거나 반복되는 문장이 없다.
> 지금 앱을 만든 사람도 이해 못 한다."

## 0. 화면에서 찾은 것 — 실측 네 장

| # | 증상 | 어디 |
|---|---|---|
| 0-1 | `매출 -1.0%` 아래 `작년보다 줄었어요 · 3년째 늘고 있어요` — **한 줄에 정반대** | PS일렉트로닉스 3걸음 |
| 0-2 | `최근 5년 중 높은 쪽이에요` 아래 `●○○○○ 최근 5년 중 높은 편이에요` — **같은 말 두 번** | PS일렉트로닉스 · Pinnacle Financial |
| 0-3 | 요약에 `제약 업종 안에서 낮은 편이에요` — **무엇이 낮은지 없다** | 종근당 4걸음 |
| 0-4 | `어떻게 계산했나요` 가 한 화면에 **두 번**, 하나는 **이미 펼쳐진 채** | PS일렉트로닉스 3걸음 |
| 0-5 | `Major Banks 업종 중간값 1.02배와 비슷해요` — **영어 + 통계 용어** | Pinnacle Financial |
| 0-6 | `우리가 짚은 종목 중 여기 닿는 곳` — **「닿는다」가 무슨 뜻인지 모른다** | 회사채 3년 금리 3걸음 |
| 0-7 | `영업이익 -97.1%` 인데 점 2개 + `늘어난 것과 줄어든 것이 섞여 있어요` | PS일렉트로닉스 3걸음 |

## PART A — 모순 문장

원인은 **두 사실을 따로 만들어 `·` 로 이어 붙인 것**이다.

```ts
const trend = g.revenueCagr3y > 0 ? " · 3년째 늘고 있어요" : "";
comparison: `작년보다 ${yoy >= 0 ? "늘었어요" : "줄었어요"}${trend}`
```

### 고친 규칙

| 규칙 | 구현 |
|---|---|
| **한 지표에 한 문장** | `comparison` 은 작년 같은 기간 대비 **한 방향만** |
| 기간이 다른 둘째 사실은 **줄을 나눈다** | 새 필드 `trend` → 화면이 다른 `<p>`(`depth-trend`)로 그린다 |
| **방향이 반대일 때만** 둘째 줄을 만든다 | 같은 방향이면 같은 말을 두 번 하는 것이다 |
| 작년 대비가 없으면 3년을 본문으로 | A-2 우선순위 ② |
| 숫자 크기를 말로도 구분 | `-1.0%` → `조금 줄었어요` · `-97.1%` → `크게 줄었어요` (5% 미만 `조금`, 50% 이상 `크게`) |

```
전   매출 -1.0%   작년보다 줄었어요 · 3년째 늘고 있어요
후   매출 -1.0%   작년 같은 기간보다 조금 줄었어요
                 다만 3년으로 보면 늘어왔어요
```

### 검사 (완료 확인 1)

`company-read.test.ts` 가 **360가지 입력 조합**을 돌려 한 줄에 반대 쌍
(늘↔줄 · 높↔낮 · 좋↔나쁘 · 오르↔내리)이 같이 나오는지 본다.
`fix01SentenceRepair.test.ts` 는 같은 자를 **fomo-web 소스 전체의 한글 문자열**에 댄다.

**어간까지 본다** — `/늘/` 만 쓰면 `오늘` 이 걸린다(실제로 `오늘 한 줄 정리` 가 잡혔다).

## PART B — 중복 지우기

종전 규약은 「**점이 있으면 문장이 반드시 있다**」였다(`company-read.test.ts` 에 그렇게
적혀 있었다). 그 규약이 0-2 를 만들었다 — 줄 설명과 거의 같은 말을 점 옆에 또 쓴 것이다.

**규약을 뒤집었다**: `scoreText` 는 **줄이 말하지 않은 사실**일 때만 채운다.

| 덩어리 | 점 옆 문장 | 왜 |
|---|---|---|
| 돈은 잘 버나요 | **없음** | 매출·영업이익·영업이익률 세 줄이 방향을 각각 말했다 |
| 값은 어떤가요 | 적자일 때만 `적자라서 이익으로는 값을 잴 수 없어요` | 그 사실은 어느 줄에도 없다(PER 줄이 아예 없는 이유다) |
| 빚은 괜찮나요 | **없음** | 부채비율 줄이 업종 견줌을 말했다 |

점의 방향은 **화면 하단 범례 한 줄**이 말한다(`● 이 많을수록 좋은 쪽이에요`) —
점마다 설명을 붙이는 대신 화면에 한 번만 둔다. 점이 하나도 없으면 범례도 없다.

## PART C — 주어 없는 문장

4걸음 요약은 **섹션 제목도 줄 라벨도 없는 자리**다. 거기에 점 옆 문장(`scoreText`)을
그대로 옮겨 담아 `제약 업종 안에서 낮은 편이에요` 가 앉았다.

새 필드 `summaryText` 는 **항상 주어를 앞에 둔다.**

```
전   제약 업종 안에서 낮은 편이에요
후   PER·PBR이 제약 업종 안에서 낮은 편이에요
     빚은 같은 업종보다 적어요
     매출도 영업이익도 줄었어요
```

`PBR가` 가 아니라 `PBR이` 다 — `josa()` 가 **알파벳 마지막 글자를 한국어로 읽어**
받침을 판정하게 고쳤다(`PBR`=피비**알** → 받침). 종전에는 비한글이면 전부 받침 없음으로
보아 실측 화면에 `PBR가` 가 나갔다.

## PART D — 「어떻게 계산했나요」

| 항목 | 전 | 후 |
|---|---|---|
| 위치 | 덩어리마다 | **걸음 맨 아래 하나** |
| 상태 | 하나는 펼쳐진 채 | **기본 닫힘** |
| 문구 | `어떻게 계산했나요` | `점수는 이렇게 매겼어요` |
| 내용 | 그 덩어리 것 하나 | 세 덩어리를 **한자리에** |

## PART E — 영어 지우기

### E-1. 업종명

미국 종목의 `classification.industry` 는 **나스닥 원문**이다
(`api.nasdaq.com/api/quote/{sym}/summary` 의 `Industry`). 국내는 `sectorDisplayName` 표가
이 일을 하고 있었는데 미국은 아무 표도 타지 않았다.

**모르는 이름은 지어내지 않고 이름을 뺀다.** 국내 표의 규칙(「없으면 원문 그대로」)을
영어에 쓸 수 없다 — 원문이 곧 문제다. 표에 없으면 `null` 이고 문장은 `같은 업종` 으로 쓴다.
`금융` 같은 상위 이름으로 갈아치우지 않는다: 통계 모수는 `Major Banks` 구성원이므로
다른 이름을 붙이면 없는 모수를 말하는 것이 된다.

### E-2. `중간값` → `평균`

**계산은 그대로 중앙값이다.** PER 은 적자 직전 종목에서 수백 배로 튀어 평균을 망가뜨린다
(`sector-stats.ts`). 바뀐 것은 표시뿐이고, 중앙값이라는 사실은 `점수는 이렇게 매겼어요`가
`가운데 값` 이라고 밝힌다.

```
전   Major Banks 업종 중간값 1.02배와 비슷해요
후   은행 업종 평균 1.02배와 비슷해요
```

종전 테스트(「업종 통계를 `평균` 이라고 쓰지 않는다」)를 **뒤집었다** — 이유를 그 자리에
적었다.

## PART F — 「닿는 곳」

```
전   우리가 짚은 종목 중 여기 닿는 곳          최근 30일 · 16곳
후   회사채 3년 금리에 영향받는 종목            우리가 최근 30일에 짚은 16곳
```

카드 앞면도 같이 고쳤다(`macroSupport`): `… 16곳이 여기 닿아요` → `… 16곳이 영향받아요`.
걸음 버튼 문구도 `우리 종목 중 어디가 닿는지 보기` → `영향받는 우리 종목 보기`.

## PART G — 숫자와 점이 안 맞던 것

### 원인 (G-2 확인 결과)

점수는 **세 항목**으로 낸다. 그런데 **셋째가 화면에 없었다.**

```
매출 YoY > 0            → 화면에 있음 (-1.0%)
영업이익 YoY > 0         → 화면에 있음 (-97.1%)
영업이익률(TTM) > 0      → 화면에 없음  ← 여기서 한 표가 나왔다
```

`hit 1 / 3 → round(1/3 × 5) = 2점`. 그리고 `hit` 가 0도 전부도 아니므로
「늘어난 것과 줄어든 것이 섞여 있어요」가 나왔다. **화면에는 줄어든 것만 둘 있었으니
거짓말이다.**

### 고친 것 (G-3)

지시서의 두 갈래 중 **「점수 계산에 들어가는 항목을 보여준다」** 를 골랐다 —
흑자 여부는 버릴 수 없는 재료다(적자 회사를 매출 증가만으로 높게 매길 수 없다).

```
후   매출      -1.0%   작년 같은 기간보다 조금 줄었어요
                       다만 3년으로 보면 늘어왔어요
     영업이익  -97.1%  작년 같은 기간보다 크게 줄었어요
     영업이익률 +1.2%   지금은 영업에서 흑자예요        ← 셋째 표가 화면에 섰다
     ●●○○○
```

「섞여 있어요」는 **문구를 없앴다.** 요약에서는 무엇이 늘고 무엇이 줄었는지 말한다
(`매출은 늘었는데 영업이익은 줄었어요`).

## 보고할 것 1 — 미국 업종 표시명 표 (검토용)

총 101개 · 실측 확인(★) 47개

★ = `packages/fomo-core/src/archetype/ruleset.ts` 가 **실측 응답에서 가져온 문자열**
(그 파일 머리말: "추측한 업종명으로 집합을 만들면 매칭이 조용히 실패한다").
★ 이 없는 것은 나스닥 스크리너 어휘로 채운 것이라 **표기가 다르면 조용히 안 맞는다** —
안 맞으면 이름 없이 `같은 업종` 으로 나가므로 화면은 깨지지 않고,
무엇이 안 맞았는지는 `untranslatedIndustryNames()` 가 목록으로 준다.

**검토할 것**: 이름이 업종을 정확히 가리키나(`Medical Specialities` → `의료기기` 가 맞나),
너무 좁거나 넓지 않나, 더 쉬운 말이 있나.

### 금융

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Major Banks` | 은행 | ★ |
| `Banks` | 은행 | ★ |
| `Savings Institutions` | 저축은행 | ★ |
| `Finance: Consumer Services` | 소비자금융 | ★ |
| `Investment Bankers/Brokers/Service` | 증권 | ★ |
| `Investment Managers` | 자산운용 | ★ |
| `Property-Casualty Insurers` | 손해보험 | ★ |
| `Life Insurance` | 생명보험 | ★ |
| `Accident &Health Insurance` | 건강보험 | ★ |
| `Specialty Insurers` | 특종보험 | ★ |
| `Diversified Financial Services` | 종합금융 | ★ |
| `Finance Companies` | 여신금융 | ★ |
| `Real Estate Investment Trusts` | 리츠 | ★ |

### 헬스케어

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Biotechnology: Biological Products (No Diagnostic Substances)` | 바이오의약품 | ★ |
| `Biotechnology: In Vitro & In Vivo Diagnostic Substances` | 진단시약 | ★ |
| `Biotechnology: Commercial Physical & Biological Resarch` | 바이오연구 | ★ |
| `Biotechnology: Laboratory Analytical Instruments` | 실험장비 | ★ |
| `Biotechnology: Pharmaceutical Preparations` | 제약 | ★ |
| `Biotechnology: Electromedical & Electrotherapeutic Apparatus` | 의료전자 |  |
| `Major Pharmaceuticals` | 제약 | ★ |
| `Other Pharmaceuticals` | 제약 |  |
| `Medicinal Chemicals & Botanical Products` | 의약원료 | ★ |
| `Medical/Nursing Services` | 의료서비스 |  |
| `Medical Specialities` | 의료기기 |  |
| `Medical/Dental Instruments` | 의료기기 |  |
| `Hospital/Nursing Management` | 병원운영 |  |
| `Ophthalmic Goods` | 안경·렌즈 |  |

### 반도체·전자

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Semiconductors` | 반도체 | ★ |
| `Electronic Components` | 전자부품 | ★ |
| `Electrical Products` | 전기제품 |  |
| `Consumer Electronics/Appliances` | 가전 |  |
| `Computer Manufacturing` | 컴퓨터 |  |
| `Computer peripheral equipment` | 컴퓨터주변기기 |  |
| `Telecommunications Equipment` | 통신장비 | ★ |
| `Radio And Television Broadcasting And Communications Equipment` | 방송장비 |  |

### 소프트웨어·인터넷

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Computer Software: Prepackaged Software` | 소프트웨어 |  |
| `Computer Software: Programming, Data Processing` | IT서비스 |  |
| `EDP Services` | IT서비스 |  |
| `Internet and Information Services` | 인터넷 |  |
| `Advertising` | 광고 |  |

### 소재·에너지

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Steel/Iron Ore` | 철강 | ★ |
| `Metal Mining` | 금속광업 | ★ |
| `Precious Metals` | 귀금속 | ★ |
| `Aluminum` | 알루미늄 | ★ |
| `Major Chemicals` | 화학 | ★ |
| `Specialty Chemicals` | 특수화학 |  |
| `Paints/Coatings` | 도료 | ★ |
| `Agricultural Chemicals` | 농화학 | ★ |
| `Containers/Packaging` | 포장재 | ★ |
| `Forest Products` | 임산물 | ★ |
| `Integrated oil Companies` | 종합석유 | ★ |
| `Oil Refining/Marketing` | 정유 | ★ |
| `Oil & Gas Production` | 석유·가스 | ★ |
| `Coal Mining` | 석탄광업 | ★ |
| `Oilfield Services/Equipment` | 유전서비스 | ★ |
| `Oil/Gas Transmission` | 가스수송 | ★ |

### 산업재·운송

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Construction/Ag Equipment/Trucks` | 건설·농기계 | ★ |
| `Industrial Machinery/Components` | 산업기계 | ★ |
| `Metal Fabrications` | 금속가공 |  |
| `Auto Manufacturing` | 자동차 | ★ |
| `Auto Parts:O.E.M.` | 자동차부품 |  |
| `Homebuilding` | 주택건설 | ★ |
| `Building Products` | 건축부품 |  |
| `Engineering & Construction` | 건설 |  |
| `Aerospace` | 항공우주 |  |
| `Military Government/Technical` | 방산 |  |
| `Marine Transportation` | 해운 | ★ |
| `Air Freight/Delivery Services` | 물류 |  |
| `Trucking Freight/Courier Services` | 육상운송 |  |
| `Railroads` | 철도 |  |
| `Major Airlines` | 항공 |  |

### 유틸리티

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Electric Utilities: Central` | 전력 | ★ |
| `Power Generation` | 발전 | ★ |
| `Natural Gas Distribution` | 가스공급 | ★ |
| `Water Supply` | 수도 | ★ |

### 소비

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Packaged Foods` | 식품 |  |
| `Food Chains` | 식품유통 |  |
| `Beverages (Production/Distribution)` | 음료 |  |
| `Farming/Seeds/Milling` | 농업 |  |
| `Tobacco` | 담배 |  |
| `Restaurants` | 외식 |  |
| `Hotels/Resorts` | 호텔·리조트 |  |
| `Clothing/Shoe/Accessory Stores` | 의류유통 |  |
| `Apparel` | 의류 |  |
| `Shoe Manufacturing` | 신발 |  |
| `Textiles` | 섬유 |  |
| `Department/Specialty Retail Stores` | 유통 |  |
| `Other Specialty Stores` | 전문소매 |  |
| `Home Furnishings` | 가구 |  |
| `Recreational Products/Toys` | 레저용품 |  |
| `Consumer Specialties` | 생활용품 |  |
| `Other Consumer Services` | 소비자서비스 |  |
| `Services-Misc. Amusement & Recreation` | 레저 |  |
| `Movies/Entertainment` | 영화·엔터 |  |
| `Broadcasting` | 방송 |  |
| `Publishing` | 출판 |  |
| `Wireless Telecommunications` | 무선통신 |  |

### 기타

| 나스닥 원문 | 표시 | 실측 |
|---|---|---|
| `Business Services` | 기업서비스 |  |
| `Professional Services` | 전문서비스 |  |
| `Real Estate` | 부동산 |  |
| `Miscellaneous manufacturing industries` | 기타제조 |  |

## 보고할 것 2 — 점수 계산에 들어가는 항목

| 덩어리 | 항목 | 점수화 | 화면에 보이나 |
|---|---|---|---|
| 돈은 잘 버나요 | ① 매출 YoY > 0 ② 영업이익 YoY > 0 ③ 영업이익률(TTM) > 0 | 맞은 개수 ÷ 항목 수 × 5, 최소 1점 | **셋 다 보인다**(③ 은 FIX-01 에서 추가) |
| 값은 어떤가요 | 업종이 있으면 `PER ÷ 업종 PER × 50` · `PBR ÷ 업종 PBR × 50`, 없으면 5년 밴드 백분위 | 평균 백분위 → `(100 − 평균) ÷ 100 × 5`, 1~5 | PER·PBR 줄로 보인다. 적자면 PER 을 안 쓴다 |
| 빚은 괜찮나요 | 부채비율 ÷ 업종 부채비율 | ≤0.5→5 · ≤0.8→4 · ≤1.2→3 · ≤2→2 · 그 외 1 | 부채비율 줄로 보인다 |

**합친 점수는 없다**(WO-RESET-05 하지 말 것). 셋을 하나로 만들면 「이 종목 7점」이 되고
그건 추천이다.

## 보고할 것 3 — 모순 문장이 나오는 다른 곳

`packages/fomo-core/src/keyword-cards` + `apps/fomo-web/components` 의 **한글 문자열 전수**를
반대 쌍으로 스캔했다. 남은 것은 넷이고 **전부 모순이 아니다.**

| 문장 | 왜 괜찮은가 |
|---|---|
| `매출은 늘었는데 영업이익은 줄었어요` (`company-read`) | 주어가 둘이다 — 서로 다른 지표를 말한다 |
| `매출 늘고 영업이익 적자가 줄었어요` (`disclosure-figures`) | 같음. 적자 축소는 이익 증가 방향이다 |
| `늘었는지 줄었는지는 신고서 안에 있어요` (`disclosure-phrase`) | **모른다고 밝히는 문장**이다(DETAIL-04 뜻풀이 규칙 ③) |
| `늘었는지 줄었는지는 공시 안 숫자로 갈려요` (`disclosure-phrase`) | 같음 |

테스트가 이 넷을 **주어 둘** 또는 **`~는지`(모름 명시)** 로만 통과시킨다 — 새 뭉갠 문장은
막힌다.

## 완료 확인

| # | 조건 | 검사 |
|---|---|---|
| 1 | 한 줄에 반대 방향 표현이 같이 안 나온다 | `company-read.test.ts`(360조합) · `fix01SentenceRepair.test.ts`(전수 스캔) · e2e |
| 2 | 숫자 설명과 점 설명이 중복되지 않는다 | `company-read.test.ts` · `pickDepthTemplate.test.ts` · e2e(점 옆이 비어 있다) |
| 3 | 주어 없는 문장이 없다 | `company-read.test.ts` · e2e(4걸음 요약 줄마다 주어) |
| 4 | 계산 방법이 한 화면에 한 번, 접힌 상태 | `pickDepthTemplate.test.ts` · e2e |
| 5 | 영어 업종명이 한글로 나온다 | `company-read.test.ts` · `fix01SentenceRepair.test.ts` |
| 6 | `중간값` → `평균` | `company-read.test.ts` · e2e |
| 7 | `닿는 곳` → `영향받는 종목` | `macro-link.test.ts` · `fix01SentenceRepair.test.ts` |
| 8 | 숫자와 점수 설명이 어긋나지 않는다 | `company-read.test.ts`(영업이익률 줄) · e2e |
| 9 | 실제 앱에서 확인 | 로컬 프리뷰 DOM 확인 완료 · 정규 도메인은 배포 후 |

## 하지 말 것

1. **점 옆에 줄 설명을 되풀이하지 않는다.** 겹치면 `scoreText: null`.
2. **주어 없이 형용사만 쓰지 않는다.** 요약은 `summaryText` 만 쓴다.
3. **계산 방법을 본문 중간에 펼쳐 두지 않는다.**
4. **영어 업종명을 화면에 두지 않는다.** 표에 없으면 이름을 빼고 `같은 업종`.
5. **점수 재료를 화면에서 숨기지 않는다.** 숨길 거면 점수에서도 빼야 한다.
