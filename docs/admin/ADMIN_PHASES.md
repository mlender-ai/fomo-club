# Trading Taro — Admin 개발 페이즈 문서

> **최우선 원칙**: 어드민 보안은 타협 없음. 기술 부채 0. 개발이 늦어져도 보안이 먼저다.
> 이 문서는 에이전트 간 공유 설계 문서다. 변경 시 반드시 업데이트하고 커밋한다.

---

## 인프라 전제 조건

| 항목 | 스택 |
|------|------|
| 호스팅 | Vercel (Edge Network) |
| DB | Supabase PostgreSQL |
| ORM | Prisma (DATABASE_URL = Supabase connection pooler) |
| 인증 방식 | JWT (jose) — HttpOnly cookie, Supabase Row Level Security 병행 |
| 시크릿 관리 | Vercel Environment Variables (Preview / Production 분리) |

---

## 현재 보안 취약점 목록 (Phase 1 해결 대상)

| # | 취약점 | 위험도 | 설명 |
|---|--------|--------|------|
| 1 | 평문 비밀번호 쿠키 | 🔴 Critical | `dashboard_session` 쿠키 값 = 비밀번호 그 자체. 탈취 즉시 계정 탈취 |
| 2 | API 라우트 인증 없음 | 🔴 Critical | `/api/admin/*` 모든 엔드포인트에 인증 검사 없음. 직접 호출 가능 |
| 3 | Rate limiting 없음 | 🔴 Critical | 브루트포스 로그인 공격 무방비 |
| 4 | CSRF 보호 없음 | 🟠 High | Server Action 폼이 CSRF 토큰 없음 |
| 5 | 감사 로그 없음 | 🟠 High | 누가 언제 무엇을 변경했는지 추적 불가 |
| 6 | `LOCAL_DEMO_MODE=true` 우회 | 🟡 Medium | 환경변수 하나로 인증 전체 우회 가능 |
| 7 | 세션 만료 없음 | 🟡 Medium | 한 번 로그인하면 영구 유지 |
| 8 | 브라우저 캐시 노출 | 🟡 Medium | 관리 페이지 캐시 헤더 없음 |

---

## Phase 1 — 보안 기반 (완료 목표: 출시 전 필수)

**목표**: 현존하는 모든 Critical/High 취약점 제거. 코드 한 줄 없이는 어드민 접근 불가.

### 1-1. JWT 기반 세션 교체

**현재**: 쿠키 값 = 비밀번호 평문  
**변경**: HMAC-SHA256 서명된 JWT → HttpOnly + Secure + SameSite=Strict 쿠키

```
로그인 플로우:
  POST /api/admin/auth/login
    ← { password }
    → 검증 후 JWT 생성 (jose, HS256, exp: 8h)
    → Set-Cookie: admin_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/admin

미들웨어:
  /admin/** 요청마다 JWT 검증
  서명 실패 / 만료 → 401 → /admin/login 리다이렉트
  성공 → X-Admin-Verified: true 헤더 추가
```

**필요 패키지**: `jose` (Node.js 네이티브 Web Crypto API 기반, 외부 의존성 최소)

**환경변수 추가**:
```
ADMIN_JWT_SECRET=<256bit random hex>   # openssl rand -hex 32
ADMIN_PASSWORD_HASH=<bcrypt hash>      # 평문 비밀번호 절대 저장 안 함
```

---

### 1-2. API 라우트 인증 미들웨어

**현재**: `/api/admin/*` 인증 없음  
**변경**: 모든 admin API 라우트에 `requireAdminApi()` 헬퍼 적용

```typescript
// lib/admin-auth-api.ts
export async function requireAdminApi(request: Request): Promise<NextResponse | null>
// 반환값: null = 통과, NextResponse = 401 응답
```

적용 대상:
- `POST /api/admin/auth/login` (로그인 — 인증 불필요, rate limit만)
- `GET/PATCH /api/admin/cards/[id]` → requireAdminApi
- `GET/POST /api/admin/prompts` → requireAdminApi
- `POST /api/admin/prompts/[id]/activate` → requireAdminApi
- `PATCH /api/admin/reports/[id]` → requireAdminApi

