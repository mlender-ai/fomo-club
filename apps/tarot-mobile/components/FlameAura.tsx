/**
 * FlameAura — 결과 화면 상단의 신비한 불꽃 오러 애니메이션.
 * 3개의 pulse 원이 순차적으로 확장·소멸하며 타로 의식 분위기를 조성한다.
 * react-native Animated만 사용 (Expo Go 호환).
 */
import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { Colors } from "../constants/theme";

const RING_COUNT = 3;
// 각 링의 시작 지연(ms) — 순차 파동 효과
const RING_DELAYS = [0, 500, 1000] as const;
const RING_CYCLE = 2400; // 한 주기

function PulseRing({ delay }: { readonly delay: number }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(scale, {
            toValue: 1.8,
            duration: RING_CYCLE,
            useNativeDriver: true,
          }),
          Animated.timing(scale, { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(opacity, {
            toValue: 0,
            duration: RING_CYCLE,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, { toValue: 0.7, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity, scale]);

  return (
    <Animated.View
      style={[
        styles.ring,
        { opacity, transform: [{ scale }] },
      ]}
    />
  );
}

// 중앙 상단 불꽃 심볼 (글로우 pulse)
function CoreFlame() {
  const glow = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <Animated.Text style={[styles.coreSymbol, { opacity: glow }]}>
      🔥
    </Animated.Text>
  );
}

export function FlameAura() {
  return (
    <View style={styles.container}>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <PulseRing key={i} delay={RING_DELAYS[i]!} />
      ))}
      <CoreFlame />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    height: 90,
    marginBottom: 8,
  },
  ring: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: Colors.taroEssence,
  },
  coreSymbol: {
    fontSize: 32,
    // 이모지 자체가 불꽃이므로 tint 없이 pulse opacity만
  },
});
