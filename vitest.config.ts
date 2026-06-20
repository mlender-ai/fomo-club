import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "packages/**/__tests__/**/*.test.ts",
      "apps/web/__tests__/**/*.test.ts",
      "apps/tarot-mobile/**/__tests__/**/*.test.ts",
      "apps/fomo-club/tests/**/*.e2e.ts",
      "scripts/**/__tests__/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@taro/core": path.resolve(__dirname, "packages/tarot-core/src"),
      "@fomo/shared": path.resolve(__dirname, "packages/shared/src"),
      "@fomo/core": path.resolve(__dirname, "packages/fomo-core/src"),
      "@/lib": path.resolve(__dirname, "apps/web/lib"),
      "@/app": path.resolve(__dirname, "apps/web/app"),
    },
  },
});