---

### 1-3. Rate Limiting (브루트포스 방어)

**구현**: Vercel KV 없이 Prisma DB 기반 in-process 카운터 (초기), 이후 Vercel KV 업그레이드 가능

```
로그인 실패 5회 / IP / 15분 → 429 + 잠금
성공 시 카운터 초기화
Vercel Edge: request IP = x-forwarded-for 헤더
```

**Prisma 모델 추가**:
```prisma
model AdminLoginAttempt {
  id        String   @id @default(cuid())
  ip        String
  success   Boolean
  createdAt DateTime @default(now())

  @@index([ip, createdAt])
}
```

---

### 1-4. 감사 로그 (Audit Log)

모든 어드민 액션을 DB에 기록. 누가 언제 무엇을 바꿨는지 추적.

**Prisma 모델 추가**:
```prisma
model AdminAuditLog {
  id         String   @id @default(cuid())
  action     String   // "card.update", "prompt.activate", "report.resolve" 등
  targetId   String?  // 변경 대상 리소스 ID
  targetType String?  // "TarotCard", "TarotPromptVersion" 등
  before     Json?    // 변경 전 값
  after      Json?    // 변경 후 값
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([action, createdAt])
  @@index([createdAt])
}
```

---

### 1-5. 세션 만료 + 강제 로그아웃

- JWT exp: **8시간** (로컬 개발 24시간)
- 비밀번호 변경 시 모든 기존 세션 무효화: JWT에 `jti` (JWT ID) 포함, DB의 `invalidatedBefore` 타임스탬프와 비교

```prisma
model AdminSessionConfig {
  id                String   @id @default("singleton")
  invalidatedBefore DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

---

### 1-6. 보안 HTTP 헤더

`next.config.js`에 추가:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'
Cache-Control: no-store (admin 페이지 전체)
```

---

### 1-7. 기타 정리

- `LOCAL_DEMO_MODE` 환경변수 **제거** (production 우회 경로 차단)
- layout.tsx "Managed by Gemini" 배지 제거
- 로그인 페이지 브랜딩 통일 ("Trading Taro Admin")
- LLM 비용 단가: Claude Sonnet 4.x 실제 단가 반영 (input $3/1M, output $15/1M)

---

### Phase 1 파일 변경 목록

```
신규 생성:
  apps/web/lib/admin-jwt.ts              # JWT 발급/검증
  apps/web/lib/admin-auth-api.ts         # API 라우트용 인증 헬퍼
  apps/web/lib/admin-rate-limit.ts       # 로그인 rate limit
  apps/web/lib/admin-audit.ts            # 감사 로그 기록 헬퍼
  apps/web/app/admin/login/page.tsx      # 어드민 전용 로그인 페이지
  apps/web/app/api/admin/auth/login/route.ts    # 로그인 API
  apps/web/app/api/admin/auth/logout/route.ts   # 로그아웃 API

수정:
  apps/web/middleware.ts                 # JWT 검증으로 교체
  apps/web/lib/admin-auth.ts             # JWT 기반으로 교체
  apps/web/app/admin/layout.tsx          # 배지 제거, 로그아웃 버튼 추가
  apps/web/app/login/page.tsx            # /admin/login으로 리다이렉트
  apps/web/app/api/admin/cards/[id]/route.ts    # requireAdminApi 추가
  apps/web/app/api/admin/prompts/route.ts       # requireAdminApi 추가
  apps/web/app/api/admin/prompts/[id]/activate/route.ts  # requireAdminApi 추가
  apps/web/app/api/admin/reports/[id]/route.ts  # requireAdminApi 추가
  apps/web/next.config.js                # 보안 헤더 추가
  prisma/schema.prisma                   # AdminLoginAttempt, AdminAuditLog, AdminSessionConfig 추가

삭제:
  LOCAL_DEMO_MODE 환경변수 참조 제거
```

### Phase 1 환경변수 (Vercel에 설정)

