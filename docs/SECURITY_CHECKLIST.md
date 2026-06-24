# 보안 체크리스트 (FOMO Club — 전 LLM 공통)

> push·머지 전 훑는 포터블 체크리스트. Claude/GPT/Codex 누구나 참조.
> 원형: addyosmani/agent-skills `references/security-checklist.md` → FOMO 맥락 적응.
> 정체성 가드레일은 `AGENTS.md`, grounding 정책은 `docs/DATA_ENGINE_STRATEGY.md` 참조.

## 시크릿 / 커밋 전
- [ ] 코드에 시크릿 없음: `git diff --cached | grep -iE "password|secret|api_key|token"`
- [ ] `.gitignore`가 `.env`, `.env.local`, `*.pem`, `*.key` 커버
- [ ] `.env.example`은 플레이스홀더만(실값 금지) — 새 env 추가 시 동기화
- [ ] `.claude/hooks/protect-secrets.sh` 우회 안 함
- [ ] 필수 prod 시크릿 미설정 시 **fail-closed** (`DATABASE_URL`, `GROQ_API_KEY` 없으면 해당 라우트 차단 — 조용히 가짜 응답 금지)

## 입력 검증 (시스템 경계)
- [ ] 모든 사용자 입력을 API 라우트·폼 핸들러 경계에서 검증
- [ ] 검증은 allowlist 기반(denylist 금지), 문자열 길이 min/max 제약
- [ ] Prisma 사용 — raw SQL 시 파라미터 바인딩(문자열 연결 금지)
- [ ] 출력 HTML은 프레임워크 자동 이스케이프에 의존
- [ ] 서버측 외부 fetch(스크래퍼·뉴스 수집)는 allowlist, 사설/예약 IP 차단(SSRF 방지)
- [ ] 리다이렉트 전 URL 검증(open redirect 방지)

## 인증 / 인가 (무가입 웹 — 익명 세션 기반)
- [ ] 익명 세션 토큰: `httpOnly`, `secure`, `sameSite: 'lax'`, 합리적 만료
- [ ] 가입 필요 기능(푸시·기록 저장)만 인증 요구 — 그 외 익명 허용
- [ ] 보호 엔드포인트마다 인증 확인, 리소스 접근 시 소유권/역할 확인(IDOR 방지)
- [ ] 운영/리서치 API(`app/api/research/*`)는 권한 검증 — 공개 노출 금지

## 데이터 보호 / 정직성 (FOMO 고유)
- [ ] 민감 필드는 API 응답에서 제외(세션 시크릿·내부 점수 산식 등)
- [ ] 민감 데이터 로그 금지(토큰·시크릿)
- [ ] 외부 통신 전부 HTTPS
- [ ] **grounding 위반 0**: 강세/약세·워딩·수급은 원문 출처 있음. 지어내기·가짜 응축 금지(integrity-checker 원칙)
- [ ] **출처 tier 정직 표기**: 공식/뉴스/커뮤니티 라벨 구분, 섞지 않음
- [ ] confidence 정직 노출(데이터 부족 시 숨기지 말고 표기)
- [ ] 정체성 회귀 없음: 매매신호·예측·목표가·점수 진열 신설 금지(AGENTS.md 블랙리스트)

## 의존성
- [ ] `npm audit` 통과(신규 취약점 0), lockfile 커밋, CI는 `npm ci`
- [ ] 신규 의존성 검토(유지보수·다운로드·`postinstall` 스크립트) — 게으름 사다리 5칸 우선 적용
- [ ] Expo Go 제약 모듈 직접 import 금지(`CLAUDE.md` tarot-mobile 규칙)

## 에러 처리
- [ ] 프로덕션 에러는 일반 메시지(내부 스택·경로 노출 금지)
- [ ] 빈 `catch {}` 금지 — 최소 `console.warn` 또는 에러 상태 set(`CLAUDE.md` 코드 원칙 6)
