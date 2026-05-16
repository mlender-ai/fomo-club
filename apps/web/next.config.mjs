import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const sharedConfig = {
  transpilePackages: ["@trading/shared", "@taro/core"]
};

export default function nextConfig(phase) {
  return {
    ...sharedConfig,
    // Keep dev and production build artifacts separate.
    // This prevents chunk/runtime corruption when `next dev` and `next build`
    // are both used during the same local session.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next-build"
  };
}
