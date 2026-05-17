import { useEffect } from "react";
import { SafeAreaView, ScrollView, View, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Colors, Spacing } from "../../constants/theme";
import { useHistoryStore } from "../../lib/historyStore";

// 목업 상세 데이터
const MOCK_DETAIL: Record<string, any> = {
  "1": { id: "1", ticker: "AAPL", market: "US", spread: "SINGLE", headline: "새로운 시작의 기운이 감지됩니다", summary: "시장은 새로운 사이클의 초입에 있습니다. 혁신을 향한 과감한 첫 걸음이 필요합니다.", detail: "광대 카드는 순수한 가능성과 새로운 출발을 상징합니다. Apple은 현재 다음 혁신의 문턱에 서 있으며, 이 시점에서의 접근은 높은 불확실성을 수반하지만 동시에 큰 기회를 내포합니다.", source: "LLM", creditCost: 1, createdAt: new Date(Date.now() - 3600000).toISOString(), feedbacks: [], cards: [{ cardId: "fool", orientation: "upright", slot: null, position: 0, card: { number: 0, name: "The Fool", nameKo: "광대", meaningUpright: "새로운 시작, 순수한 가능성, 모험", meaningReversed: "무모함, 준비 부족, 경솔함", keywordsKo: ["시작", "가능성", "모험"], keywords: ["beginning", "potential", "adventure"] } }] },
  "2": { id: "2", ticker: "NVDA", market: "US", spread: "THREE_CARD", headline: "급격한 변화와 재편의 시기입니다", summary: "AI 혁명의 중심에서 극적인 변화가 예고됩니다. 기존 질서의 붕괴 이후 새로운 균형점을 찾는 과정.", detail: "역방향 탑은 파국을 피한 변화를 암시합니다. NVDA의 급격한 상승 이후 조정 국면이 예상되나 그 폭은 제한적일 것입니다. AI 섹터의 장기적 성장 스토리는 여전히 유효합니다.", source: "LLM", creditCost: 3, createdAt: new Date(Date.now() - 86400000).toISOString(), feedbacks: [], cards: [{ cardId: "tower", orientation: "reversed", slot: "past", position: 0, card: { number: 16, name: "The Tower", nameKo: "탑", meaningUpright: "급격한 변화, 파국, 붕괴", meaningReversed: "피할 수 있는 재앙, 제한적 변화", keywordsKo: ["변화", "충격", "재편"], keywords: ["change", "shock", "disruption"] } }, { cardId: "star", orientation: "upright", slot: "present", position: 1, card: { number: 17, name: "The Star", nameKo: "별", meaningUpright: "희망, 회복, 영감", meaningReversed: "실망, 비현실적 기대", keywordsKo: ["희망", "회복", "영감"], keywords: ["hope", "recovery", "inspiration"] } }, { cardId: "world", orientation: "upright", slot: "future", position: 2, card: { number: 21, name: "The World", nameKo: "세계", meaningUpright: "완성, 통합, 성취", meaningReversed: "미완성, 지연", keywordsKo: ["완성", "성취", "통합"], keywords: ["completion", "achievement", "integration"] } }] },
};

function slotLabel(slot: string | null) {
  if (slot === "past") return "과거";
  if (slot === "present") return "현재";
  if (slot === "future") return "미래";
  return "";
}

