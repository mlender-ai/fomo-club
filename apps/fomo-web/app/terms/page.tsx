export const metadata = { title: "이용약관 · FOMO Club" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-whiteout">
      <h1 className="font-pixel text-lg">이용약관</h1>
      <p className="mt-2 text-[12px] text-muted">시행일: 2026년 6월 22일 · 버전 1.1</p>

      <section className="mt-6 space-y-5 text-sm leading-6 text-muted">
        <div>
          <p className="font-pixel text-whiteout">목적</p>
          <p>본 약관은 FOMO Club이 제공하는 투자 취향 카드 피드, 종목·테마 정보 요약, 관심 신호 저장 및 관련 기능의 이용 조건과 절차를 규정합니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">서비스의 성격 및 면책</p>
          <p>FOMO Club은 공개 시장 데이터와 내부 기준을 바탕으로 종목·테마 정보를 쉽게 탐색하도록 돕는 정보 제공 및 취향 매칭 서비스입니다.</p>
          <p className="mt-2">모든 콘텐츠, 점수, 라벨, 기술적 지표, 요약 문장은 투자 추천, 매수·매도 지시, 종목 추천, 수익 보장, 투자자문이 아닙니다. 투자 판단과 결과에 대한 책임은 사용자 본인에게 있습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">이용 자격</p>
          <p>만 14세 이상이며 본 약관에 동의하고, 서비스가 제공하는 인증 수단을 정상적으로 이용할 수 있어야 합니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">서비스 이용</p>
          <p>비로그인 상태에서도 일부 기능을 이용할 수 있으나, 기록 저장·개인화·알림 등 일부 기능은 로그인이 필요할 수 있습니다. 데이터 제공처, 시장 상황, 시스템 상태에 따라 정보 범위나 갱신 주기가 달라질 수 있습니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">데이터와 콘텐츠의 한계</p>
          <p>가격, 거래량, 수급, 뉴스, 기술적 지표 등은 지연되거나 누락될 수 있습니다. 투자 결정 전 공식 공시, 거래소, 증권사 등 독립적인 출처를 직접 확인해야 합니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">금지 행위</p>
          <p>투자 조언처럼 전달하는 행위, 무단 복제·배포·역공학, 봇·스크래핑·비정상 요청, 계정 도용, 보안 우회 또는 취약점 악용은 금지됩니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">지식재산권</p>
          <p>서비스 내 콘텐츠, 디자인, 텍스트, 로고, 코드, 데이터 가공 결과의 권리는 서비스 제공자 또는 정당한 권리자에게 있습니다. 무단 복제, 배포, 상업적 이용, 별도 데이터베이스 구축은 금지됩니다.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">문의</p>
          <p>support@fomo.club</p>
        </div>
      </section>
    </main>
  );
}
