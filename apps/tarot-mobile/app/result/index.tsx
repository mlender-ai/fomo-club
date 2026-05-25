import { useEffect, useRef, useState } from "react";
import {
  SafeAreaView, View, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { useDrawStore, type DrawnCard } from "../../lib/drawStore";
import { useRewardedAd } from "../../lib/ads/useRewardedAd";
import { useUserStore } from "../../lib/store";
import { apiFetch } from "../../lib/api";
import { trackEvent } from "../../lib/analytics";
import { shareResult } from "../../lib/share";
import { TickerLogo } from "../../components/TickerLogo";
import { useStoreReview } from "../../lib/useStoreReview";
import { FlameGlow } from "../../components/FlameGlow";

const DISCLAIMER = "본 해석은 오락 목적으로 제공되며 투자 조언이 아닙니다. 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.";

const SLOT_LABELS: Record<string, string> = {
  past: "과거",
  present: "현재",
  future: "미래",
};

function CardReveal({ card, index }: { card: DrawnCard; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(32)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1,    duration: 600, delay: index * 250, useNativeDriver: true }),
      Animated.timing(translateY,  { toValue: 0,    duration: 600, delay: index * 250, useNativeDriver: true }),
      Animated.timing(scale,       { toValue: 1,    duration: 600, delay: index * 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const slotLabel = card.slot ? SLOT_LABELS[card.slot] ?? null : null;

  return (
    <Animated.View style={[styles.cardReveal, { opacity, transform: [{ translateY }, { scale }] }]}>
      <FlameGlow delay={index * 250 + 400} />
      {/* 슬롯 레이블 (3장 스프레드용) */}
      {slotLabel && (
        <View style={styles.slotBadge}>
          <Text variant="caption" color={Colors.taroEssence} style={styles.slotLabel}>{slotLabel}</Text>
        </View>
      )}

      <View style={styles.cardHeader}>
        {/* 카드 아트 영역 — 역방향 시 회전 표시 */}
        <Animated.View style={[styles.cardThumb, card.isReversed && styles.cardThumbReversed]}>
          <Text style={styles.cardThumSymbol}>{card.symbol}</Text>
          {card.isReversed && <Text style={styles.reversedMark}>▽</Text>}
        </Animated.View>
        <View style={styles.cardMeta}>
          <Text variant="subheading" color={Colors.whiteout}>{card.nameKo}</Text>
          <Text variant="caption" color={Colors.midGrayText}>{card.name}</Text>
          {card.isReversed && (
            <View style={styles.reversedBadge}>
              <Text variant="caption" color={Colors.taroEssence}>역방향</Text>
            </View>
          )}
        </View>
      </View>

      {/* 구분선 */}
      <View style={styles.divider} />

      {/* 헤드라인 — 가장 큰 계층 */}
      <Text variant="subheading" style={styles.headline}>{card.headline}</Text>

      {/* 요약 — 두 번째 계층 */}
      <Text variant="body-sm" style={styles.summary}>{card.summary}</Text>

      {/* 상세 — 세 번째 계층, 약간 흐리게 */}
      <Text variant="body-sm" style={styles.detail}>{card.detail}</Text>

      {/* 카드 이야기 — 카드의 원형적 의미를 서사로 전달 */}
      {card.cardNarrative ? (
        <View style={styles.narrativeBlock}>
          <Text variant="caption" color={Colors.taroEssence} style={styles.narrativeLabel}>✦ 카드 이야기</Text>
          <Text variant="body-sm" style={styles.narrativeText}>{card.cardNarrative}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function ResultScreen() {
  const router = useRouter();
  const { result, reset } = useDrawStore();
  const { credits, isLoggedIn } = useUserStore();
  const { status: adStatus, errorMessage, load: loadAd, show: showAd, resetStatus } = useRewardedAd();
  const { onPositiveFeedback } = useStoreReview();
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    if (adStatus === "earned") {
      const t = setTimeout(resetStatus, 3000);
      return () => clearTimeout(t);
    }
  }, [adStatus, resetStatus]);

  if (!result) {
    router.replace("/(tabs)");
    return null;
  }

  const handleFeedback = async (rating: number) => {
    setFeedbackRating(rating);
    trackEvent("feedback_submit", { rating, drawId: result.id ?? "" });
    onPositiveFeedback(rating);
    if (!isLoggedIn || !result.id) return;
    try {
      const ratingMap = ["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const;
      await apiFetch("/api/tarot/feedback", {
        method: "POST",
        body: JSON.stringify({ drawId: result.id, rating: ratingMap[rating - 1] }),
      });
      setFeedbackSent(true);
    } catch {}
  };

  const handleReport = () => {
    trackEvent("report_submit", { drawId: result.id ?? "" });
    if (!isLoggedIn || !result.id) return;
    Alert.alert(
      "부적절한 해석 신고",
      "이 해석이 투자 조언을 포함하거나 부적절한 내용이 있나요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "신고하기",
          style: "destructive",
          onPress: async () => {
            try {
              await apiFetch("/api/tarot/report", {
                method: "POST",
                body: JSON.stringify({ drawId: result.id, reason: "부적절한 해석 콘텐츠" }),
              });
              Alert.alert("신고 완료", "검토 후 조치하겠습니다");
            } catch {
              Alert.alert("오류", "신고에 실패했습니다");
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (!result) return;
    setShareLoading(true);
    try {
      const firstCard = result.cards[0];
      const shared = await shareResult({
        headline: firstCard.headline,
        summary: firstCard.summary,
        ticker: result.tickerName || result.ticker,
      });
      trackEvent("share_result", { drawId: result.id ?? "", ticker: result.ticker });

      if (shared && isLoggedIn) {
        try {
          const res = await apiFetch<{ credits: number; rewarded: boolean; alreadyClaimed?: boolean }>(
            "/api/tarot/share-reward",
            {
              method: "POST",
              body: JSON.stringify({ idempotencyKey: `share-${result.id}-${new Date().toISOString().slice(0, 10)}` }),
            },
          );
          trackEvent("share_reward", { rewarded: String(res.rewarded), drawId: result.id ?? "" });
          if (res.rewarded) {
            useUserStore.getState().setCredits(res.credits);
            Alert.alert("공유 완료", "크레딧 1개 지급!");
          } else if (res.alreadyClaimed) {
            Alert.alert("공유 완료", "오늘 공유 보상은 이미 받았어요");
          }
        } catch {
          // 보상 API 실패해도 공유 자체는 성공
        }
      }
    } catch {
      // 사용자가 공유를 취소한 경우 등 — 무시
    } finally {
      setShareLoading(false);
    }
  };

  const handleDrawAgain = () => {
    reset();
    router.replace("/(tabs)/draw");
  };

  const handleWatchAd = () => {
    if (adStatus === "idle" || adStatus === "error") {
      loadAd();
    } else if (adStatus === "ready") {
      showAd();
    }
  };

  const rewardLabel =
    adStatus === "loading" ? "광고 로딩 중..." :
    adStatus === "ready" ? "광고 보고 +1 크레딧" :
    adStatus === "showing" ? "시청 중..." :
    adStatus === "earned" ? "크레딧 지급 완료!" :
    adStatus === "error" ? (errorMessage ?? "다시 시도") :
    "광고 보고 +1 크레딧";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text variant="body-sm" color={Colors.midGrayText}>← 뒤로</Text>
          </TouchableOpacity>
          {isLoggedIn && (
            <View style={styles.creditBadge}>
              <Text variant="caption" color={Colors.taroEssence}>✦ {credits}</Text>
            </View>
          )}
        </View>

        {/* 종목 + 날짜 */}
        <View style={styles.meta}>
          <Text variant="caption" color={Colors.taroEssence} style={styles.spreadLabel}>
            {result.spread === "single" ? "1장 스프레드" : "3장 스프레드"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <TickerLogo ticker={result.ticker} size={44} />
            <View>
              <Text variant="heading" style={styles.tickerTitle}>
                {result.tickerName}
              </Text>
              <Text variant="caption" color={Colors.ironOutline}>{result.ticker}</Text>
            </View>
          </View>
        </View>

        {/* 카드들 */}
        <View style={styles.cards}>
          {result.cards.map((card, i) => (
            <CardReveal key={card.id} card={card} index={i} />
          ))}
        </View>

        {/* 면책 고지 */}
        <View style={styles.disclaimer}>
          <Text variant="caption" color={Colors.ironOutline} style={styles.disclaimerText}>
            ⚠ {DISCLAIMER}
          </Text>
        </View>

        {/* 공유하기 */}
        <View style={styles.shareSection}>
          <Button
            variant="primary"
            label={shareLoading ? "공유 중..." : "공유하기"}
            loading={shareLoading}
            onPress={handleShare}
          />
          {isLoggedIn && (
            <Text variant="caption" color={Colors.ironOutline} style={styles.shareHint}>
              공유하면 크레딧 1개를 받을 수 있어요 (1일 1회)
            </Text>
          )}
        </View>

        {/* 피드백 + 신고 */}
        {isLoggedIn && (
          <View style={styles.feedbackSection}>
            <Text variant="body-sm" color={Colors.silverHighlight} style={styles.feedbackTitle}>
              {feedbackSent ? "감사합니다!" : "이 해석이 도움이 됐나요?"}
            </Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleFeedback(star)}
                  disabled={feedbackSent}
                  style={styles.starBtn}
                >
                  <Text style={[
                    styles.starText,
                    feedbackRating !== null && star <= feedbackRating && styles.starActive,
                  ]}>
                    {feedbackRating !== null && star <= feedbackRating ? "★" : "☆"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={handleReport} style={styles.reportBtn}>
              <Text variant="caption" color={Colors.ironOutline}>부적절한 해석 신고</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 리워드 광고 */}
        {isLoggedIn && (
          <View style={styles.rewardSection}>
            <Text variant="body-sm" color={Colors.silverHighlight} style={styles.rewardTitle}>
              크레딧이 부족하신가요?
            </Text>
            <Button
              variant="secondary"
              label={rewardLabel}
              disabled={adStatus === "loading" || adStatus === "showing" || adStatus === "earned"}
              onPress={handleWatchAd}
            />
          </View>
        )}

        {/* 액션 버튼 */}
        <View style={styles.actions}>
          <Button variant="primary" label="다시 뽑기" onPress={handleDrawAgain} />
          <Button
            variant="secondary"
            label="홈으로"
            onPress={() => { reset(); router.replace("/(tabs)"); }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.ebonyCanvas },
  scrollView:     { flex: 1 },
  scroll:         { paddingHorizontal: Spacing.s24, paddingBottom: 48 },
  header:         { paddingTop: Spacing.s16, marginBottom: Spacing.s16 },
  backBtn:        { alignSelf: "flex-start", padding: 4 },
  meta:           { marginBottom: Spacing.s32, gap: 4 },
  spreadLabel:    { letterSpacing: 1, marginBottom: 4 },
  tickerTitle:    { color: Colors.whiteout },
  cards:          { gap: 16, marginBottom: Spacing.s24 },
  cardReveal:     { backgroundColor: Colors.graphiteBase, borderRadius: Radius.cards, padding: Spacing.s24, borderWidth: 1, borderColor: Colors.carbonBorder, shadowColor: Colors.taroEssence, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  slotBadge:      { alignSelf: "flex-start", backgroundColor: Colors.voidGreen, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 12 },
  slotLabel:      { letterSpacing: 1.5, fontWeight: "700" },
  cardHeader:     { flexDirection: "row", gap: 16, marginBottom: 12 },
  cardThumb:      { width: 64, height: 92, backgroundColor: Colors.ebonyCanvas, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.taroEssence, alignItems: "center", justifyContent: "center", gap: 4 },
  cardThumbReversed: { borderColor: Colors.ironOutline, opacity: 0.85 },
  cardThumSymbol: { fontSize: 18, color: Colors.taroEssence, fontWeight: "700" },
  reversedMark:   { fontSize: 9, color: Colors.ironOutline },
  cardMeta:       { flex: 1, justifyContent: "center", gap: 4 },
  reversedBadge:  { marginTop: 4, alignSelf: "flex-start", borderWidth: 1, borderColor: Colors.ironOutline, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  divider:        { height: 1, backgroundColor: Colors.carbonBorder, marginVertical: 14 },
  headline:       { color: Colors.whiteout, marginBottom: 10, fontWeight: "700", lineHeight: 26 },
  summary:        { color: Colors.silverHighlight, marginBottom: Spacing.s8, lineHeight: 22 },
  detail:         { color: Colors.midGrayText, lineHeight: 22, opacity: 0.9 },
  narrativeBlock: { marginTop: Spacing.s16, backgroundColor: Colors.ebonyCanvas, borderRadius: 8, padding: Spacing.s16, borderWidth: 1, borderColor: Colors.deepInsight },
  narrativeLabel: { letterSpacing: 1.5, fontWeight: "700", marginBottom: 8 },
  narrativeText:  { color: Colors.silverHighlight, lineHeight: 20, fontStyle: "italic" },
  disclaimer:     { backgroundColor: Colors.steelSurface, borderRadius: 10, padding: Spacing.s16, marginBottom: Spacing.s24, borderWidth: 1, borderColor: Colors.carbonBorder },
  disclaimerText: { lineHeight: 18 },
  shareSection:   { marginBottom: Spacing.s24, gap: 8 },
  shareHint:      { textAlign: "center" },
  feedbackSection: { marginBottom: Spacing.s24, alignItems: "center", gap: 8 },
  feedbackTitle:  { textAlign: "center" },
  starRow:        { flexDirection: "row", gap: 8 },
  starBtn:        { padding: 4 },
  starText:       { fontSize: 28, color: Colors.ironOutline },
  starActive:     { color: Colors.taroEssence },
  reportBtn:      { marginTop: 4, padding: 4 },
  rewardSection:  { marginBottom: Spacing.s24, gap: 8 },
  rewardTitle:    { textAlign: "center", marginBottom: 4 },
  creditBadge:    { borderWidth: 1, borderColor: Colors.deepInsight, borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  actions:        { gap: 12 },
});
