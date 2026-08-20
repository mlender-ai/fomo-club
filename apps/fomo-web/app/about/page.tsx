/**
 * 데이터 출처 · 개인정보 · 면책 (DS-06 §6-5).
 *
 * **앱 심사 필수 항목이다.** 투자 정보 앱은 ① 면책 고지 ② 데이터 출처 ③ 개인정보 처리를
 * 화면으로 확인할 수 있어야 한다. 탭을 늘리지 않기로 했으므로(DS-04 §3) 별도 라우트로 두고,
 * 최초 실행 고지와 성적표 하단에서 링크한다.
 *
 * 여기 적은 것은 **지금 실제로 하는 일**이다. 계획을 적지 않는다.
 */

const SOURCES: ReadonlyArray<{ label: string; detail: string }> = [
  { label: "국내 시세·수급", detail: "한국거래소 공개 시세와 투자자별 매매동향" },
  { label: "국내 공시·재무", detail: "금융감독원 전자공시(DART)" },
  { label: "미국 임원 매수", detail: "미국 증권거래위원회(SEC) Form 4 공시" },
  { label: "미국 시세", detail: "공개 시세 API" },
  { label: "회사 개요", detail: "증권사·데이터 벤더 요약. 원문은 상세의 `출처 보기` 로 볼 수 있어요" },
];

const PRIVACY: ReadonlyArray<{ label: string; detail: string }> = [
  { label: "관심 종목", detail: "이 기기(브라우저)에만 저장돼요. 서버로 보내지 않아요" },
  { label: "본 카드 기록", detail: "익명 세션 식별자로 서버에 남아요. 이름·연락처는 받지 않아요" },
  { label: "계정", detail: "로그인 없이 씁니다. 이메일·전화번호를 수집하지 않아요" },
];

export default function AboutPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] px-gutter pb-s6 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="flex h-14 items-center">
        <a
          href="/"
          aria-label="뒤로"
          className="tap-button -ml-2 flex h-touch w-touch items-center justify-center text-ds-text-2"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M12.5 4L6.5 10l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <h1 className="text-ds-title-lg text-ds-text-1">이 앱에 대해</h1>
      <p className="mt-s1 text-ds-caption text-ds-text-2">무엇을 보여주고, 무엇을 남기지 않나</p>

      <section className="mt-s5 border-t-hair border-ds-border pt-s5">
        <h2 className="font-mono text-ds-label tracking-[0.06em] text-ds-text-2">면책</h2>
        <div className="mt-s3 space-y-s2">
          <p className="text-ds-body text-ds-text-1">투자 판단과 책임은 이용자 본인에게 있어요.</p>
          <p className="text-ds-body text-ds-text-2">
            이 앱은 정보 제공 서비스예요. 투자 자문·권유·매매 신호가 아니고, 목표가나 매수·매도 의견을 내지 않아요.
            과거 흐름과 현재 신호가 미래 수익을 보장하지 않아요.
          </p>
        </div>
      </section>

      <section className="mt-s5 border-t-hair border-ds-border pt-s5">
        <h2 className="font-mono text-ds-label tracking-[0.06em] text-ds-text-2">데이터 출처</h2>
        <ul className="mt-s3">
          {SOURCES.map((row) => (
            <li key={row.label} className="border-b-hair border-ds-border py-s3">
              <p className="text-[14px] font-medium leading-tight text-ds-text-1">{row.label}</p>
              <p className="mt-s1 text-ds-caption text-ds-text-2">{row.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-s3 text-ds-caption text-ds-text-3">
          가격·지표는 지연되거나 부정확할 수 있어요. 화면의 수치는 발행 시점 기준이고, 기준 시각을 함께 적어요.
        </p>
      </section>

      <section className="mt-s5 border-t-hair border-ds-border pt-s5">
        <h2 className="font-mono text-ds-label tracking-[0.06em] text-ds-text-2">개인정보</h2>
        <ul className="mt-s3">
          {PRIVACY.map((row) => (
            <li key={row.label} className="border-b-hair border-ds-border py-s3">
              <p className="text-[14px] font-medium leading-tight text-ds-text-1">{row.label}</p>
              <p className="mt-s1 text-ds-caption text-ds-text-2">{row.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-s3 text-ds-caption text-ds-text-3">
          자세한 내용은 <a href="/privacy" className="underline">개인정보 처리방침</a>과{" "}
          <a href="/terms" className="underline">이용약관</a>에 있어요.
        </p>
      </section>

      <section className="mt-s5 border-t-hair border-ds-border pt-s5">
        <h2 className="font-mono text-ds-label tracking-[0.06em] text-ds-text-2">기록</h2>
        <p className="mt-s3 text-ds-body text-ds-text-2">
          우리가 짚은 판단은 발행 시점 가격과 함께 그대로 남아요. 틀린 것도 지우지 않아요 —{" "}
          <a href="/track-record" className="underline">성적표</a>에서 전부 볼 수 있어요.
        </p>
      </section>
    </main>
  );
}
