/**
 * 앱 초기화 스플래시 화면
 * - 온보딩 동의 여부 확인 (AsyncStorage)
 * - 토큰 복원 시도 (실패해도 게스트로 진입)
 * - 서버 연결 불필요 — Expo Go 단독 동작
 */

import { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Colors } from "../../constants/theme";
import { useAuth } from "../../lib/useAuth";
import { useOnboardingStore } from "../../lib/onboardingStore";

const { width } = Dimensions.get("window");

export default function SplashScreen() {
  const router = useRouter();
  const { restoreSession } = useAuth();
  const { loadFromStorage } = useOnboardingStore();

  const logoScale   = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const dotAnim     = useRef(new Animated.Value(0)).current;
  const barWidth    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 로고 등장
    Animated.parallel([
      Animated.spring(logoScale,   { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });

    // 프로그레스 바
    Animated.timing(barWidth, { toValue: width - 96, duration: 1800, useNativeDriver: false }).start();

    // 점 애니메이션
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    void initialize();
  }, []);

  async function initialize() {
    // 최소 1.5초 스플래시 표시
    await Promise.all([
      new Promise((r) => setTimeout(r, 1500)),
      loadFromStorage(),
    ]);

    const agreed = useOnboardingStore.getState().hasAgreed;

    if (!agreed) {
      router.replace("/onboarding");
      return;
    }

    // 토큰 복원 시도 — 실패해도 게스트로 메인 진입
    try {
      await restoreSession();
    } catch {}

    router.replace("/(tabs)");
  }

  const dotOpacity = dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 로고 */}
      <Animated.View style={[styles.logoContainer, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoSymbol}>✦</Text>
          </View>
        </View>
      </Animated.View>

      {/* 앱명 */}
      <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
        <Text style={styles.appName}>타로 증권</Text>
        <Text style={styles.tagline}>AI가 읽는 시장의 흐름</Text>
      </Animated.View>

      {/* 로딩 바 */}
      <View style={styles.loadingSection}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
        <View style={styles.loadingTextRow}>
          <Text style={styles.loadingText}>카드를 섞는 중</Text>
          <Animated.Text style={[styles.dots, { opacity: dotOpacity }]}>···</Animated.Text>
        </View>
      </View>

      <Text style={styles.disclaimer}>본 서비스는 투자 조언이 아닌 엔터테인먼트 콘텐츠입니다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.ebonyCanvas, alignItems: "center", justifyContent: "center", gap: 32 },
  logoContainer:  { alignItems: "center" },
  logoOuter:      { width: 100, height: 100, borderRadius: 50, borderWidth: 1, borderColor: `${Colors.taroEssence}40`, alignItems: "center", justifyContent: "center" },
  logoInner:      { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.voidGreen, borderWidth: 1.5, borderColor: Colors.taroEssence, alignItems: "center", justifyContent: "center" },
  logoSymbol:     { fontSize: 36, color: Colors.taroEssence },
  textContainer:  { alignItems: "center", gap: 6 },
  appName:        { fontSize: 32, fontWeight: "800", color: Colors.whiteout, letterSpacing: -0.5 },
  tagline:        { fontSize: 14, color: Colors.midGrayText, letterSpacing: 0.5 },
  loadingSection: { alignItems: "center", gap: 10, width: "100%" },
  barTrack:       { width: width - 96, height: 2, borderRadius: 1, backgroundColor: Colors.steelSurface, overflow: "hidden" },
  barFill:        { height: "100%", borderRadius: 1, backgroundColor: Colors.taroEssence },
  loadingTextRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  loadingText:    { fontSize: 12, color: Colors.ironOutline },
  dots:           { fontSize: 12, color: Colors.taroEssence },
  disclaimer:     { position: "absolute", bottom: 40, fontSize: 10, color: Colors.carbonBorder, textAlign: "center", paddingHorizontal: 32 },
});
