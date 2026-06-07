import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchBanner, type BannerItem } from "@/lib/fomoApi";

// 배너 항목 상세 — 최소(설명+수치+출처+면책). 직접 진입/새로고침에도 서버 fetch로 렌더.
// 확장 자리: 풀차트(detail.series)·관련종목(detail.relatedSymbols)·감정반응(detail.sentiment)은
// 타입에 선점만 되어 있고, 후속 라운드에서 아래 표시 영역을 채운다.
export const revalidate = 120;

async function getItem(id: string): Promise<BannerItem | null> {
  try {
    const { items } = await fetchBanner();
    return items.find((i) => i.id === id) ?? null;
  } catch {
    return null;
  }
}

export default async function InsightPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const item = await getItem(id);
  if (!item) notFound();

  const d = item.detail;
  const change = d?.metric?.change;
  const changeColor =
    typeof change === "number" ? (change < 0 ? "text-fomo" : "text-greed") : "text-whiteout";

  return (
    <main className="fomo-phase-in mx-auto flex min-h-screen max-w-md flex-col px-6 pb-12 pt-5">
      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-whiteout">
          ‹ 돌아가기
        </Link>
        <span className="font-pixel text-xs text-muted">FOMO CLUB</span>
      </div>

      {/* 타이틀 */}
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>
          {item.emoji}
        </span>
        <h1 className="text-xl font-semibold text-whiteout">{d?.title ?? item.text}</h1>
      </div>

      {/* 핵심 수치 */}
      {d?.metric && (
        <div className="mt-6 rounded-2xl border border-hairline bg-surface px-5 py-5">
          <p className="text-xs text-muted">{d.metric.label}</p>
          <p className={`mt-1 font-pixel text-4xl leading-none ${changeColor}`}>{d.metric.value}</p>
        </div>
      )}

      {/* 담담한 해석 */}
      {d?.body && (
        <p className="mt-6 text-sm leading-6 text-whiteout">{d.body}</p>
      )}

      {/* ── 확장 자리(후속 라운드) ──
          - detail.series  → 기간 토글 풀차트
          - detail.relatedSymbols → 관련 종목 리스트
          - detail.sentiment → 이 신호에 대한 사용자 감정 분포
         지금은 타입만 선점, 표시 없음. */}

      {/* 출처 */}
      {d?.source && (
        <a
          href={d.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1 text-xs text-muted underline-offset-2 transition-colors hover:text-whiteout"
        >
          출처 · {d.source.label} ↗
        </a>
      )}

      {/* 면책 — 담담하게 */}
      <p className="mt-auto pt-10 text-center text-[11px] leading-5 text-muted">
        FOMO Index는 감정 체감 지표예요. 투자 조언이 아니에요.
      </p>
    </main>
  );
}
