import { useEffect } from "react";
import { SafeAreaView, ScrollView, View, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import { useUserStore } from "../../lib/store";
import { useDrawStore } from "../../lib/drawStore";
import { useCollectionStore } from "../../lib/collectionStore";
import { useRewardedAd } from "../../lib/ads/useRewardedAd";

const PRIVACY_URL = "https://tarostock.app/privacy";
const TERMS_URL = "https://tarostock.app/terms";

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
  const { stats, fetchCollection } = useCollectionStore();

  useEffect(() => {
    if (isLoggedIn) fetchCollection();
  }, [isLoggedIn, fetchCollection]);

  const { status: adStatus, load: loadAd, show: showAd, resetStatus } = useRewardedAd();

  // 리워드 획득 시 알림 (useRewardedAd가 내부에서 크레딧 API 처리)
  useEffect(() => {
    if (adStatus === "earned") {
      Alert.alert("크레딧 지급!", "+1 크레딧이 추가됐습니다");
      const t = setTimeout(resetStatus, 3000);
      return () => clearTimeout(t);
    }
  }, [adStatus, resetStatus]);

  const handleWatchAd = () => {
    if (!isLoggedIn) {
      Alert.alert("로그인 필요", "로그인 후 이용 가능합니다");
      return;
    }
    if (adStatus === "ready") {
      showAd();
    } else if (adStatus === "idle" || adStatus === "error") {
      loadAd();
      Alert.alert("광고 로딩 중", "잠시 후 다시 시도해 주세요");
    }
  };

  const handleCharge = () => {
    if (!isLoggedIn) {
      Alert.alert("로그인 필요", "로그인 후 이용 가능합니다");
      return;
    }
    Alert.alert("크레딧 충전", "앱스토어 결제 연동 후 이용 가능합니다");
  };

  const handleLogout = () => {
    Alert.alert("로그아웃", "로그아웃 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: () => { logout(); resetDraw(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 프로필 헤더 */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{stats?.isComplete ? "🏆" : "✦"}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text variant="subheading" color={Colors.whiteout}>
              {isLoggedIn ? userId?.slice(0, 8) + "..." : "비로그인"}
            </Text>
            <Text variant="caption" color={Colors.midGrayText}>
              {stats?.isComplete ? "타로 마스터" : isLoggedIn ? "타로 증권 사용자" : "로그인이 필요합니다"}
            </Text>
          </View>
        </View>

        {/* 크레딧 */}
        <View style={styles.creditCard}>
          <Text variant="caption" color={Colors.midGrayText}>보유 크레딧</Text>
          <Text variant="heading-lg" color={Colors.taroEssence}>{credits}</Text>
          <View style={styles.creditActions}>
            <TouchableOpacity style={styles.creditBtn} onPress={handleCharge}>
              <Text variant="caption" color={Colors.taroEssence}>+ 충전하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.creditBtn} onPress={handleWatchAd}>
              <Text variant="caption" color={Colors.midGrayText}>광고 시청 +1</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 카드 도감 미리보기 */}
        {isLoggedIn && stats && (
          <TouchableOpacity
            style={styles.collectionCard}
            onPress={() => router.push("/collection")}
            activeOpacity={0.8}
          >
            <View style={styles.collectionHeader}>
              <Text variant="body-sm" color={Colors.silverHighlight} style={{ fontWeight: "700" }}>카드 도감</Text>
              <Text variant="caption" color={Colors.taroEssence}>전체보기 →</Text>
            </View>
            <View style={styles.collectionProgress}>
              <Text variant="caption" color={Colors.midGrayText}>
                {stats.collectedCount} / {stats.total}장 수집
              </Text>
              <Text variant="caption" color={stats.isComplete ? Colors.taroEssence : Colors.midGrayText}>
                {stats.completionRate.toFixed(0)}%
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${stats.completionRate}%` as `${number}%` }]} />
            </View>
          </TouchableOpacity>
        )}

        {/* 설정 섹션들 */}
        <Section title="계정">
          {isLoggedIn ? (
            <>
              <Row label="뽑기 기록" onPress={() => router.push("/(tabs)/history")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
              <Row label="관심 종목" onPress={() => router.push("/favorites")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
              <Row label="카드 도감" onPress={() => router.push("/collection")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
              <Row label="로그아웃" onPress={handleLogout} />
            </>
          ) : (
            <Row label="로그인 / 회원가입" onPress={() => Alert.alert("준비중", "소셜 로그인은 다음 버전에서 제공됩니다")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
          )}
        </Section>

        <Section title="앱 정보">
          <Row label="버전" value="1.0.0 (Beta)" />
          <Row label="면책 고지" onPress={() => router.push("/onboarding")} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
          <Row label="개인정보처리방침" onPress={() => Linking.openURL(PRIVACY_URL)} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
          <Row label="이용약관" onPress={() => Linking.openURL(TERMS_URL)} right={<Text variant="body-sm" color={Colors.ironOutline}>→</Text>} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.ebonyCanvas },
  profileHeader:    { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.s24, paddingTop: Spacing.s24, paddingBottom: Spacing.s24, gap: 16 },
  avatar:           { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.voidGreen, borderWidth: 1, borderColor: Colors.taroEssence, alignItems: "center", justifyContent: "center" },
  avatarText:       { fontSize: 22 },
  profileInfo:      { gap: 4 },
  creditCard:       { marginHorizontal: Spacing.s24, backgroundColor: Colors.graphiteBase, borderRadius: 16, padding: Spacing.s24, borderWidth: 1, borderColor: Colors.carbonBorder, marginBottom: 12 },
  creditActions:    { flexDirection: "row", gap: 12, marginTop: 12 },
  creditBtn:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, borderWidth: 1, borderColor: Colors.deepInsight },
  // Collection
  collectionCard:   { marginHorizontal: Spacing.s24, backgroundColor: Colors.graphiteBase, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.carbonBorder, marginBottom: Spacing.s24, gap: 8 },
  collectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  collectionProgress: { flexDirection: "row", justifyContent: "space-between" },
  progressTrack:    { height: 4, borderRadius: 2, backgroundColor: Colors.steelSurface, overflow: "hidden" },
  progressFill:     { height: "100%", borderRadius: 2, backgroundColor: Colors.taroEssence },
  // Sections
  section:          { marginBottom: Spacing.s8 },
  sectionTitle:     { paddingHorizontal: Spacing.s24, paddingBottom: 8, letterSpacing: 0.5 },
  sectionBody:      { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.carbonBorder },
  row:              { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.s24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.carbonBorder },
});
