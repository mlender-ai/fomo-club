export const metadata = { title: "개인정보 처리방침 · FOMO Club" };

const rows = [
  ["소셜 로그인 식별자, 이메일(선택)", "계정 생성 및 인증", "회원 탈퇴 시까지"],
  ["익명 세션 ID", "비로그인 이용, 방문/재방문 구분, 기본 보안", "생성 후 최대 1년"],
  ["관심/비관심 신호, 상세 열람 등 서비스 이용 기록", "취향 기반 피드 개선, 서비스 제공", "회원 탈퇴 또는 삭제 요청 시까지"],
  ["접속 로그(IP, User-Agent, 요청 시각 등)", "장애 대응, 보안 감사, 부정 이용 방지", "관련 법령 및 내부 보안 기준에 따른 기간"],
  ["푸시 알림 토큰(동의 시)", "관심 종목·서비스 알림 발송", "알림 해제 또는 회원 탈퇴 시까지"],
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-whiteout">
      <h1 className="font-pixel text-lg">개인정보 처리방침</h1>
      <p className="mt-2 text-[12px] text-muted">시행일: 2026년 6월 22일 · 버전 1.1</p>

      <section className="mt-6 space-y-4 text-sm leading-6 text-muted">
        <div>
          <p className="font-pixel text-whiteout">수집하는 개인정보</p>
          <p>FOMO Club은 투자 취향 카드 피드, 관심 신호 저장, 계정 인증 및 서비스 개선을 위해 필요한 최소한의 개인정보만 수집합니다.</p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
            {rows.map(([item, purpose, retention]) => (
              <div key={item} className="grid gap-1 border-b border-white/10 p-3 last:border-b-0 sm:grid-cols-3">
                <p className="text-whiteout">{item}</p>
                <p>{purpose}</p>
                <p>{retention}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="font-pixel text-whiteout">수집 방법</p>
          <p>로그인 또는 회원가입, 카드 피드·상세 화면·관심/비관심 이용, 보안·장애 대응을 위한 서버 로그 생성 과정에서 수집됩니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">제3자 제공 및 처리 위탁</p>
          <p>개인정보는 원칙적으로 제3자에게 제공하지 않습니다. 다만 법적 요구 또는 사용자 동의가 있는 경우는 예외입니다. 인증·데이터베이스·호스팅을 위해 Google, Kakao, Supabase, Vercel에 처리를 위탁할 수 있습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">쿠키 및 유사 기술</p>
          <p>로그인, 세션 유지, 보안 및 기본 분석을 위해 쿠키 또는 브라우저 저장소를 사용할 수 있습니다. 브라우저 설정으로 거부할 수 있으나 일부 기능이 제한될 수 있습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">이용자의 권리</p>
          <p>개인정보 열람, 정정·삭제, 처리 정지, 동의 철회를 요청할 수 있습니다. 만 14세 미만 아동의 개인정보는 수집하지 않습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">문의</p>
          <p>privacy@fomo.club</p>
        </div>
      </section>
    </main>
  );
}
