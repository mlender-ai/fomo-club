import { Stack, SplashScreen } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import Constants from "expo-constants";
import { Colors } from "../constants/theme";
import { initTracking } from "../lib/tracking";
import { useUserStore } from "../lib/store";
import { registerForPushNotificationsAsync } from "../lib/notifications";
import { useFavoritesStore } from "../lib/favoritesStore";
import { useTickerLogos } from "../hooks/useTickerLogos";

// expo-router가 자동으로 숨기는 걸 막고 splash에서 직접 제어
SplashScreen.preventAutoHideAsync().catch(() => {});

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "http://localhost:3000";

async function initAdMob() {
  try {
    const { default: mobileAds } = await import("react-native-google-mobile-ads");
    await mobileAds().initialize();
  } catch {
    // Expo Go or missing module — skip silently
  }
}

async function initPushToken() {
  const token = await registerForPushNotificationsAsync();
  if (!token) return;
  const userId = useUserStore.getState().userId;
  if (userId) {
    await useFavoritesStore.getState().registerPushToken(userId, token);
  }
}

export default function RootLayout() {
  useTickerLogos();

  useEffect(() => {
    void SplashScreen.hideAsync();
    initTracking(API_BASE, () => useUserStore.getState().token);
    void initAdMob();
    void initPushToken();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.ebonyCanvas },
          headerTintColor: Colors.whiteout,
          contentStyle: { backgroundColor: Colors.ebonyCanvas },
          headerShown: false,
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" options={{ animation: "none" }} />
        <Stack.Screen name="splash/index" options={{ animation: "none" }} />
        <Stack.Screen name="onboarding/index" options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="login/index" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
        <Stack.Screen name="result/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="collection/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="favorites/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="history/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="history/analytics" options={{ animation: "slide_from_right" }} />
      </Stack>
    </>
  );
}
