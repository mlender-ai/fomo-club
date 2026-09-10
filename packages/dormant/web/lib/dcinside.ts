import { parseDcGalleryTitles } from "@fomo/core";

/**
 * 디시인사이드 주식갤러리 수집 — DATA_ENGINE_STRATEGY §4.5 C-3. (네트워크)
 *
 * 공개 웹(gall.dcinside.com). 제목 원문만 가져온다(본문은 안 긁음 — 가벼움+안전).
 * community-low tier. 욕설·단정은 워딩 필터(룰+LLM)가 카드 진입 전 거른다.
 * 실패 시 빈 배열(정직한 폴백).
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const STOCK_GALLERY = "https://gall.dcinside.com/board/lists/?id=stock";

/** 주식갤러리 최근 게시물 제목. 실패 시 []. */
export async function fetchDcStockTitles(limit = 30): Promise<string[]> {
  try {
    const res = await fetch(STOCK_GALLERY, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      console.warn("[dcinside] HTTP", res.status);
      return [];
    }
    return parseDcGalleryTitles(await res.text(), limit);
  } catch (err) {
    console.warn("[dcinside] error", err);
    return [];
  }
}
