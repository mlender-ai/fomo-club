// 레거시/백엔드 호스트 랜딩. 실제 제품은 fomo-web. 여기는 /api/fomo/* 백엔드를 제공한다.
// (이전엔 삭제된 /admin 으로 redirect 했으나 admin 제거로 404 → 정적 200 안내로 대체.)
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 24,
        background: "#000",
        color: "#fafafa",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>FOMO Club</h1>
      <p style={{ color: "#8a8a8a", fontSize: 14, lineHeight: 1.6, maxWidth: 360 }}>
        이 호스트는 FOMO Club 백엔드 API(<code>/api/fomo/*</code>)를 제공해요.
        <br />
        제품 화면은 fomo-web에서 볼 수 있어요.
      </p>
    </main>
  );
}
