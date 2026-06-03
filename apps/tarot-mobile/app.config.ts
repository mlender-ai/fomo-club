import { ExpoConfig, ConfigContext } from "expo/config";

const IS_PROD = process.env.APP_ENV === "production";

// Google 공식 테스트 App ID
const TEST_APP_ID_IOS = "ca-app-pub-3940256099942544~1458002511";
const TEST_APP_ID_ANDROID = "ca-app-pub-3940256099942544~3347511713";

// Google 공식 테스트 Unit ID
const TEST_BANNER_ID = "ca-app-pub-3940256099942544/2934735716";
const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/1712485313";

const admobAppIdIos = IS_PROD
  ? (process.env.ADMOB_APP_ID_IOS || TEST_APP_ID_IOS)
  : TEST_APP_ID_IOS;

const admobAppIdAndroid = IS_PROD
  ? (process.env.ADMOB_APP_ID_ANDROID || TEST_APP_ID_ANDROID)
  : TEST_APP_ID_ANDROID;

// API 서버 주소 — 실기기/배포에서 localhost 로 폴백하면 모든 API(차트 포함)가 실패한다.
// EXPO_PUBLIC_API_BASE_URL 로 오버라이드, 없으면 배포된 Vercel 프로덕션 URL을 기본값으로.
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://taro-stock-web.vercel.app";

const adMobBannerIos = IS_PROD
  ? (process.env.ADMOB_BANNER_ID_IOS || "")
  : TEST_BANNER_ID;

const adMobBannerAndroid = IS_PROD
  ? (process.env.ADMOB_BANNER_ID_ANDROID || "")
  : TEST_BANNER_ID;

const adMobRewardedIos = IS_PROD
  ? (process.env.ADMOB_REWARDED_ID_IOS || "")
  : TEST_REWARDED_ID;

const adMobRewardedAndroid = IS_PROD
  ? (process.env.ADMOB_REWARDED_ID_ANDROID || "")
  : TEST_REWARDED_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "타로 증권",
  slug: "tarot-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  scheme: "tarot",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0a0a0f",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.tarostock.app",
    infoPlist: {
      NSUserTrackingUsageDescription:
        "관심 있는 주제와 관련된 광고를 보여드리기 위해 기기 식별자를 사용합니다. 동의하지 않아도 앱을 정상 이용할 수 있습니다.",
      GADApplicationIdentifier: admobAppIdIos,
      KAKAO_APP_KEY: "dummy_kakao_key_for_simulator",
    },
  },
  android: {
    package: "com.tarostock.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0a0a0f",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.INTERNET",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.VIBRATE",
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: admobAppIdAndroid,
        iosAppId: admobAppIdIos,
      },
    ],
  ],
  extra: {
    revenueCatIosKey: "",
    revenueCatAndroidKey: "",
    apiBaseUrl,
    adMobBannerIos,
    adMobBannerAndroid,
    adMobRewardedIos,
    adMobRewardedAndroid,
    eas: {
      projectId: process.env.EAS_PROJECT_ID || "",
    },
  },
  // EAS Update OTA — main 브랜치 푸시 시 GitHub Actions가 새 JS 번들 발행.
  // Expo Go가 동일 SDK runtime을 사용하므로 sdkVersion 정책으로 매칭.
  // EAS_PROJECT_ID 환경변수 미설정 시 updates URL이 비어 OTA 비활성 (Expo Go dev server는 정상 동작).
  ...(process.env.EAS_PROJECT_ID
    ? {
        updates: {
          url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`,
        },
        runtimeVersion: { policy: "sdkVersion" as const },
      }
    : {}),
  experiments: {
    typedRoutes: true,
  },
});
