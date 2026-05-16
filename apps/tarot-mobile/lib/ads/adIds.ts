import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";

const IS_TEST = __DEV__;

export const AD_UNIT_BANNER = IS_TEST
  ? TestIds.BANNER
  : Platform.OS === "ios"
  ? "ca-app-pub-PLACEHOLDER/PLACEHOLDER_BANNER_IOS"
  : "ca-app-pub-PLACEHOLDER/PLACEHOLDER_BANNER_ANDROID";

export const AD_UNIT_REWARDED = IS_TEST
  ? TestIds.REWARDED
  : Platform.OS === "ios"
  ? "ca-app-pub-PLACEHOLDER/PLACEHOLDER_REWARDED_IOS"
  : "ca-app-pub-PLACEHOLDER/PLACEHOLDER_REWARDED_ANDROID";
