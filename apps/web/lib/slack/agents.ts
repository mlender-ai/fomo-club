/**
 * Slack Agent Team — Stage A: 직군별 독립 정체성.
 *
 * docs/AGENT_TEAM_VISION.md §1·§3(A) 구현. 3축(CTO/PM/Security)으로 시작하고,
 * 각 축은 흡수한 기존 lane들의 관점을 "겸한다". 특정 축 미지정 질문은 default(Hermes).
 *
 * resolveAgent 는 순수 함수 — 추가 LLM 콜 없이 결정론적 라우팅(intent.ts 와 동일 철학).
 * apps/web/__tests__/slack-agents.test.ts 에서 vitest 로 검증.
 *
 * NOTE: personaPrompt 는 런타임 systemPrompt 주입용 "요약본"이다.
 *   전체 페르소나는 .github/agents/{CTO,PM,SECURITY}_PERSONA.md (사람·워크플로용).
 *   페르소나 방향을 바꾸면 양쪽을 함께 갱신할 것.
 */

export type AxisId = "cto" | "pm" | "security" | "default";

export interface Axis {
  id: AxisId;
  /** Slack 발화자 이름 (postMessage username) */
  username: string;
  /** Slack 발화자 아이콘 (postMessage icon_emoji, ":emoji:" 형식) */
  icon_emoji: string;
  /** 흡수하는 기존 9 lane (문서 §1 매핑) */
  absorbedLanes: string[];
  /** 멘션 없을 때 이 축으로 라우팅하는 키워드 */
  keywords: RegExp;
  /** 런타임 systemPrompt 앞에 붙는 페르소나 요약 */
  personaPrompt: string;
}

const CTO: Axis = {
  id: "cto",
  username: "CTO Agent",
  icon_emoji: ":hammer_and_wrench:",
  absorbedLanes: ["frontend", "backend", "qa", "prompt_engineer"],
  keywords:
    /구현|코드|빌드|성능|버그|아키텍처|리팩터|리팩토링|api\b|프론트|백엔드|배포|테스트|타입|마이그레이션/i,
  personaPrompt: `당신은 Trading Taro의 **CTO 에이전트**입니다.
"무엇을 어떻게 만들 것인가" — 구현·기술 결정을 책임집니다. frontend·backend·qa·prompt_engineer 관점을 모두 겸합니다.
판단 기준: 일단 돌아가게 → 출시 → 데이터. 과잉설계 금지. 기술 부채는 인지하되 상환 시점을 전략적으로. 구체적 구현 난이도·소요·리스크를 숫자로 답합니다.`,
};

const PM: Axis = {
  id: "pm",
  username: "PM Agent",
  icon_emoji: ":bar_chart:",
  absorbedLanes: ["pm", "designer", "marketer"],
  keywords:
    /사용자|유저|기능|우선순위|kpi|리텐션|온보딩|디자인|마케팅|바이럴|전환|가치|로드맵|니즈/i,
  personaPrompt: `당신은 Trading Taro의 **PM 에이전트**입니다.
"사용자에게 가치가 있는가" — 제품·우선순위·디자인·시장을 책임집니다. pm·designer·marketer 관점을 모두 겸합니다.
판단 기준: 제품이 전부다. 모든 제안은 분기 OKR 기여를 자문. 기술적 우아함이 아니라 사용자 가치·리텐션·수익화로 판단합니다.`,
};

const SECURITY: Axis = {
  id: "security",
  username: "Security Agent",
  icon_emoji: ":shield:",
  absorbedLanes: ["security", "infra", "regulation"],
  keywords:
    /보안|취약점|security|규제|regulation|인증|결제\s*보안|개인정보|컴플라이언스|인프라|장애|모니터링|관측|observability/i,
  personaPrompt: `당신은 Trading Taro의 **Security 에이전트**입니다.
"안전하게·안정적으로 굴러가는가" — 보안·인프라·규제를 책임집니다. security·인프라/옵저버빌리티·regulation 관점을 모두 겸합니다.
판단 기준: Critical/High 위험 우선. 투자 조언 금칙어·법적 리스크는 무조건 차단. 출시 후 터지면 치명적인 것을 선제 지적합니다.`,
};

const DEFAULT: Axis = {
  id: "default",
  username: "Hermes",
  icon_emoji: ":robot_face:",
  absorbedLanes: [],
  keywords: /$^/, // 매칭 안 됨 — 폴백 전용
  personaPrompt: `당신은 Trading Taro 프로젝트의 **Hermes 에이전트**입니다.
파이프라인 운영·상태·조회를 담당하며 CEO 질문에 한국어로 간결하게 답합니다.`,
};

/** 4축 레지스트리 (cto/pm/security/default). */
export const AXES: Axis[] = [CTO, PM, SECURITY, DEFAULT];

/** "@cto", "@보안" 같은 명시 멘션 매처 (축 id 순). */
const MENTION: Record<Exclude<AxisId, "default">, RegExp> = {
  cto: /@\s*(cto|개발|기술)\b/i,
  pm: /@\s*(pm|피엠|제품)\b/i,
  security: /@\s*(security|sec|보안)\b/i,
};

/**
 * 질문 텍스트에서 발화 축을 결정한다.
 * 1) 명시 멘션(@CTO/@PM/@Security/@보안) 우선
 * 2) 없으면 키워드 휴리스틱 (security → pm → cto 순으로 안전 우선)
 * 3) 아무 단서 없으면 default(Hermes)
 */
export function resolveAgent(text: string): Axis {
  if (MENTION.security.test(text)) return SECURITY;
  if (MENTION.cto.test(text)) return CTO;
  if (MENTION.pm.test(text)) return PM;

  // 키워드: 안전(보안)을 가장 먼저 잡고, 제품, 그다음 구현
  if (SECURITY.keywords.test(text)) return SECURITY;
  if (PM.keywords.test(text)) return PM;
  if (CTO.keywords.test(text)) return CTO;

  return DEFAULT;
}

/** postMessage 정체성 파라미터 추출 (default 는 봇 기본값 유지 위해 username 생략 가능). */
export function axisIdentity(axis: Axis): { username: string; icon_emoji: string } {
  return { username: axis.username, icon_emoji: axis.icon_emoji };
}
