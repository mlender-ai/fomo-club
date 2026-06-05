import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import {
  EMOTION_TYPES,
  EMOTION_LABELS,
  EMOTION_COLORS,
  scoreToFace,
  scoreToState,
  type EmotionType,
} from "@fomo/core";
import { FomoFace } from "../components/FomoFace";
import { FomoColors, Spacing, Radius } from "../constants/fomoTheme";

// Phase 1 셸: 백엔드 미연동. FOMO Index 실제값은 Phase 3에서 /api/fomo/index 연동.
// 정직한 숫자 원칙 — 가짜 수치를 진짜처럼 보이지 않게 "준비 중"으로 표기한다.
const MARKET_SCORE_PLACEHOLDER: number | null = null;

export default function Home() {
  // 두 단계 상태: 'market'(시장의 포모) → 'mine'(나의 포모). docs/MASCOT.md §5.
  const [mine, setMine] = useState<EmotionType | null>(null);
  const stage: "market" | "mine" = mine ? "mine" : "market";
  const marketFace =
    MARKET_SCORE_PLACEHOLDER == null ? "curious" : scoreToFace(MARKET_SCORE_PLACEHOLDER);

  // '나의 포모' 멘트가 떠오르듯 페이드+슬라이드인. docs/MASCOT.md "전환 = 애니메이션 + 멘트".
  const mentionFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(mentionFade, {
      toValue: stage === "mine" ? 1 : 0,
      duration: 420,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [stage, mentionFade]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>FOMO Club</Text>
          <Link href="/settings" style={styles.link}>설정</Link>
        </View>

        {/* 주인공: 포모 마스코트 (숫자는 보조) */}
        <Text style={styles.stageLabel}>
          {stage === "market" ? "오늘의 포모 — 시장의 분위기" : "나의 포모"}
        </Text>
        <FomoFace
          face={stage === "market" ? marketFace : "calm"}
          glow={stage === "mine" && mine ? EMOTION_COLORS[mine] : undefined}
        />

        {/* 보조: FOMO Index 숫자 (미연동 시 정직하게 "준비 중") */}
        <View style={styles.indexRow}>
          {MARKET_SCORE_PLACEHOLDER == null ? (
            <Text style={styles.muted}>FOMO INDEX · 집계 준비 중</Text>
          ) : (
            <Text style={styles.indexText}>
              FOMO INDEX {MARKET_SCORE_PLACEHOLDER} · {scoreToState(MARKET_SCORE_PLACEHOLDER)}
            </Text>
          )}
        </View>

        {/* 2단계 전환 멘트 — Phase 3에서 실제 멘트/애니메이션 */}
        {stage === "mine" && mine && (
          <Animated.Text
            style={[
              styles.mention,
              {
                opacity: mentionFade,
                transform: [
                  { translateY: mentionFade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                ],
              },
            ]}
          >
            다들 어떻든, 너의 「{EMOTION_LABELS[mine]}」도 괜찮아.
          </Animated.Text>
        )}

        {/* 오늘의 감정 투표 */}
        <View style={styles.voteBlock}>
          <Text style={styles.voteTitle}>오늘 당신의 감정은?</Text>
          <Text style={styles.voteHint}>하루 한 번 선택할 수 있어요</Text>

          <View style={styles.chips}>
            {EMOTION_TYPES.map((e) => {
              const selected = mine === e;
              return (
                <Pressable
                  key={e}
                  onPress={() => setMine(e)}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? EMOTION_COLORS[e] : FomoColors.hairline,
                      backgroundColor: selected ? EMOTION_COLORS[e] + "22" : FomoColors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: selected ? EMOTION_COLORS[e] : FomoColors.whiteout }}>
                    {EMOTION_LABELS[e]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mine && <Text style={styles.tally}>같은 감정을 선택한 사람: 집계 준비 중</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FomoColors.ink },
  content: { paddingHorizontal: Spacing.s24, paddingTop: Spacing.s16, paddingBottom: 64, alignItems: "center" },
  header: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.s32 },
  brand: { color: FomoColors.whiteout, fontSize: 18, fontWeight: "600" },
  link: { color: FomoColors.muted, fontSize: 14 },
  stageLabel: { color: FomoColors.muted, fontSize: 12, marginBottom: Spacing.s12 },
  indexRow: { alignItems: "center", marginTop: Spacing.s24 },
  muted: { color: FomoColors.muted, fontSize: 14 },
  indexText: { color: FomoColors.whiteout, fontSize: 16 },
  mention: { color: FomoColors.whiteout, textAlign: "center", fontSize: 14, marginTop: Spacing.s16, lineHeight: 20 },
  voteBlock: { width: "100%", marginTop: Spacing.s40 },
  voteTitle: { color: FomoColors.whiteout, fontSize: 16, fontWeight: "600", marginBottom: Spacing.s4 },
  voteHint: { color: FomoColors.muted, fontSize: 12, marginBottom: Spacing.s16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.s8 },
  chip: { paddingHorizontal: Spacing.s16, paddingVertical: Spacing.s12, borderRadius: Radius.md, borderWidth: 1 },
  tally: { color: FomoColors.muted, fontSize: 12, marginTop: Spacing.s16 },
});
