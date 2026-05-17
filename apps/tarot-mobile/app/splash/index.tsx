/**
 * 앱 초기화 스플래시 화면
 * - 토큰 복원 (자동 로그인)
 * - 온보딩 동의 여부 확인
 * - 라우팅 결정: 온보딩 → 로그인 → 메인
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
  const { hasAgreed, loadFromStorage } = useOnboardingStore();

  // 애니메이션 값들
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 로고 등장 애니메이션
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 텍스트 페이드인
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    });

    // 로딩 바 애니메이션 (진행률 표시)
    Animated.timing(barWidth, {
      toValue: width - 96,
      duration: 2200,
      useNativeDriver: false,
    }).start();

    // 로딩 점 반복 애니메이션
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    // 초기화 작업
    void initialize();
  }, []);

  async function initialize() {
    try {
      // 최소 2초는 스플래시 표시
      const [_, hasOnboarded] = await Promise.all([
        new Promise((r) => setTimeout(r, 2000)),
        loadFromStorage().then(() => hasAgreed),
      ]);

      // 온보딩 동의 여부 확인 (스토어 로드 후 재확인)
      const agreed = useOnboardingStore.getState().hasAgreed;

      if (!agreed) {
        router.replace("/onboarding");
        return;
      }

      // 토큰 복원 시도
      const restored = await restoreSession();

      if (!restored) {
        router.replace("/login");
      } else {
        router.replace("/(tabs)");
      }
    } catch {
      // 에러 시 온보딩부터 재시작
      router.replace("/onboarding");
    }
  }

  const dotOpacity = dotAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 로고 */}
      <Animated.View
        style={[
          styles.logoContainer,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoSymbol}>✦</Text>
          </View>
        </View>
      </Animated.View>

      {/* 앱명 + 태그라인 */}
      <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
        <Text style={styles.appName}>타로 증권</Text>
        <Text style={styles.tagline}>AI가 읽는 시장의 흐름</Text>
      </Animated.View>

      {/* 로딩 영역 */}
      <View style={styles.loadingSection}>
        {/* 로딩 바 */}
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>

        {/* 로딩 텍스트 + 점 */}
        <View style={styles.loadingTextRow}>
          <Text style={styles.loadingText}>시장 데이터를 불러오는 중</Text>
          <Animated.Text style={[styles.dots, { opacity: dotOpacity }]}>
            ···
          </Animated.Text>
        </View>
      </View>

      {/* 하단 */}
      <Text style={styles.disclaimer}>
        본 서비스는 투자 조언이 아닌 엔터테인먼트 콘텐츠입니다
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.ebonyCanvas,
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },

  // 로고
  logoContainer: { alignItems: "center" },
  logoOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: `${Colors.taroEssence}40`,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.voidGreen,
    borderWidth: 1.5,
    borderColor: Colors.taroEssence,
    alignItems: "center",
    justifyContent: "center",
  },
  logoSymbol: { fontSize: 36, color: Colors.taroEssence },

  // 텍스트
  textContainer: { alignItems: "center", gap: 6 },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.whiteout,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: Colors.midGrayText,
    letterSpacing: 0.5,
  },

  // 로딩
  loadingSection: { alignItems: "center", gap: 10, width: "100%" },
  barTrack: {
    width: width - 96,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.steelSurface,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 1,
    backgroundColor: Colors.taroEssence,
  },
  loadingTextRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  loadingText: { fontSize: 12, color: Colors.ironOutline },
  dots: { fontSize: 12, color: Colors.taroEssence },

  // 하단
  disclaimer: {
    position: "absolute",
    bottom: 40,
    fontSize: 10,
    color: Colors.carbonBorder,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
