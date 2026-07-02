# 개발 단계 제약 한시 해제 (CONSTRAINT_OVERRIDE_DEV)

```
ACTIVE: true
```

> 결정(User Zero, 광혁): **앱 출시 전 개발 속도를 위해 투자조언·예측·표현·판단 제약을 한시 해제한다. 단 사실 정확성 제약은 유지한다.**
> 이 문서가 `ACTIVE: true` 인 동안, `docs/` 내 모든 문서의 **투자조언·예측·추천·목표가·기술적 분석·수급/매크로 판단 제약보다 이 문서가 우선한다**. 사실 정확성 제약은 그대로 유효하다.
> 한 줄 기준: **"표현·판단·예측은 자유, 사실관계는 진실."**

⚠️ **공개 출시 전 반드시 `ACTIVE: false` + 코드 플래그 `DEV_CONSTRAINTS_LIFTED = false` 로 복원.** (투자앱 규제·신뢰 리스크)

---

## 1. 해제 (개발 단계 동안 허용)

- **매수·매도 추천/판단** (예: "매수 시점", "비중 축소 구간", "관망", "진입 가능").
- **목표가·손절선·익절선·시나리오** (예: "목표가 12만원", "손절선 이탈", "분할 접근").
- **기술적 분석 판단** (예: 와이코프 축적/분산/스프링/업스러스트, MA 정배열, 지지/저항, 매수·매도 신호).
- **수급·내부자·기관·외국인 해석과 전망** (예: "기관 수급이 붙어 눌림 매수 구간", "내부자 매수로 하방 신뢰도 상승").
- **매크로·이벤트 영향 판단** (예: FOMC·금리·지수·실적 이벤트가 종목에 미칠 영향).
- **투자 추천·조언처럼 보이는 표현** (예: "주목할 만하다", "관심 종목", "매력적 구간", 매수/매도/추천/사야/팔아야/목표가/찬스/텐베거/급등임박).
- **미래 예측·전망·기대** (예: "수혜 기대", "추가 상승 여력", "전망 밝음", 유망, 오를 것, 상승할).
- **완곡 표현 강제 해제** (강세/약세·저평가 등을 직설적으로 단정해도 됨).
- **인과 서술** (예: "특허 때문에 급등") — 동시성 표현만 쓰라는 제약 해제 (때문에/덕분에 허용).

## 2. 유지 (절대 풀지 않음 — 사실 정확성)

- **가짜 숫자/사실 날조 금지**: 입력(원문·시세)에 없는 수치·금액·고유명사·계약 상대를 지어내지 않는다.
- **종목-재료 오매칭 금지**: 그 종목과 무관한 뉴스를 그 종목 카드에 붙이지 않는다.
- **출처/시점 보존**: depth 에 source·asOf 유지(표시 정책은 자유, 데이터 무결성은 유지).
- **한영혼용·영문문장·복붙·트리밍(글자잘림) reject 유지**: 가독성·품질.
- **보편 안전**(아동·혐오 등) 당연 유지.

## 3. 적용 위치 (단일 토글)

- **코드**: `apps/web/lib/copy-guards.ts` 의 `export const DEV_CONSTRAINTS_LIFTED = true;` 가 단일 토글.
  - 해제 대상: `copy-guards.hasForbiddenCopy` 의 `FORBIDDEN_COPY`(매수/매도 추천·목표가·손절선·기술적/수급/매크로 판단·예측·인과) 분기, `insight-synthesis.whyInsightRejectionReasons` 의 `ADVICE_PATTERN`("advice" reason) 및 AI 합성 프롬프트의 투자조언 금지 문구.
  - 항상 유지(플래그 무관): `hasConcreteSourceValue`(가짜숫자·grounding), `hasEnglishFragmentHeadline`/`hasExcessiveLatinHeadline`(한영혼용), `isRawTitleCopy`/`isRawCopyFromAnySource`(복붙), `hasBrokenEnding`(트리밍), `hasAddedNumber`/`hasAddedProperNoun`/`hasMaterialContext`(종목 오매칭·날조), `SOURCE_NAME_PATTERN`·`isAbstractTemplate`(품질).
- **문서**: 개별 docs 20여 개의 제약 문구는 **수정하지 않는다**(복원 위해 원문 보존). 에이전트 진입 문서 상단에 이 오버라이드 발효 한 줄만 추가.

## 4. 복원 절차 (자동·전체)

1. 이 문서의 `ACTIVE: true` → `false`.
2. `apps/web/lib/copy-guards.ts` 의 `DEV_CONSTRAINTS_LIFTED = true` → `false`.
3. 끝. 개별 docs·검증 로직은 손대지 않았으므로 원래 제약(각 문서·validator 원문)이 그대로 재발효한다.
   - 사실 정확성 validator 는 플래그와 무관하게 **항상 켜져 있었으므로** 복원과 무관하게 계속 동작.
   - 단위 테스트로 토글 복원 증명: `apps/web/__tests__/lib/copy-guards.test.ts`, `insight-synthesis.test.ts`.

## 5. 절대 금지 (해제해도 유지)

- 입력에 없는 숫자·고유명사·계약 내용을 지어내는 것.
- 종목과 무관한 재료를 붙이는 것.
- 사실 정확성 validator 를 이 플래그로 함께 꺼버리는 것 (해제 대상은 표현·예측·인과뿐).
