import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { FomoColors, Spacing } from "../../constants/fomoTheme";

export default function Settings() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>설정</Text>
        <Link href="/" style={styles.link}>닫기</Link>
      </View>
      <Text style={styles.body}>
        FOMO Index는 금융 지표가 아닌 감정 체감 지표이며, 투자 조언이 아닙니다.
      </Text>
      <Text style={styles.counsel}>
        도박문제로 힘들 땐 1336(한국도박문제예방치유원)에서 무료로 상담할 수 있어요.
      </Text>
      <Link href="/login" style={styles.login}>로그인 (선택)</Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FomoColors.ink, paddingHorizontal: Spacing.s24, paddingTop: Spacing.s16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.s32 },
  title: { color: FomoColors.whiteout, fontSize: 18, fontWeight: "600" },
  link: { color: FomoColors.muted, fontSize: 14 },
  body: { color: FomoColors.muted, fontSize: 14, lineHeight: 24 },
  counsel: { color: FomoColors.muted, fontSize: 13, lineHeight: 22, marginTop: Spacing.s16 },
  login: { color: FomoColors.emotion.conviction, fontSize: 14, marginTop: Spacing.s32 },
});
