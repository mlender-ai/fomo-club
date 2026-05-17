import { SafeAreaView, View, TouchableOpacity, StyleSheet, Switch, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import { useUserStore } from "../../lib/store";
import { useDrawStore } from "../../lib/drawStore";

function Row({ label, value, onPress, right }: { label: string; value?: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Text variant="body-sm" color={Colors.silverHighlight}>{label}</Text>
      {right ?? (value ? <Text variant="body-sm" color={Colors.midGrayText}>{value}</Text> : null)}
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function MyPageScreen() {
  const router = useRouter();
  const { credits, isLoggedIn, userId, logout } = useUserStore();
  const { recentSearches, reset: resetDraw } = useDrawStore();

  const handleLogout = () => {
    Alert.alert("로그아웃", "로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: () => { logout(); resetDraw(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 프로필 헤더 */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>✦</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text variant="subheading" color={Colors.whiteout}>
            {isLoggedIn ? userId?.slice(0, 8) + "..." : "비로그인"}
          </Text>
          <Text variant="caption" color={Colors.midGrayText}>
            {isLoggedIn ? "타로 증권 사용자" : "로그인이 필요합니다"}
          </Text>
        </View>
      </View>

      {/* 크레딧 */}
      <View style={styles.creditCard}>
        <Text variant="caption" color={Colors.midGrayText}>보유 크레딧</Text>
        <Text variant="heading-lg" color={Colors.taroEssence}>{credits}</Text>
        <View style={styles.creditActions}>
          <TouchableOpacity style={styles.creditBtn}>
            <Text variant="caption" color={Colors.taroEssence}>+ 충전하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.creditBtn}>
            <Text variant="caption" color={Colors.midGrayText}>광고 시청 +1</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 설정 섹션들 */}
      <Section title="계정">
        {isLoggedIn ? (
          <>
            <Row label="뽑기 기록" onPress={() => router.push("/(tabs)/history")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
            <Row label="관심 종목" onPress={() => router.push("/favorites")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
            <Row label="로그아웃" onPress={handleLogout} />
          </>
        ) : (
          <Row label="로그인 / 회원가입" onPress={() => Alert.alert("준비중", "소셜 로그인은 다음 버전에서 제공됩니다")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
        )}
      </Section>

      <Section title="앱 정보">
        <Row label="버전" value="1.0.0 (Beta)" />
        <Row label="면책 고지" onPress={() => router.push("/onboarding")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
        <Row label="개인정보처리방침" right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
      </Section>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.ebonyCanvas },
  profileHeader:  { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.s24, paddingTop: Spacing.s24, paddingBottom: Spacing.s24, gap: 16 },
  avatar:         { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.voidGreen, borderWidth: 1, borderColor: Colors.taroEssence, alignItems: "center", justifyContent: "center" },
  avatarText:     { fontSize: 22, color: Colors.taroEssence },
  profileInfo:    { gap: 4 },
  creditCard:     { marginHorizontal: Spacing.s24, backgroundColor: Colors.graphiteBase, borderRadius: 16, padding: Spacing.s24, borderWidth: 1, borderColor: Colors.carbonBorder, marginBottom: Spacing.s24 },
  creditActions:  { flexDirection: "row", gap: 12, marginTop: 12 },
  creditBtn:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, borderWidth: 1, borderColor: Colors.deepInsight },
  section:        { marginBottom: Spacing.s8 },
  sectionTitle:   { paddingHorizontal: Spacing.s24, paddingBottom: 8, letterSpacing: 0.5 },
  sectionBody:    { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.carbonBorder },
  row:            { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.s24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.carbonBorder },
});
