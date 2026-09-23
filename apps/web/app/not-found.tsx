/**
 * 없는 경로.
 *
 * **여섯 탭 중 하나로 보낸다.** 옛 경로(`/live` · `/data` · `/backtest` · `/whale` ·
 * `/trades` · `/strategy/[id]`)는 여기까지 오지 않는다 — `next.config.mjs` 가 먼저 새 자리로
 * 보낸다(UI-03 PART B).
 */
import Link from "next/link";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/strategies", label: "전략" },
  { href: "/positions", label: "포지션" },
  { href: "/whales", label: "고래" },
  { href: "/research", label: "연구" },
  { href: "/journal", label: "복기" },
];

export default function NotFound() {
  return (
    <main className="sh-fallback">
      <section className="sh-fallback-card">
        <p className="sh-fallback-code">404</p>
        <h1 className="sh-fallback-title">없는 화면이에요</h1>
        <p className="sh-fallback-text">주소가 바뀌었을 수 있어요. 아래 화면 중 하나로 가세요.</p>
        <nav className="sh-inline" aria-label="화면">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="sh-tab">
              {t.label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
