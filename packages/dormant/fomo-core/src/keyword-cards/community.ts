import type { CommunitySourceSignal } from "../index-engine/community";
import type { ExtractedKeyword } from "./extract";

/**
 * 커뮤니티 참여도 → 키워드(테마) 귀속. KEYWORD_ENGINE_SPEC §4.1·§4.3.
 *
 * 순수 함수(네트워크 0). 입력: fetchCommunity 의 집계 시그널(소스별 postCount/upvote/댓글).
 * 기존 페처(reddit/naver)는 글을 *소스 단위로 집계*해 개별 제목을 버린다 → 제목 매칭 불가.
 * 그래서 소스 라벨(서브레딧/종목코드)을 테마로 매핑해 참여도를 귀속한다(재활용, 페처 미변경).
 *
 * ⚠️ §4.3 한계(Phase 2에서 정직하게 노출, 완전 해결은 Phase 4 기준선):
 *   - 커뮤니티 참여도엔 날짜 간 비교 가능한 절대 기준선이 없다(당일 상대값) → '어제 대비' 서사 불가.
 *   - 그래서 이 단계의 귀속은 *뉴스로 이미 확인된 테마만 가산*한다(보수적):
 *     뉴스 근거 없이 커뮤니티만 시끄러운 테마를 카드로 만들지 않아 '커뮤니티 소유 왜곡'(§4.3 #2)을
 *     기준선 없이 과대평가하는 위험을 피한다. 진짜 커뮤니티-단독 급등을 놓치는 트레이드오프는
 *     Phase 4(절대 기준선)에서 해소한다.
 */

/**
 * 커뮤니티 소스 라벨 → 테마 키워드 매핑.
 * - naver/{종목코드}: 페처 DEFAULT_NAVER_CODES 의 대표 종목. (카카오·NAVER 는 5테마에 안 들어가 제외.)
 * - reddit/{서브레딧}: 주제 특정 서브레딧만 매핑(일반 투자 서브레딧은 테마 귀속 불가 → 제외).
 * 매핑 없는 소스는 조용히 버린다(정직: 임의 귀속 금지).
 */
const SOURCE_THEME: Record<string, string> = {
  "naver/005930": "반도체", // 삼성전자
  "naver/000660": "반도체", // SK하이닉스
  "naver/247540": "2차전지", // 에코프로비엠
  "reddit/cryptocurrency": "코인",
};

/**
 * 한 시그널의 커뮤니티 열 기여 = **글 수(postCount)**. 옵션 F(§4.3 cross-source 단위 통일).
 * upvote+댓글은 소스마다 단위가 다르다(reddit 좋아요 ≫ naver 글당 반응 미파싱) → 같이 정규화하면
 * reddit 이 무조건 이긴다. "오늘 이 테마에 글이 몇 개 올라왔나"는 reddit·naver 공통 단위라
 * 날짜·소스 간 비교가 정직하다. 임의 가중치/상한 없음.
 */
function engagementOf(s: CommunitySourceSignal): number {
  return Math.max(0, s.postCount);
}

export interface CommunityThemeWeight {
  engagement: number;
  postCount: number;
}

/** 커뮤니티 시그널 → 테마별 참여도 합. 매핑 안 되는 소스는 제외. */
export function communityEngagementByTheme(
  signals: readonly CommunitySourceSignal[],
): Map<string, CommunityThemeWeight> {
  const out = new Map<string, CommunityThemeWeight>();
  for (const s of signals) {
    const theme = SOURCE_THEME[s.source];
    if (!theme) continue;
    const prev = out.get(theme) ?? { engagement: 0, postCount: 0 };
    out.set(theme, {
      engagement: prev.engagement + engagementOf(s),
      postCount: prev.postCount + Math.max(0, s.postCount),
    });
  }
  return out;
}

/**
 * 추출된(뉴스 근거) 키워드에 커뮤니티 참여도를 가산.
 * 보수적: 이미 뉴스로 확인된 테마에만 가산(커뮤니티-단독 테마는 만들지 않음, 위 ⚠️ 참고).
 */
export function mergeCommunityEngagement(
  extracted: readonly ExtractedKeyword[],
  signals: readonly CommunitySourceSignal[],
): ExtractedKeyword[] {
  const byTheme = communityEngagementByTheme(signals);
  return extracted.map((kw) => {
    const add = byTheme.get(kw.keyword);
    if (!add) return kw;
    return { ...kw, engagement: kw.engagement + add.engagement };
  });
}
