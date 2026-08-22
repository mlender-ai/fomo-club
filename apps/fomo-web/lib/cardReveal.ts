/**
 * 카드 정체 해제 상태 — WO-HOOK-01 §2-3.
 *
 * ## 왜 가리나
 *
 * 우리 유니버스는 무명주다. 앞면에 종목명이 보이면 사용자는 "모르는 회사네" 하고 넘긴다.
 * **가리면 궁금해진다.** 정보를 줄여서 후킹을 만드는 장치다(§2-1).
 *
 * ## 왜 영구 해제인가
 *
 * 한 번 상세를 열어 회사를 안 사람에게 다음 방문에 다시 가리면, 장치가 아니라 방해가 된다.
 * 이미 아는 것을 숨기는 화면은 사용자를 존중하지 않는다. 그래서 **해제는 되돌아가지 않는다.**
 *
 * 로그인 없이 동작해야 하므로 로컬에 남긴다(§2-3). 서버 동기화로 갈아끼울 단일 지점이다.
 */
const KEY = "fomo_card_revealed";
/** 상한 — 해제 기록은 계속 쌓이기만 하므로 오래된 것부터 버린다. 덱이 하루 10장이니 넉넉하다. */
const CAP = 500;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

function write(list: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-CAP)));
  } catch {
    // 스토리지가 막힌 환경(사파리 프라이빗 등)에서도 화면은 정상 동작해야 한다.
    // 그 경우 매번 가려진 상태로 보인다 — 기능 상실이지 오류가 아니다.
  }
}

/** 이 카드의 정체가 이미 공개됐는가. */
export function isRevealed(canonical: string): boolean {
  const key = canonical.trim();
  if (!key) return false;
  return read().includes(key);
}

/** 상세를 연 순간 호출한다. 이미 해제됐으면 아무 일도 하지 않는다. */
export function reveal(canonical: string): void {
  const key = canonical.trim();
  if (!key) return;
  const list = read();
  if (list.includes(key)) return;
  write([...list, key]);
}
