import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Colors } from "../constants/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        initialRouteName="splash/index"
        screenOptions={{
          headerStyle: { backgroundColor: Colors.ebonyCanvas },
          headerTintColor: Colors.whiteout,
          contentStyle: { backgroundColor: Colors.ebonyCanvas },
          headerShown: false,
          animation: "fade",
        }}
      >
        {/* 초기화 화면 */}
        <Stack.Screen name="splash/index" options={{ animation: "none" }} />

        {/* 온보딩 / 로그인 */}
        <Stack.Screen name="onboarding/index" options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="login/index" options={{ animation: "slide_from_bottom" }} />

        {/* 메인 탭 */}
        <Stack.Screen name="(tabs)" />

        {/* 결과 / 컬렉션 / 관심종목 */}
        <Stack.Screen name="result/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="collection/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="favorites/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="history/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="history/analytics" options={{ animation: "slide_from_right" }} />
      </Stack>
    </>
  );
}
