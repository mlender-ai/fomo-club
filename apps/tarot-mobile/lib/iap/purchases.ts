import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";
import Constants from "expo-constants";

let initialized = false;

export function initRevenueCat(userId?: string) {
  if (initialized) return;
  const apiKey =
    Platform.OS === "ios"
      ? (Constants.expoConfig?.extra?.["revenueCatIosKey"] as string | undefined)
      : (Constants.expoConfig?.extra?.["revenueCatAndroidKey"] as string | undefined);

  if (!apiKey) return;

  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  if (userId) Purchases.logIn(userId);
  initialized = true;
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}
