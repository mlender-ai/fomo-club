import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["packages/**/__tests__/**/*.test.ts", "apps/web/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@taro/core": path.resolve(__dirname, "packages/tarot-core/src"),
      "@trading/shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
});