function ratingToStars(rating: string) {
  return { FIVE: "★★★★★", FOUR: "★★★★☆", THREE: "★★★☆☆", TWO: "★★☆☆☆", ONE: "★☆☆☆☆" }[rating] ?? rating;
}

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { detail, detailLoading, fetchDetail } = useHistoryStore();

  const data = MOCK_DETAIL[id as string] ?? detail;

  useEffect(() => {
    if (id && !MOCK_DETAIL[id as string]) fetchDetail(id as string);
  }, [id]);

  if ((detailLoading && !data)) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.taroEssence} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text variant="body-sm" color={Colors.midGrayText}>기록을 찾을 수 없습니다</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text variant="body-sm" color={Colors.taroEssence}>← 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text variant="body-sm" color={Colors.midGrayText}>← 기록</Text>
          </TouchableOpacity>
          <Text variant="caption" color={Colors.ironOutline}>
            {new Date(data.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>

        {/* 종목 + 스프레드 */}
        <View style={styles.tickerRow}>
          <Text variant="heading-lg" color={Colors.whiteout}>{data.ticker}</Text>
          <View style={styles.badges}>
            <View style={styles.badge}><Text variant="caption" color={Colors.midGrayText}>{data.market}</Text></View>
            <View style={[styles.badge, styles.badgeGreen]}>
              <Text variant="caption" color={Colors.taroEssence}>{data.spread === "SINGLE" ? "1장" : "3장"}</Text>
            </View>
          </View>
        </View>

        {/* 헤드라인 */}
        <View style={styles.headlineBox}>
          <Text style={styles.headlineSymbol}>✦</Text>
          <Text variant="subheading" style={styles.headline}>{data.headline}</Text>
        </View>

        {/* 카드들 */}
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>뽑힌 카드</Text>
        {data.cards.map((dc: any) => (
          <View key={dc.cardId + dc.position} style={styles.cardItem}>
            <View style={styles.cardTop}>
              <View style={styles.cardNumBox}>
                <Text style={styles.cardNum}>{dc.card.number}</Text>
              </View>
              <View style={styles.cardInfo}>
                {dc.slot && <Text variant="caption" color={Colors.taroEssence}>{slotLabel(dc.slot)}</Text>}
                <Text variant="subheading" color={Colors.whiteout}>{dc.card.nameKo}</Text>
                <Text variant="caption" color={Colors.midGrayText}>{dc.card.name}</Text>
                <Text variant="caption" color={dc.orientation === "upright" ? Colors.taroEssence : "#e0875a"}>
                  {dc.orientation === "upright" ? "↑ 정방향" : "↓ 역방향"}
                </Text>
              </View>
            </View>
            <Text variant="body-sm" style={styles.meaning}>
              {dc.orientation === "upright" ? dc.card.meaningUpright : dc.card.meaningReversed}
            </Text>
            <View style={styles.keywords}>
              {dc.card.keywordsKo.slice(0, 3).map((kw: string) => (
                <View key={kw} style={styles.kwChip}><Text variant="caption" color={Colors.midGrayText}>{kw}</Text></View>
              ))}
            </View>
          </View>
        ))}

        {/* 해석 */}
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>요약</Text>
        <Text variant="body-sm" style={styles.interpretText}>{data.summary}</Text>
        <Text variant="caption" color={Colors.midGrayText} style={[styles.sectionLabel, { marginTop: Spacing.s16 }]}>상세 해석</Text>
        <Text variant="body-sm" style={styles.interpretText}>{data.detail}</Text>

        {/* 면책 고지 */}
        <View style={styles.disclaimer}>
          <Text variant="caption" color={Colors.ironOutline}>⚠ 투자 조언이 아닙니다. 모든 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.</Text>
        </View>

        {/* 메타 */}
        <View style={styles.meta}>
          <View style={styles.metaRow}>
            <Text variant="caption" color={Colors.midGrayText}>소스</Text>
            <Text variant="caption" color={Colors.silverHighlight}>{data.source === "LLM" ? "AI 실시간" : data.source === "CACHE" ? "캐시" : "폴백"}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text variant="caption" color={Colors.midGrayText}>비용</Text>
            <Text variant="caption" color={Colors.silverHighlight}>{data.creditCost} 크레딧</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.ebonyCanvas },
  scroll:       { paddingHorizontal: Spacing.s24, paddingBottom: 48 },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: Spacing.s16, marginBottom: Spacing.s16 },
  tickerRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.s16 },
  badges:       { flexDirection: "row", gap: 6 },
  badge:        { borderWidth: 1, borderColor: Colors.carbonBorder, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeGreen:   { borderColor: Colors.deepInsight },
  headlineBox:  { backgroundColor: Colors.graphiteBase, borderRadius: 14, padding: Spacing.s24, borderWidth: 1, borderColor: Colors.carbonBorder, alignItems: "center", marginBottom: Spacing.s24 },
  headlineSymbol: { fontSize: 20, color: Colors.taroEssence, marginBottom: 8 },
  headline:     { color: Colors.whiteout, textAlign: "center" },
  sectionLabel: { letterSpacing: 0.5, marginBottom: Spacing.s8 },
  cardItem:     { backgroundColor: Colors.graphiteBase, borderRadius: 12, padding: Spacing.s16, borderWidth: 1, borderColor: Colors.carbonBorder, marginBottom: 10 },
  cardTop:      { flexDirection: "row", gap: 12, marginBottom: 10 },
  cardNumBox:   { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.voidGreen, alignItems: "center", justifyContent: "center" },
  cardNum:      { fontSize: 13, color: Colors.taroEssence, fontWeight: "700" },
  cardInfo:     { flex: 1, gap: 2 },
  meaning:      { color: Colors.silverHighlight, lineHeight: 20, marginBottom: 8 },
  keywords:     { flexDirection: "row", gap: 6 },
  kwChip:       { borderWidth: 1, borderColor: Colors.carbonBorder, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 },
  interpretText:{ color: Colors.silverHighlight, lineHeight: 22, marginBottom: 8 },
  disclaimer:   { backgroundColor: Colors.steelSurface, borderRadius: 10, padding: Spacing.s16, marginTop: Spacing.s16, marginBottom: Spacing.s16, borderWidth: 1, borderColor: Colors.carbonBorder },
  meta:         { gap: 8, marginBottom: 8 },
  metaRow:      { flexDirection: "row", justifyContent: "space-between" },
});
