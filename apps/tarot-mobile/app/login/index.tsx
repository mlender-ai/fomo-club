/**
 * 로그인 화면
 * iOS:     Apple / Google / Kakao / Naver
 * Android: Google / Kakao / Naver
 */

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Colors, Spacing } from "../../constants/theme";
import { useAuth } from "../../lib/useAuth";

const { width } = Dimensions.get("window");

// ─── 소셜 로그인 버튼 데이터 ──────────────────────────────────────────────────

interface ProviderConfig {
  id: string;
  label: string;
  bg: string;
  textColor: string;
  icon: string;
  platform?: "ios" | "android"; // undefined = 공통
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "apple",
    label: "Apple로 계속하기",
    bg: "#FFFFFF",
    textColor: "#000000",
    icon: "",
    platform: "ios",
  },
  {
    id: "google",
    label: "Google로 계속하기",
    bg: "#FFFFFF",
    textColor: "#1F1F1F",
    icon: "G",
  },
  {
    id: "kakao",
    label: "카카오로 계속하기",
    bg: "#FEE500",
    textColor: "#000000",
    icon: "K",
  },
  {
    id: "naver",
    label: "네이버로 계속하기",
    bg: "#03C75A",
    textColor: "#FFFFFF",
    icon: "N",
  },
];

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithApple, loginWithKakao, loginWithNaver } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  // 현재 플랫폼에 맞는 제공자 목록
  const visibleProviders = PROVIDERS.filter(
    (p) => !p.platform || p.platform === Platform.OS
  );

  async function handleLogin(providerId: string) {
    if (loading) return;
    setLoading(providerId);
    try {
      switch (providerId) {
        case "apple":
          await loginWithApple();
          break;
        case "google":
          // Google은 OAuth flow가 컴포넌트 훅 필요 → 임시 안내
          Alert.alert("준비 중", "Google 로그인은 EAS 빌드 후 사용 가능합니다.");
          break;
        case "kakao":
          await loginWithKakao();
          break;
        case "naver":
          await loginWithNaver();
          break;
      }
      router.replace("/(tabs)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "로그인에 실패했습니다";
      // 사용자 취소는 알림 없이 처리
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("취소")) {
        Alert.alert("로그인 실패", msg);
      }
    } finally {
      setLoading(null);
    }
  }

  function handleSkip() {
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 상단 브랜딩 */}
      <View style={styles.brandSection}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoSymbol}>✦</Text>
        </View>
        <Text style={styles.appName}>타로 증권</Text>
        <Text style={styles.tagline}>AI가 읽는 시장의 흐름</Text>
      </View>

      {/* 로그인 버튼 영역 */}
      <View style={styles.buttonSection}>
        <Text style={styles.sectionLabel}>계속하려면 로그인하세요</Text>

        {visibleProviders.map((provider) => (
          <TouchableOpacity
            key={provider.id}
            style={[styles.socialBtn, { backgroundColor: provider.bg }]}
            onPress={() => handleLogin(provider.id)}
            activeOpacity={0.85}
            disabled={loading !== null}
          >
            {loading === provider.id ? (
              <ActivityIndicator color={provider.textColor} size="small" />
            ) : (
              <>
                <View style={styles.iconBox}>
                  {provider.id === "apple" ? (
                    <Text style={[styles.iconText, { color: "#000000", fontSize: 20 }]}>
                      
                    </Text>
                  ) : (
                    <View style={[styles.iconCircle, getBadgeStyle(provider.id)]}>
                      <Text style={styles.iconCircleText}>{provider.icon}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.socialBtnText, { color: provider.textColor }]}>
                  {provider.label}
                </Text>
                <View style={{ width: 32 }} />
              </>
            )}
          </TouchableOpacity>
        ))}

        {/* 비로그인 이용 */}
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>로그인 없이 둘러보기</Text>
        </TouchableOpacity>
      </View>

      {/* 하단 법적 안내 */}
      <View style={styles.legalSection}>
        <Text style={styles.legalText}>
          로그인하면{" "}
          <Text style={styles.legalLink}>이용약관</Text>
          {" 및 "}
          <Text style={styles.legalLink}>개인정보처리방침</Text>
          에 동의한 것으로 간주됩니다.
        </Text>
        <Text style={styles.disclaimerText}>
          본 서비스는 투자 조언이 아닌 엔터테인먼트 콘텐츠입니다.
        </Text>
      </View>
    </View>
  );
}

function getBadgeStyle(id: string): object {
  switch (id) {
    case "google": return { backgroundColor: "#4285F4" };
    case "kakao":  return { backgroundColor: "#3A1D1D" };
    case "naver":  return { backgroundColor: "#03C75A" };
    default:       return { backgroundColor: "#555" };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.ebonyCanvas,
    paddingHorizontal: Spacing.s24,
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 40,
  },

  // 브랜딩
  brandSection: { alignItems: "center", gap: 12 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.voidGreen,
    borderWidth: 1.5,
    borderColor: Colors.taroEssence,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoSymbol: { fontSize: 36, color: Colors.taroEssence },
  appName: { fontSize: 28, fontWeight: "800", color: Colors.whiteout, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: Colors.midGrayText, letterSpacing: 0.3 },

  // 버튼 영역
  buttonSection: { gap: 12 },
  sectionLabel: {
    fontSize: 13,
    color: Colors.midGrayText,
    textAlign: "center",
    marginBottom: 4,
    letterSpacing: 0.2,
  },

  socialBtn: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  iconBox: { width: 32, alignItems: "flex-start" },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  iconText: { fontWeight: "700" },
  socialBtnText: { fontSize: 15, fontWeight: "600", flex: 1, textAlign: "center" },

  // 비로그인
  skipBtn: { alignItems: "center", paddingVertical: 12 },
  skipText: { fontSize: 14, color: Colors.ironOutline, textDecorationLine: "underline" },

  // 법적 안내
  legalSection: { gap: 6 },
  legalText: { fontSize: 11, color: Colors.midGrayText, textAlign: "center", lineHeight: 16 },
  legalLink: { color: Colors.silverHighlight, textDecorationLine: "underline" },
  disclaimerText: { fontSize: 10, color: Colors.ironOutline, textAlign: "center" },
});
