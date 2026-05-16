import { useEffect, useState, useCallback } from "react";
import {
  SafeAreaView, View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import * as uuid from "expo-crypto";
import { Colors } from "../../constants/colors";
import { useUserStore } from "../../lib/store";
import { apiFetch } from "../../lib/api";
import { useRewardedAd } from "../../lib/ads/useRewardedAd";
import { getOfferings, purchasePackage, initRevenueCat } from "../../lib/iap/purchases";
import type { PurchasesPackage } from "react-native-purchases";

export default function ProfileScreen() {
  const { userId, credits, isLoggedIn, setCredits } = useUserStore();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [purchasing, setPurchasing] = useState(false);

  const refreshCredits = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const data = await apiFetch<{ credits: number }>("/api/tarot/credits");
      setCredits(data.credits);
    } catch {}
  }, [isLoggedIn, setCredits]);

  // 리워드 광고 콜백: 서버에 크레딧 지급 요청
  const handleRewardEarned = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const key = await uuid.digestStringAsync(
        uuid.CryptoDigestAlgorithm.SHA256,
        `reward-${userId}-${Date.now()}`
      );
      const data = await apiFetch<{ credits: number }>("/api/tarot/credits/reward", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: key }),
      });
      setCredits(data.credits);
      Alert.alert("크레딧 지급!", "+1 크레딧이 추가됐습니다");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("REWARD_COOLDOWN")) {
        Alert.alert("잠시 후 다시", "30분 뒤에 다시 시청할 수 있습니다");
      }
    }
  }, [isLoggedIn, userId, setCredits]);

  const { status: adStatus, load: loadAd, show: showAd } = useRewardedAd(handleRewardEarned);

  useEffect(() => {
    if (!isLoggedIn) return;
    initRevenueCat(userId ?? undefined);
    refreshCredits();
    getOfferings().then(setPackages).catch(() => {});
  }, [isLoggedIn, userId, refreshCredits]);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const customerInfo = await purchasePackage(pkg);
      const latestTxn = customerInfo.nonSubscriptionTransactions.at(-1);
      if (!latestTxn) throw new Error("No transaction found");

      const key = latestTxn.transactionIdentifier;
      const data = await apiFetch<{ credits: number }>("/api/tarot/credits/purchase", {
        method: "POST",
        body: JSON.stringify({
          productId: pkg.product.identifier,
          purchaseToken: latestTxn.transactionIdentifier,
          idempotencyKey: key,
        }),
      });
      setCredits(data.credits);
      Alert.alert("구매 완료!", `크레딧이 추가됐습니다 (잔액: ${data.credits})`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "구매 중 오류";
      if (!msg.includes("cancel")) Alert.alert("구매 실패", msg);
    } finally {
      setPurchasing(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.placeholder}>로그인하면 프로필이 표시됩니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>크레딧</Text>
        <Text style={styles.balance}>{credits} 크레딧</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={refreshCredits}>
          <Text style={styles.refreshText}>새로고침</Text>
        </TouchableOpacity>
      </View>

      {/* 리워드 광고 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>광고 시청 (+1 크레딧)</Text>
        {adStatus === "idle" && (
          <TouchableOpacity style={styles.btn} onPress={loadAd}>
            <Text style={styles.btnText}>광고 불러오기</Text>
          </TouchableOpacity>
        )}
        {adStatus === "loading" && <ActivityIndicator color={Colors.accent} />}
        {adStatus === "ready" && (
          <TouchableOpacity style={[styles.btn, styles.btnGold]} onPress={showAd}>
            <Text style={styles.btnText}>광고 시청하기</Text>
          </TouchableOpacity>
        )}
        {adStatus === "error" && (
          <Text style={styles.errorText}>광고를 불러오지 못했습니다</Text>
        )}
      </View>

      {/* IAP 크레딧 구매 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>크레딧 구매</Text>
        {packages.length === 0 && (
          <Text style={styles.muted}>상품을 불러오는 중...</Text>
        )}
        {packages.map((pkg) => (
          <TouchableOpacity
            key={pkg.identifier}
            style={styles.btn}
            onPress={() => handlePurchase(pkg)}
            disabled={purchasing}
          >
            <Text style={styles.btnText}>
              {pkg.product.title} — {pkg.product.priceString}
            </Text>
          </TouchableOpacity>
        ))}
        {purchasing && <ActivityIndicator color={Colors.accent} style={{ marginTop: 8 }} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.bg },
  center:        { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder:   { fontSize: 14, color: Colors.muted },
  section:       { paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionTitle:  { fontSize: 12, color: Colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  balance:       { fontSize: 36, fontWeight: "700", color: Colors.gold, marginBottom: 8 },
  refreshBtn:    { alignSelf: "flex-start" },
  refreshText:   { fontSize: 13, color: Colors.accent },
  btn:           { backgroundColor: Colors.card, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  btnGold:       { borderColor: Colors.gold },
  btnText:       { fontSize: 15, color: Colors.text, fontWeight: "500" },
  errorText:     { fontSize: 13, color: "#e05c5c" },
  muted:         { fontSize: 13, color: Colors.muted },
});
