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
    googleMobileAdsAppId: admobAppIdAndroid,
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
    apiBaseUrl: "",
    adMobBannerIos,
    adMobBannerAndroid,
    adMobRewardedIos,
    adMobRewardedAndroid,
    eas: {
      projectId: "",
    },
  },
  experiments: {
    typedRoutes: true,
  },
});
