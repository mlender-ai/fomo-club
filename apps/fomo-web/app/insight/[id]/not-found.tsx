import Link from "next/link";

// 담담한 빈 상태 — 잘못된/만료된 배너 id로 진입한 경우.
export default function InsightNotFound() {
  return (
    <main className="fomo-phase-in mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl" aria-hidden>
        🌙
      </p>
      <p className="mt-4 text-sm text-whiteout">지금은 이 소식을 찾을 수 없어.</p>
      <p className="mt-1 text-xs text-muted">시간이 지나 바뀌었을 수 있어.</p>
      <Link
        href="/"
        className="mt-6 rounded-full border border-hairline px-5 py-2 text-sm text-muted transition-colors hover:text-whiteout"
      >
        홈으로
      </Link>
    </main>
  );
}
