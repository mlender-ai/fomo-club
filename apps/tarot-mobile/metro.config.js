const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const rootNodeModules = path.resolve(workspaceRoot, "node_modules");

// react는 루트(18.3.1)와 앱(19.1.0) 두 버전 공존 → 루트 copy 차단 + 앱 로컬 강제.
// react-native는 단일 버전(0.81.5)이라 dedup 불필요 → 차단하지 않는다.
// (두 번째 Expo 앱 추가로 react-native가 루트로 hoist되면, 차단 시 오히려 해소 실패)
config.resolver.blockList = [
  new RegExp(
    `^${rootNodeModules.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/react/.*`
  ),
];

config.resolver.extraNodeModules = {
  "react": path.resolve(projectRoot, "node_modules/react"),
};

// Apple Authentication은 iOS 네이티브 바이너리 전용 — Expo Go에서 empty로 처리
// Kakao/Naver는 JS 레이어 모듈이 있어서 정상 resolve 가능
const NATIVE_ONLY_MODULES = [
  "@invertase/react-native-apple-authentication",
];

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (NATIVE_ONLY_MODULES.includes(moduleName)) {
    // 빈 모듈로 대체 — try-require에서 catch로 처리됨
    return { type: "empty" };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
