/**
 * 로딩 자리 (UI-01 E · F).
 *
 * 투명도 0.5 ↔ 1, 1.4초. **크기를 실제 내용과 맞춘다** — 안 그러면 뜨는 순간
 * 화면이 튄다.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = "var(--r-row)",
}: {
  width?: string | number;
  height?: string | number;
  radius?: string;
}) {
  return (
    <span
      className="ui-skeleton"
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

/** 행 여러 줄. 표가 뜨기 전 자리를 잡는다. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ui-skeleton-rows">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={40} />
      ))}
    </div>
  );
}
