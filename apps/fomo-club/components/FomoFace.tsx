import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import type { FomoFace as FomoFaceType } from "@fomo/core";
import { FomoColors } from "../constants/fomoTheme";

/**
 * 마스코트 '포모' 플레이스홀더. docs/MASCOT.md.
 * 구체적 형태/픽셀 표정은 미확정(§10) — 검은 얼굴 + 흰 눈 2점 원칙만 반영한 임시 조형.
 * 5표정(face)별 눈 모양만 최소 변형. 감정 색은 glow prop으로 배경광 처리.
 *
 * 포모는 "살아있는 지표"(MASCOT.md) — RN Animated API로 표현한다(reanimated 금지):
 *  1. 상시 호흡(breathing): 미세 스케일 펄스로 멈춰있지 않게.
 *  2. 표정 전환 반응: face가 바뀌면 눈을 한 번 깜빡이고 얼굴이 톡 튄다(시장의 포모 → 나의 포모).
 *  3. 감정 글로우: glow가 들어오면 색 배경광이 부드럽게 차오른다.
 */
export function FomoFace({
  face,
  glow,
  size = 160,
}: {
  face: FomoFaceType;
  /** 감정/지수 포인트 색 (hex). 없으면 무채색. */
  glow?: string;
  size?: number;
}) {
  const eye = EYE_SHAPE[face];

  // 상시 호흡(0~1 진폭) + 표정 전환 시 톡 튀는 반응 펄스.
  const breathe = useRef(new Animated.Value(0)).current;
  const reactPulse = useRef(new Animated.Value(0)).current;
  // 표정 전환 깜빡임(1=뜸, 0=감음).
  const blink = useRef(new Animated.Value(1)).current;
  // 감정 글로우 차오름(0~1).
  const glowFade = useRef(new Animated.Value(glow ? 1 : 0)).current;

  // 상시 호흡 루프 — 마운트 시 1회 시작.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  // 표정이 바뀔 때마다 깜빡임 + 반응 펄스 — 포모가 "반응"하는 느낌.
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.1,
          duration: 90,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(reactPulse, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(reactPulse, {
          toValue: 0,
          friction: 4,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [face, blink, reactPulse]);

  // 감정 글로우 부드럽게 차오름/사라짐.
  useEffect(() => {
    const anim = Animated.timing(glowFade, {
      toValue: glow ? 1 : 0,
      duration: 480,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [glow, glowFade]);

  const headScale = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
    reactPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] }),
  );

  return (
    <Animated.View style={[styles.wrapper, { width: size, height: size }]}>
      {/* 감정 글로우: 색 배경광이 얼굴 뒤에서 차오른다. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowRing,
          {
            width: size * 1.18,
            height: size * 1.18,
            borderRadius: size,
            backgroundColor: glow ?? "transparent",
            opacity: glowFade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }),
            transform: [
              { scale: glowFade.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.head,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: glow ?? "transparent",
            shadowOpacity: glow ? 0.6 : 0,
            shadowRadius: glow ? 28 : 0,
            transform: [{ scale: headScale }],
          },
        ]}
      >
        <Animated.View style={[styles.eyes, { gap: size * 0.16 }]}>
          {[0, 1].map((i) => (
            <Animated.View
              key={i}
              style={{
                width: size * 0.12,
                height: size * 0.12 * eye.heightRatio,
                borderRadius: 999,
                backgroundColor: FomoColors.whiteout,
                opacity: eye.opacity,
                transform: [{ scaleY: blink }],
              }}
            />
          ))}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowRing: {
    position: "absolute",
  },
  head: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: FomoColors.ink,
    borderWidth: 1,
    borderColor: FomoColors.hairline,
    shadowOffset: { width: 0, height: 0 },
  },
  eyes: { flexDirection: "row" },
});

const EYE_SHAPE: Record<FomoFaceType, { heightRatio: number; opacity: number }> = {
  sleepy: { heightRatio: 0.3, opacity: 0.7 },
  calm: { heightRatio: 0.8, opacity: 0.9 },
  curious: { heightRatio: 1.0, opacity: 1 },
  excited: { heightRatio: 1.3, opacity: 1 },
  manic: { heightRatio: 1.5, opacity: 1 },
};
