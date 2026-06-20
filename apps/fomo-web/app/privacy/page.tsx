// 임시 최소 개인정보 처리방침 — 트랙 B(로그인=이메일 수집 시작) 게이트 충족용 초안.
// ⚠️ 법적 효력 문구·약관 최종본은 광혁 직접 영역(법률 자문 후 교체). 여기는 "없이 수집 금지" 원칙을
// 지키기 위한 최소 고지다.
export const metadata = { title: "개인정보 처리방침 · FOMO Club" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-10 text-whiteout">
      <h1 className="font-pixel text-lg">개인정보 처리방침 (임시)</h1>
      <p className="mt-2 text-[12px] text-muted">최종본은 준비 중이야. 아래는 현재 무엇을 모으는지에 대한 최소 고지.</p>

      <section className="mt-6 space-y-4 text-sm leading-6 text-muted">
        <div>
          <p className="font-pixel text-whiteout">무엇을 모으나</p>
          <p>이메일(로그인 식별용), 취향 신호(키워드·종목에 대한 관심/덜관심, 뎁스 열람·연관주 탭). 비밀번호는 해시로만 저장하고 원문은 보관하지 않아.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">왜 모으나</p>
          <p>네 취향에 맞춘 피드(개인화)를 위해서야. 투자 조언이 아니라, 네가 어떤 주제에 관심 있는지 학습해 보여주는 용도.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">로그인 없이도</p>
          <p>가입 없이 둘러볼 수 있어. 로그인은 취향을 기기 너머로 기억하기 위한 선택이야.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">보관과 삭제</p>
          <p>탈퇴하면 계정과 취향 신호를 함께 삭제해. 제3자에게 팔거나 광고에 넘기지 않아.</p>
        </div>
        <div>
          <p className="font-pixel text-whiteout">문의</p>
          <p>choihenry0010@gmail.com</p>
        </div>
      </section>
    </main>
  );
}
