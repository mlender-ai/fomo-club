import { defineConfig } from "vitest/config";
import path from "path";

/**
 * LAB-01 — 격리분(`packages/dormant/**`)은 테스트에서도 빠진다.
 * 거기 있는 테스트는 LAB-09 가 신호 로직을 되살릴 때 같이 되살린다.
 */
export default defineConfig({
  // UI-FIX A-2 — 텍스트 예산 테스트가 탭 본문(.tsx)을 서버 렌더한다. web 의 tsconfig 는
  // `jsx: preserve`(Next 가 변환)라, 테스트에서는 oxc(Vite 8) 가 직접 변환하게 둔다.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    include: ["packages/**/__tests__/**/*.test.ts", "apps/web/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "packages/dormant/**"],
  },
  resolve: {
    alias: {
      "@fomo/shared": path.resolve(__dirname, "packages/shared/src"),
      "@/lib": path.resolve(__dirname, "apps/web/lib"),
      "@/app": path.resolve(__dirname, "apps/web/app"),
    },
  },
});
