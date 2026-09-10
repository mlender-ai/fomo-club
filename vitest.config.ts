import { defineConfig } from "vitest/config";
import path from "path";

/**
 * LAB-01 — 격리분(`packages/dormant/**`)은 테스트에서도 빠진다.
 * 거기 있는 테스트는 LAB-09 가 신호 로직을 되살릴 때 같이 되살린다.
 */
export default defineConfig({
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
