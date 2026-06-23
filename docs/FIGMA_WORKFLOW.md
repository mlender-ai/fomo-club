# FOMO Club — Figma 워크플로우 (MCP 연결 + 토큰 왕복)

사용자가 **피그마로 직접 디자인**한 결과가 우리 DESIGN.md·토큰·코드로 흘러들도록 하는 연결 가이드.
토큰 단일 소스는 `design/tokens.json`(DTCG), 시각 정본은 `docs/DESIGN.md`.

---

## 1. Figma MCP 연결 (사용자 1회, 본인 인증)

> 에이전트가 Figma 프레임/변수/컴포넌트를 읽고(또는 캔버스에 쓰고) 코드와 대조하게 한다.
> Figma **Dev 또는 Full seat** 필요. 인증은 본인 Figma 계정 OAuth.

### 권장: 원격 서버 (Claude Code)
```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
```
또는 Anthropic 플러그인 마켓의 **Figma 플러그인** 설치(= MCP 설정 + Figma 작업용 Agent Skills 포함).

### 대안: 데스크톱 서버 (Figma 데스크톱 앱)
Figma 데스크톱 → Preferences에서 Dev Mode MCP 활성화 후:
```bash
claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp
```

### 프로젝트 공유용 `.mcp.json` (선택 — 레포 루트에 직접 추가)
> 보안상 에이전트가 자동 생성하지 않음. 팀에 공유하려면 사용자가 레포 루트에 아래를 만든다(인증은 각자):
```json
{
  "mcpServers": {
    "figma": { "type": "http", "url": "https://mcp.figma.com/mcp" }
  }
}
```
연결 확인: Claude Code에서 `/mcp` 또는 MCP 도구 목록에 figma 등장.

---

## 2. 토큰 왕복 (Figma Variables ⇄ design/tokens.json)

```
Figma Variables  ──(export)──►  design/tokens.json (DTCG)  ──►  DESIGN.md frontmatter + 코드
       ▲                                                              │
       └──────────────(에이전트가 Figma MCP로 역반영)──────────────────┘
```

- **Figma → 토큰**: Figma Variables를 ① **Tokens Studio**(Figma 플러그인, Git-sync로 이 레포에 DTCG JSON push) 또는 ② **Figma Variables API** export 로 빼서 `design/tokens.json` 갱신.
- **토큰 정합**: 갱신 후 `npm run test`(드리프트 가드 `packages/fomo-core/__tests__/tokens-drift.test.ts`)로 `@fomo/core`와 감정색 일치 확인.
- **에이전트 활용**: Figma 파일이 있으면 "이 Figma 프레임을 design/tokens.json·docs/DESIGN.md와 대조해서 fomo-web 홈을 만들어줘" — 에이전트가 Figma MCP로 읽어 토큰 매핑.

---

## 3. 자동화 (deferred — 실제 Figma 파일 생긴 뒤)

지금은 MLP 페이스상 수동. Figma 디자인 확정 시:
```bash
npm i -D style-dictionary
# tokens.json → apps/fomo-web Tailwind preset(CSS vars) + apps/fomo-club fomoTheme + (선택) DESIGN.md frontmatter 재생성
npm run tokens:build
```
Tokens Studio Git-sync를 붙이면 Figma↔tokens.json 왕복이 자동화된다.

---

## 4. 디자인 원칙 가드 (Figma 작업 시에도 유지)
- 다크-네이티브(라이트 모드 없음). 감정색은 포인트 glow로만. 픽셀은 숫자·라벨.
- 마스코트가 주인공(표정=지수), 숫자는 보조. 담담한 톤.
- 변경은 머지 전 `lovable-reviewer`(Gate 6) + `mascot-keeper` 점검 대상.
