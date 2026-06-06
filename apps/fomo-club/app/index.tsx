import { useEffect, useRef, useState, useCallback } from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import {
  EMOTION_TYPES,
  EMOTION_LABELS,
  EMOTION_COLORS,
  scoreToFace,
  scoreToState,
  marketLine,
  mineLine,
  type EmotionType,
  type FomoFace as FomoFaceType,
} from "@fomo/core";
import { FomoFace } from "../components/FomoFace";
import { TallyBar } from "../components/TallyBar";
import { EmotionChip } from "../components/EmotionChip";
import { FomoColors, Spacing } from "../constants/fomoTheme";
import {
  fetchIndex,
  fetchToday,
  postVote,
  type FomoIndexResponse,
  type TallyResponse,
} from "../lib/api";

export default function Home() {
  // 두 단계 상태: 'market'(시장의 포모) → 'mine'(나의 포모). docs/MASCOT.md §5.
  const [index, setIndex] = useState<FomoIndexResponse | null>(null);
  const [tally, setTally] = useState<TallyResponse | null>(null);
  const [mine, setMine] = useState<EmotionType | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  const stage: "market" | "mine" = mine ? "mine" : "market";
  const marketFace: FomoFaceType = index ? scoreToFace(index.score) : "curious";
  const state = index ? scoreToState(index.score) : null;
  // 포모의 담담한 한마디: 선택 전=시장의 포모, 선택 후=나의 포모. @fomo/core.
  const line = mine ? mineLine(mine) : state ? marketLine(state) : "";
  // 시장 glow: 달아오르면 따뜻하게, 차분하면 옅게/없음.
  const marketGlow = index
    ? index.score >= 61
      ? EMOTION_COLORS.fomo
      : index.score >= 41
        ? "#5A5A5A"
        : undefined
    : undefined;

  useEffect(() => {
    Promise.allSettled([fetchIndex(), fetchToday()]).then(([i, t]) => {
      if (i.status === "fulfilled") setIndex(i.value);
      if (t.status === "fulfilled") setTally(t.value);
      setLoading(false);
    });
  }, []);

  const vote = useCallback(async (e: EmotionType) => {
    setVoting(true);
    setMine(e);
    try {
      const res = await postVote(e);
      setTally(res);
    } catch {
      // 낙관적 — 선택 유지, 집계는 다음 로드에 반영
    } finally {
      setVoting(false);
    }
  }, []);

  // 멘트가 떠오르듯 페이드+슬라이드인 — 시장/나의 포모 전환마다 재생. docs/MASCOT.md.
  const mentionFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    mentionFade.setValue(0);
    const anim = Animated.timing(mentionFade, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [stage, mine, mentionFade]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>FOMO Club</Text>
          <Link href="/settings" style={styles.link}>설정</Link>
        </View>

        {/* 주인공: 포모 마스코트 (숫자는 보조) */}
        <Text style={styles.stageLabel}>
          {stage === "market" ? "오늘의 포모" : "나의 포모"}
        </Text>
        <FomoFace
          face={stage === "market" ? marketFace : "calm"}
          glow={stage === "mine" && mine ? EMOTION_COLORS[mine] : marketGlow}
        />

        {/* 보조: FOMO Index 숫자 */}
        <View style={styles.indexRow}>
          {loading ? (
            <ActivityIndicator color={FomoColors.muted} />
          ) : index ? (
            <>
              <Text style={styles.indexText}>{index.score}</Text>
              <Text style={styles.muted}>FOMO INDEX · {index.state}</Text>
            </>
          ) : (
            <Text style={styles.muted}>FOMO INDEX · 집계 준비 중</Text>
          )}
        </View>

        {/* 포모의 담담한 한마디 — 전환마다 떠오름 (시장의 포모 ↔ 나의 포모) */}
        {!!line && (
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
            {line}
          </Animated.Text>
        )}

        {/* 오늘의 감정 투표 */}
        <View style={styles.voteBlock}>
          <Text style={styles.voteTitle}>오늘 당신의 감정은?</Text>
          <Text style={styles.voteHint}>하루 한 번 선택할 수 있어요</Text>

          <View style={styles.chips}>
            {EMOTION_TYPES.map((e) => (
              <EmotionChip
                key={e}
                label={EMOTION_LABELS[e]}
                color={EMOTION_COLORS[e]}
                selected={mine === e}
                disabled={voting}
                onPress={() => vote(e)}
              />
            ))}
          </View>

          {/* 집계 결과 — 정직한 숫자 */}
          {tally && (
            <View style={styles.tallyBlock}>
              <Text style={styles.tally}>오늘 {tally.total}명이 감정을 선택했어요</Text>
              {EMOTION_TYPES.map((e) => (
                <TallyBar
                  key={e}
                  label={EMOTION_LABELS[e]}
                  color={EMOTION_COLORS[e]}
                  pct={tally.ratios[e] ?? 0}
                  mine={mine === e}
                />
              ))}
            </View>
          )}
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
  indexRow: { alignItems: "center", marginTop: Spacing.s24, minHeight: 28 },
  indexText: { color: FomoColors.whiteout, fontSize: 24, fontWeight: "600" },
  muted: { color: FomoColors.muted, fontSize: 12, marginTop: 4 },
  summary: { color: FomoColors.whiteout, fontSize: 14, textAlign: "center", marginTop: Spacing.s8, maxWidth: 300 },
  mention: { color: FomoColors.whiteout, textAlign: "center", fontSize: 14, marginTop: Spacing.s16, lineHeight: 20 },
  voteBlock: { width: "100%", marginTop: Spacing.s40 },
  voteTitle: { color: FomoColors.whiteout, fontSize: 16, fontWeight: "600", marginBottom: Spacing.s4 },
  voteHint: { color: FomoColors.muted, fontSize: 12, marginBottom: Spacing.s16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.s8 },
  tallyBlock: { marginTop: Spacing.s24 },
  tally: { color: FomoColors.muted, fontSize: 12, marginBottom: Spacing.s12 },
});