```bash
# 필수 (기존 제거)
# DASHBOARD_PASSWORD → 삭제

# 신규 추가
ADMIN_JWT_SECRET=          # openssl rand -hex 32
ADMIN_PASSWORD_HASH=       # bcryptjs.hashSync(password, 12)
DATABASE_URL=              # Supabase connection string (pooler)
```

### Phase 1 완료 체크리스트

- [ ] JWT 로그인/로그아웃 동작
- [ ] 만료된 JWT → 자동 로그아웃 리다이렉트
- [ ] `/api/admin/*` 직접 호출 시 401 반환
- [ ] 로그인 5회 실패 → 15분 잠금
- [ ] 모든 어드민 액션 AuditLog DB 기록
- [ ] `X-Frame-Options: DENY` 헤더 확인
- [ ] admin 페이지 `Cache-Control: no-store` 확인
- [ ] Vercel Preview / Production 환경변수 분리
- [ ] Playwright E2E 테스트 통과

---

## Phase 2 — 관리 기능 완성 (출시 후 1주)

**목표**: 운영에 실제로 필요한 관리 도구 완성

### 예정 기능

| 페이지 | 기능 |
|--------|------|
| `/admin/users` | 유저 목록, 크레딧 잔액, 멤버십 상태, 강제 크레딧 지급/차감 |
| `/admin/monitoring` 개선 | 낮은 평점(1-2점) 뽑기의 실제 해석 내용 확인 |
| `/admin/analytics` 개선 | `share_reward`, `login_kakao`, `login_google` 이벤트 추가 |
| 프롬프트 실제 연동 | 어드민 활성화 → 실제 코드 버전 반영 메커니즘 |

### Phase 2 파일 변경 목록 (예정)

```
신규:
  apps/web/app/admin/users/page.tsx
  apps/web/app/api/admin/users/route.ts
  apps/web/app/api/admin/users/[id]/credits/route.ts
```

---

## Phase 3 — 인사이트 강화 (출시 후 2주)

**목표**: 데이터로 제품 개선 결정

### 예정 기능

| 항목 | 설명 |
|------|------|
| 전환율 퍼널 | 앱실행 → 뽑기시작 → 뽑기완료 → 공유 시각화 |
| 종목 랭킹 | 가장 많이 뽑힌 ticker Top 10 |
| 카드 출현 빈도 | 카드별 출현율, 역방향 비율 |
| 수익 대시보드 | IAP 매출, 광고 수익, 크레딧 소비 종합 |

---

## Vercel + Supabase 설정 가이드

### Supabase
1. Project Settings → Database → Connection string (Transaction pooler) → `DATABASE_URL`
2. Row Level Security: `AdminAuditLog`, `AdminLoginAttempt` 테이블은 service_role만 접근
3. Supabase Auth는 **사용하지 않음** — 어드민 인증은 자체 JWT로 관리

### Vercel
1. Environment Variables:
   - `Production`: `ADMIN_JWT_SECRET`, `ADMIN_PASSWORD_HASH`, `DATABASE_URL`
   - `Preview`: 별도 `ADMIN_JWT_SECRET`, 별도 `DATABASE_URL` (Supabase staging branch)
   - `Development`: `.env.local` (절대 커밋 금지)
2. `vercel.json` 설정:
   ```json
   {
     "headers": [
       {
         "source": "/admin/(.*)",
         "headers": [{"key": "X-Robots-Tag", "value": "noindex, nofollow"}]
       }
     ]
   }
   ```

---

## 에이전트 작업 규칙

1. **보안 관련 파일 수정 시** 반드시 이 문서의 체크리스트 확인
2. **새 API 라우트 추가 시** `requireAdminApi()` 적용 필수 — 없으면 PR 거부
3. **환경변수 추가 시** 이 문서 "환경변수" 섹션 업데이트
4. **Phase 완료 시** 체크리스트 체크 후 커밋에 `[admin-phase-N]` 태그
5. **절대 금지**: `LOCAL_DEMO_MODE` 재도입, 평문 비밀번호 저장, 하드코딩된 시크릿

---

_마지막 업데이트: 2026-05-20 | 담당: Claude (Phase 1 설계 + 구현)_
