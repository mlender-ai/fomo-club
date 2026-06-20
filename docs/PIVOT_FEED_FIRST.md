# FOMO Club 방향 전환: 액션 제로 / 감정 탭

> **[보관 문서 — 폐기된 감정 탭 피벗]** 키워드·종목 취향 피드 이전 단계의 기록이다. 신규 제품 판단에는 `PRODUCT_VISION.md`와 루트 `CLAUDE.md`를 사용한다.

## 핵심 철학
- 입장 자체가 포모를 느끼는 행위. 감정 선택을 시키지 않는다.
- 사용자에게 액션을 요구하지 않는다. 슥 보다가 나가도 위로가 완성된다.
- 릴스/숏츠형 수동 소비. 내일 또 궁금해서 연다.
- 시장 데이터(뉴스·커뮤니티)를 정보가 아니라 감정으로 치환한다.
- 감정은 고르는 게 아니라, 감정 탭에 들어가는 행위가 선택이다.

## 구조
- 하단 탭 2개: 오늘 / 피드
- 오늘 탭: 포모 + FOMO Index + 롤링 시그널 (액션 없음)
- 피드 탭: 감정 카테고리(포모/공포/환희/후회/탐욕)별 치환된 뉴스 카드

## 숨긴 기능 (삭제 아님, feature flag)
- 감정 투표, 감정 기록, 감정 캘린더, 기록 탭
- 코드·DB 보존. 나중에 니즈 생기면 복원.
- 플래그 위치: `packages/fomo-core/src/features.ts`
  - `FEATURE_EMOTION_VOTE = false` — 감정 선택/투표 (EmotionGate)
  - `FEATURE_EMOTION_JOURNAL = false` — 감정 기록(조각 고르기/한마디, VoiceFeed)
  - `FEATURE_EMOTION_CALENDAR = false` — 감정 캘린더 (EmotionCalendar)
  - `FEATURE_HISTORY_TAB = false` — 하단 기록 탭
  - `FEATURE_FEED_EMOTION_TABS = true` — 신규 감정 카테고리 피드

## 데스 리퀴드 원칙
시장 데이터에 감정의 영혼을 불어넣는다. 부조화가 무기.
