/**
 * 디시인사이드 주식갤러리 파서 — DATA_ENGINE_STRATEGY §4.5 C-3. 순수(네트워크 0).
 *
 * 가장 날것의 개미 심리(community-low). 욕설·단정·찌라시 多 → **워딩 필터 필수**(이미 적용).
 * 여기선 게시물 제목만 보존 추출(개수가 아니라 내용). 안전 판정은 wording-filter + LLM judge 가 한다.
 */

/**
 * 갤러리 리스트 HTML → 게시물 제목 배열. board/view 앵커 텍스트를 뽑고 태그/엔티티 정리.
 * 공지·이벤트·숫자만/빈 제목은 스킵. limit 개까지(최신 우선 = HTML 등장 순).
 */
export function parseDcGalleryTitles(html: string, limit = 30): string[] {
  if (!html) return [];
  const re = /href="\/board\/view\/\?id=[a-z0-9_]+(?:&amp;|&)no=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const t = (m[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (t.length < 2 || /^\d+$/.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
