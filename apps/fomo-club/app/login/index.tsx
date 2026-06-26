import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { FomoColors, Spacing, Radius } from "../../constants/fomoTheme";

const NEON = "#D8FF3A";

export default function Login() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.nav}>
        <Link href="/settings" style={styles.close}>닫기</Link>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>FOMO CLUB</Text>
        <Text style={styles.headline}>
          당신을 위한{"\n"}
          <Text style={styles.accent}>취향투자</Text> 클럽
        </Text>
        <Text style={styles.sub}>
          분석보다 발견.{"\n"}멈춰 보게 되는 종목이 당신의 기준이다.
        </Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>소셜 로그인 준비 중</Text>
        </View>
        <Text style={styles.hint}>
          가입 없이도 카드를 스와이프하고{"\n"}FOMO 지수를 확인할 수 있어요.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: FomoColors.ink,
    paddingHorizontal: Spacing.s24,
  },
  nav: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: Spacing.s8,
    marginBottom: Spacing.s32,
  },
  close: {
    color: FomoColors.muted,
    fontSize: 14,
  },
  hero: {
    flex: 1,
    justifyContent: "center",
  },
  eyebrow: {
    color: NEON,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: Spacing.s16,
  },
  headline: {
    color: FomoColors.whiteout,
    fontSize: 40,
    fontWeight: "700",
    lineHeight: 48,
    marginBottom: Spacing.s24,
  },
  accent: {
    color: NEON,
  },
  sub: {
    color: FomoColors.muted,
    fontSize: 16,
    lineHeight: 26,
  },
  bottom: {
    paddingBottom: Spacing.s32,
    gap: Spacing.s16,
  },
  cta: {
    backgroundColor: NEON,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.s16,
    alignItems: "center",
  },
  ctaText: {
    color: FomoColors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  hint: {
    color: FomoColors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
});
