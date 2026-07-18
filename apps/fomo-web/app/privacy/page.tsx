export const metadata = { title: "개인정보 처리방침 · FOMO Club" };

const rows = [
  ["소셜 로그인 프로필(이메일, 닉네임), 소셜 계정 식별자", "계정 생성 및 인증", "회원 탈퇴 시까지"],
  ["이메일·비밀번호(이메일 가입 시)", "계정 생성 및 인증", "회원 탈퇴 시까지"],
  ["익명 기기 식별자·세션 ID", "비로그인 이용, 방문/재방문 구분, 기본 보안", "생성 후 최대 1년"],
  ["관심 시장·테마 등 온보딩 취향 선택", "취향 기반 개인화, 서비스 제공", "회원 탈퇴 또는 삭제 요청 시까지"],
  ["열람·스와이프(관심/비관심)·검색 요청 등 서비스 이용 기록", "취향 기반 피드 개선, 서비스 제공·품질 개선", "회원 탈퇴 또는 삭제 요청 시까지"],
  ["접속 로그(IP, User-Agent, 요청 시각 등)", "장애 대응, 보안 감사, 부정 이용 방지", "관련 법령 및 내부 보안 기준에 따른 기간"],
  ["푸시 알림 토큰(동의 시)", "관심 종목·서비스 알림 발송", "알림 해제 또는 회원 탈퇴 시까지"],
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-whiteout">
      <h1 className="font-pixel text-lg">개인정보 처리방침</h1>
      <p className="mt-2 text-[12px] text-muted">시행일: 2026년 7월 19일 · 버전 1.2</p>

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
          <p>개인정보는 원칙적으로 제3자에게 제공하지 않습니다. 다만 법적 요구 또는 사용자 동의가 있는 경우는 예외입니다. 서비스 운영을 위해 아래에 처리를 위탁합니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Vercel Inc. — 애플리케이션 호스팅·서버리스 실행·로그</li>
            <li>데이터베이스 호스팅 사업자 — 계정·이용 기록의 저장(관리형 PostgreSQL)</li>
            <li>Kakao·Google·Apple — 소셜 로그인 인증(해당 로그인 이용 시)</li>
          </ul>
          <p className="mt-2 text-[12px]">위탁 항목·수탁자는 서비스 변경에 따라 갱신될 수 있으며, 변경 시 본 방침을 통해 고지합니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">마케팅 정보 수신(선택)</p>
          <p>이벤트·업데이트 등 마케팅 정보 수신은 선택 동의 항목이며, 동의하지 않아도 서비스를 이용할 수 있습니다. 동의는 언제든 철회할 수 있습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">쿠키 및 유사 기술</p>
          <p>로그인, 세션 유지, 보안 및 기본 분석을 위해 쿠키 또는 브라우저 저장소를 사용할 수 있습니다. 브라우저 설정으로 거부할 수 있으나 일부 기능이 제한될 수 있습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">이용자의 권리 · 회원 탈퇴</p>
          <p>개인정보 열람, 정정·삭제, 처리 정지, 동의 철회를 요청할 수 있습니다. 설정에서 언제든 회원 탈퇴할 수 있으며, 탈퇴 시 계정과 개인 식별이 가능한 데이터는 지체 없이 파기합니다. 다만 관련 법령상 보존 의무가 있는 기록과, 개인을 식별할 수 없도록 처리된 통계는 예외로 보존될 수 있습니다. 만 14세 미만 아동의 개인정보는 수집하지 않습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">문의</p>
          <p>privacy@fomo.club</p>
        </div>
        <p className="pt-2 text-[11px] leading-5 text-muted/70">
          ※ 본 방침은 서비스 실태를 반영한 초안이며 법률 자문이 아닙니다. 공개 서비스 시행 전 법률 전문가의 최종 검토가 필요합니다.
        </p>
      </section>
    </main>
  );
}
