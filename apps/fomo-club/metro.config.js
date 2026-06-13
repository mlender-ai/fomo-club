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

// react는 루트(18.3.1)와 앱(19.1.0) 두 버전이 공존 → 루트 copy를 차단하고 앱 로컬로 강제.
// react-native는 단일 버전(0.81.5, 루트 hoisting)이라 dedup 불필요 → 차단하지 않는다.
// (이전 RN 앱은 react-native까지 차단하지만 그건 앱 로컬 RN을 전제 — 모노레포에 두 번째
//  앱이 생기며 RN이 루트로 hoist되는 환경에서는 차단이 오히려 해소 실패를 유발한다.)
config.resolver.blockList = [
  new RegExp(`^${rootNodeModules.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/react/.*`),
];

config.resolver.extraNodeModules = {
  // 중복되는 react만 앱 로컬로 redirect. react-native는 자연 해소(루트 단일 copy).
  "react": path.resolve(projectRoot, "node_modules/react"),
};

module.exports = config;
