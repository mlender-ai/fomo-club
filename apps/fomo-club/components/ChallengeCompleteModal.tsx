import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { EMOTION_COLORS } from "@fomo/core";
import { FomoFace } from "./FomoFace";
import { FomoColors, Spacing, Radius } from "../constants/fomoTheme";

/**
 * 챌린지 완료 결과. 챌린지 API + 포인트 API 응답을 부모가 합쳐 내려준다.
 * 정직한 숫자 원칙: 여기 들어오는 값은 실제 적립 결과만 — 모달은 표시만 한다.
 */
export interface ChallengeCompleteResult {
  /** 이번 챌린지로 적립된 포인트. */
  pointsEarned: number;
  /** 적립 후 누적 포인트(변화된 총량). */
  totalPoints: number;
  /** 완료한 챌린지 이름(선택). */
  missionTitle?: string;
}

/** 다음 미션 정보(선택) — 없으면 '다음 미션 확인' 버튼을 숨긴다. */
export interface NextMission {
  label: string;
}

/**
 * 챌린지 완료 화면. docs/MASCOT.md / docs/IDENTITY_AND_MILESTONES.md.
 * 포모가 한 번 통통 튀며(celebrate) 사용자의 완료를 함께 기뻐한다.
 *
 * 세 상태를 props로 구분(부모가 챌린지/포인트 API 호출 결과를 내려줌):
 *  - loading: 포인트 적립 중 → 스피너
 *  - error:   적립 실패 → 재시도 (가짜 수치 표기 ❌)
 *  - result:  적립 완료 → 변화된 포인트 + 축하 멘트 + 다음 행동 버튼
 */
export function ChallengeCompleteModal({
  visible,
  loading = false,
  error = null,
  result = null,
  nextMission = null,
  onNextMission,
  onHome,
  onRetry,
  onClose,
}: {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  result?: ChallengeCompleteResult | null;
  nextMission?: NextMission | null;
  onNextMission?: () => void;
  onHome: () => void;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  const done = !loading && !error && !!result;

  // 카드가 아래에서 떠오르며 등장 — 결과를 "받아드는" 만족감(love mark).
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      rise.setValue(0);
      return;
    }
    const anim = Animated.timing(rise, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, rise]);

  // 포인트 숫자도 한 박자 늦게 떠오른다 — 적립이 "공개되듯".
  const pointFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!done) {
      pointFade.setValue(0);
      return;
    }
    const anim = Animated.timing(pointFade, {
      toValue: 1,
      duration: 480,
      delay: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [done, pointFade]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose ?? onHome}
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: rise,
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            },
          ]}
        >
          {/* 포모 — 완료 순간 통통 튀며 함께 기뻐한다. */}
          <FomoFace
            face={done ? "excited" : "calm"}
            glow={done ? EMOTION_COLORS.conviction : undefined}
            celebrate={done}
            size={140}
          />

          {loading && (
            <View style={styles.statusBlock}>
              <ActivityIndicator color={FomoColors.muted} />
              <Text style={styles.muted}>포인트를 적립하고 있어요…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.statusBlock}>
              <Text style={styles.title}>적립을 마무리하지 못했어요</Text>
              <Text style={styles.muted}>잠시 후 다시 시도해 주세요.</Text>
            </View>
          )}

          {done && result && (
            <View style={styles.statusBlock}>
              <Text style={styles.title}>
                {result.missionTitle
                  ? `'${result.missionTitle}' 완료!`
                  : "오늘의 챌린지 완료!"}
              </Text>
              {/* 담담한 축하 — 과장 없이, 함께 기뻐하는 한마디. */}
              <Text style={styles.celebrate}>끝까지 와줬구나. 잘했어.</Text>

              {/* 포인트 적립 결과 — 정직한 숫자만. */}
              <Animated.View style={[styles.pointBlock, { opacity: pointFade }]}>
                <Text style={styles.pointEarned}>+{result.pointsEarned} P</Text>
                <Text style={styles.muted}>
                  지금까지 모은 포인트 {result.totalPoints.toLocaleString()} P
                </Text>
              </Animated.View>
            </View>
          )}

          {/* 액션 버튼 */}
          <View style={styles.actions}>
            {!loading && error && onRetry && (
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={onRetry}
                accessibilityRole="button"
              >
                <Text style={styles.btnPrimaryText}>다시 시도</Text>
              </Pressable>
            )}

            {done && nextMission && onNextMission && (
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={onNextMission}
                accessibilityRole="button"
              >
                <Text style={styles.btnPrimaryText} numberOfLines={1}>
                  다음 미션 확인 · {nextMission.label}
                </Text>
              </Pressable>
            )}

            {!loading && (
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={onHome}
                accessibilityRole="button"
              >
                <Text style={styles.btnGhostText}>홈으로 돌아가기</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.s24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: FomoColors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: FomoColors.hairline,
    paddingVertical: Spacing.s32,
    paddingHorizontal: Spacing.s24,
    alignItems: "center",
  },
  statusBlock: { alignItems: "center", marginTop: Spacing.s24 },
  title: { color: FomoColors.whiteout, fontSize: 18, fontWeight: "600", textAlign: "center" },
  celebrate: {
    color: FomoColors.whiteout,
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.s8,
    opacity: 0.85,
    lineHeight: 20,
  },
  muted: { color: FomoColors.muted, fontSize: 12, marginTop: Spacing.s8, textAlign: "center" },
  pointBlock: { alignItems: "center", marginTop: Spacing.s24 },
  pointEarned: {
    color: EMOTION_COLORS.conviction,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  actions: { width: "100%", marginTop: Spacing.s32, gap: Spacing.s12 },
  btn: {
    width: "100%",
    paddingVertical: Spacing.s16,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: FomoColors.whiteout },
  btnPrimaryText: { color: FomoColors.ink, fontSize: 15, fontWeight: "600" },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: FomoColors.hairline },
  btnGhostText: { color: FomoColors.muted, fontSize: 15, fontWeight: "500" },
});
