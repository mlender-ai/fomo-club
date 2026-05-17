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

// react/react-native must resolve to a single copy — block root versions
config.resolver.blockList = [
  new RegExp(
    `^${rootNodeModules.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/react/.*`
  ),
  new RegExp(
    `^${rootNodeModules.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/react-native/.*`
  ),
];

// Force all react/react-native imports (including those from root-hoisted packages) to app-local copy
config.resolver.extraNodeModules = {
  "react":        path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};

// Native-only modules not available in Expo Go — mock with empty module
// 실제 동작은 EAS 네이티브 빌드에서만 가능
const NATIVE_ONLY_MODULES = [
  "@invertase/react-native-apple-authentication",
  "@react-native-seoul/kakao-login",
  "@react-native-seoul/naver-login",
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
