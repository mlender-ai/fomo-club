import { useEffect, useRef, useState, useCallback } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { FomoColors, Radius, Spacing } from "../constants/fomoTheme";
import {
  fetchChallenge,
  acceptChallenge,
  type ChallengeResponse,
  type ChallengeStatus,
} from "../lib/api";

/**
 * 홈의 데일리 챌린지 섹션. docs/IDENTITY_AND_MILESTONES.md — 그날 밤 덜 외롭게.
 *
 * 미수락 → 진행 중 → 완료의 3단계를 담담하게 보여준다. 진입 시 GET으로 상태를 불러오고,
 * 수락 버튼을 누르면 POST로 상태를 갱신해 UI를 즉시 리프레시한다.
 *
 * 정직한 숫자: 챌린지 데이터를 못 받으면(미비/에러) 섹션을 그리지 않는다 — 가짜 수치/에러 노출 금지.
 */
export function DailyChallengeSection() {
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchChallenge()
      .then((c) => {
        if (alive) setChallenge(c);
      })
      .catch((e) => {
        // 데이터 미비/에러 — 안전 폴백(섹션 비표시). 디버깅용 경고만.
        console.warn("[challenge] fetch failed", e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 수락 — 한 번만. POST 결과로 상태/포인트를 갱신해 UI를 즉시 리프레시.
  const accept = useCallback(async () => {
    if (accepting || !challenge || challenge.status !== "unaccepted") return;
    setAccepting(true);
    try {
      const next = await acceptChallenge();
      setChallenge(next);
    } catch (e) {
      console.warn("[challenge] accept failed", e);
    } finally {
      setAccepting(false);
    }
  }, [accepting, challenge]);

  // 상태 전환마다 카드가 떠오르듯 페이드+슬라이드인 (RN Animated, reanimated 금지).
  const reveal = useRef(new Animated.Value(0)).current;
  const status: ChallengeStatus | "loading" = loading
    ? "loading"
    : (challenge?.status ?? "unaccepted");
  useEffect(() => {
    if (loading || !challenge) return;
    reveal.setValue(0);
    const anim = Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [status, loading, challenge, reveal]);

  // 폴백: 로딩 중이거나 데이터를 못 받으면 섹션 자체를 그리지 않는다.
  if (loading || !challenge) return null;

  const badge =
    challenge.status === "completed"
      ? "완료됨"
      : challenge.status === "in_progress"
        ? "진행 중"
        : "오늘의 챌린지";

  return (
    <Animated.View
      style={[
        styles.section,
        {
          opacity: reveal,
          transform: [
            { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.badge}>{badge}</Text>
        {/* 누적 포인트 — 정직한 집계값. */}
        <Text style={styles.points}>{challenge.totalPoints}P</Text>
      </View>

      <Text style={styles.title}>{challenge.title}</Text>
      {!!challenge.description && <Text style={styles.desc}>{challenge.description}</Text>}

      {challenge.status === "unaccepted" && (
        <Pressable
          disabled={accepting}
          onPress={accept}
          style={[styles.cta, accepting && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>
            {accepting ? "수락 중…" : `수락하고 +${challenge.points}P`}
          </Text>
        </Pressable>
      )}

      {challenge.status === "in_progress" && (
        <Text style={styles.progressHint}>수락했어요 · 완료하면 +{challenge.points}P</Text>
      )}

      {challenge.status === "completed" && (
        <Text style={styles.doneHint}>오늘 챌린지를 마쳤어요 · +{challenge.points}P 적립</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    marginTop: Spacing.s40,
    padding: Spacing.s16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: FomoColors.hairline,
    backgroundColor: FomoColors.surface,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.s12,
  },
  badge: { color: FomoColors.muted, fontSize: 12 },
  points: { color: FomoColors.whiteout, fontSize: 14, fontWeight: "600" },
  title: { color: FomoColors.whiteout, fontSize: 16, fontWeight: "600", marginBottom: Spacing.s4 },
  desc: { color: FomoColors.muted, fontSize: 13, lineHeight: 19, marginBottom: Spacing.s16 },
  cta: {
    marginTop: Spacing.s8,
    paddingVertical: Spacing.s12,
    borderRadius: Radius.md,
    backgroundColor: FomoColors.elevated,
    borderWidth: 1,
    borderColor: FomoColors.hairline,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: FomoColors.whiteout, fontSize: 14, fontWeight: "600" },
  progressHint: { color: FomoColors.muted, fontSize: 13, marginTop: Spacing.s8 },
  doneHint: { color: FomoColors.whiteout, fontSize: 13, marginTop: Spacing.s8, opacity: 0.85 },
});
