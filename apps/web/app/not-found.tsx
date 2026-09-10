import Link from "next/link";

export default function NotFound() {
  return (
    <main className="lab-fallback">
      <section className="lab-fallback-card">
        <span className="section-kicker">Not Found</span>
        <p className="lab-empty-msg">없는 경로입니다.</p>
        <p className="lab-empty-note">랩 라우트는 / · /live · /strategy/[id] 셋뿐이다.</p>
        <Link className="lab-button" href="/">
          백테스트로
        </Link>
      </section>
    </main>
  );
}
