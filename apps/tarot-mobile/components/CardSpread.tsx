import { useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, Animated, StyleSheet, Easing, Vibration } from "react-native";
import { Text } from "./ui/Text";
import { Colors } from "../constants/theme";

// 파티클 4방향: 상/하/좌/우 대각
const BURST_DIRS = [
  { dx: 0,    dy: -1  },
  { dx: 0,    dy:  1  },
  { dx: -1,   dy:  0  },
  { dx:  1,   dy:  0  },
  { dx: -0.7, dy: -0.7 },
  { dx:  0.7, dy: -0.7 },
  { dx: -0.7, dy:  0.7 },
  { dx:  0.7, dy:  0.7 },
] as const;
const BURST_DIST = 32;

/**
 * GlowBurst — 카드 탭 시 방사형 파티클 + 링 확장 효과.
 * `trigger`가 true로 바뀌면 한 번 실행한다.
 */
function GlowBurst({ trigger }: { readonly trigger: boolean }) {
  const ringScale = useRef(new Animated.Value(0.2)).current;
  const ringOpacity = useRef(new Animated.Value(0.9)).current;
  const particleAnims = useRef(
    BURST_DIRS.map(() => ({
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (!trigger) return;
    // 링 확장
    Animated.parallel([
      Animated.timing(ringScale,   { toValue: 2.4, duration: 480, useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0,   duration: 480, useNativeDriver: true }),
    ]).start(() => {
      ringScale.setValue(0.2);
      ringOpacity.setValue(0.9);
    });
    // 파티클 방사
    particleAnims.forEach((anim, i) => {
      const dir = BURST_DIRS[i]!;
      anim.tx.setValue(0);
      anim.ty.setValue(0);
      anim.opacity.setValue(1);
      Animated.parallel([
        Animated.timing(anim.tx,      { toValue: dir.dx * BURST_DIST, duration: 420, useNativeDriver: true }),
        Animated.timing(anim.ty,      { toValue: dir.dy * BURST_DIST, duration: 420, useNativeDriver: true }),
        Animated.timing(anim.opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]).start();
    });
  }, [trigger]);

  return (
    <View style={burstStyles.container} pointerEvents="none">
      {/* 확장 링 */}
      <Animated.View
        style={[
          burstStyles.ring,
          { opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
      {/* 파티클 8개 */}
      {particleAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            burstStyles.particle,
            {
              opacity: anim.opacity,
              transform: [{ translateX: anim.tx }, { translateY: anim.ty }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const burstStyles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    // 카드 크기와 동일하게 맞춤 (CARD_W/H는 아래 선언 후 참조 불가 — 하드코드)
    width: 58,
    height: 90,
  },
  ring: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: Colors.taroEssence,
  },
  particle: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.luminousReveal,
  },
});

const CARD_COUNT = 7;
const CARD_W = 58;
const CARD_H = 90;
const SPREAD_X = 42;
const FAN_ANGLE = 7;
const ARC_Y = 6;
const BACK_SYMBOLS = ["✦", "◈", "⬡", "◇", "✸", "⟐", "✦"] as const;

interface CardSpreadProps {
  spreadType: "single" | "three-card";
  onComplete: () => void;
}

type SpreadPhase = "spreading" | "picking" | "revealing";

export function CardSpread({ spreadType, onComplete }: CardSpreadProps) {
  const needed = spreadType === "single" ? 1 : 3;
  const [spreadPhase, setSpreadPhase] = useState<SpreadPhase>("spreading");
  const [selected, setSelected] = useState<number[]>([]);
  const [revealedSet, setRevealedSet] = useState<ReadonlySet<number>>(new Set());
  // 카드별 burst trigger — toggle마다 GlowBurst가 다시 실행된다
  const [burstTriggers, setBurstTriggers] = useState<boolean[]>(
    Array.from({ length: CARD_COUNT }, () => false)
  );

  const enterYs = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(200))
  ).current;

  const enterOpacities = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(0))
  ).current;

  const liftYs = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(0))
  ).current;

  const dimOpacities = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(1))
  ).current;

  const flipScales = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(1))
  ).current;

  const txValues = useRef(
    Array.from({ length: CARD_COUNT }, (_, i) => {
      const offset = i - Math.floor(CARD_COUNT / 2);
      return new Animated.Value(offset * SPREAD_X);
    })
  ).current;

  const arcOffsets = useRef(
    Array.from({ length: CARD_COUNT }, (_, i) => {
      const offset = i - Math.floor(CARD_COUNT / 2);
      return new Animated.Value(Math.abs(offset) * ARC_Y);
    })
  ).current;

  const totalTranslateYs = useRef(
    Array.from({ length: CARD_COUNT }, (_, i) =>
      Animated.add(Animated.add(enterYs[i]!, arcOffsets[i]!), liftYs[i]!)
    )
  ).current;

  const combinedOpacities = useRef(
    Array.from({ length: CARD_COUNT }, (_, i) =>
      Animated.multiply(enterOpacities[i]!, dimOpacities[i]!)
    )
  ).current;

  useEffect(() => {
    const animations = Array.from({ length: CARD_COUNT }, (_, i) =>
      Animated.parallel([
        Animated.timing(enterYs[i]!, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.timing(enterOpacities[i]!, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ])
    );
    Animated.stagger(70, animations).start(() => setSpreadPhase("picking"));
  }, []);

  const handleCardTap = (cardIdx: number) => {
    if (spreadPhase !== "picking") return;
    if (selected.includes(cardIdx)) return;

    // 빛 피드백: 진동(짧게) + 파티클 burst
    Vibration.vibrate(40);
    setBurstTriggers(prev => {
      const next = [...prev];
      next[cardIdx] = !next[cardIdx]!;
      return next;
    });

    const newSelected = [...selected, cardIdx];
    setSelected(newSelected);

    Animated.spring(liftYs[cardIdx]!, {
      toValue: -28,
      tension: 150,
      friction: 8,
      useNativeDriver: true,
    }).start();

    dimOpacities.forEach((anim, i) => {
      if (!newSelected.includes(i)) {
        Animated.timing(anim, {
          toValue: 0.38,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    });

    if (newSelected.length >= needed) {
      setSpreadPhase("revealing");
      setTimeout(() => startReveal(newSelected), 300);
    }
  };

  const startReveal = (indices: number[]) => {
    let done = 0;
    indices.forEach((cardIdx, i) => {
      setTimeout(() => {
        Animated.timing(flipScales[cardIdx]!, {
          toValue: 0,
          duration: 210,
          useNativeDriver: true,
        }).start(() => {
          setRevealedSet(prev => new Set([...prev, cardIdx]));
          Animated.timing(flipScales[cardIdx]!, {
            toValue: 1,
            duration: 210,
            useNativeDriver: true,
          }).start(() => {
            done++;
            if (done === indices.length) {
              setTimeout(onComplete, 700);
            }
          });
        });
      }, i * 320);
    });
  };

  const instructionText = (): string => {
    if (spreadPhase === "spreading") return " ";
    if (spreadPhase === "revealing") return "운명의 카드가 공개됩니다...";
    if (spreadType === "single") return "직관이 이끄는 카드를 선택하세요";
    const labels = ["첫 번째", "두 번째", "세 번째"] as const;
    return `${labels[selected.length] ?? "세 번째"} 카드를 선택하세요`;
  };

  return (
    <View style={styles.root}>
      <Text variant="body-sm" style={styles.instruction}>
        {instructionText()}
      </Text>

      {spreadType === "three-card" && spreadPhase !== "spreading" && (
        <View style={styles.dotRow}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.dot, i < selected.length && styles.dotActive]} />
          ))}
        </View>
      )}

      <View style={styles.fan}>
        {Array.from({ length: CARD_COUNT }, (_, i) => {
          const offset = i - Math.floor(CARD_COUNT / 2);
          const angle = `${offset * FAN_ANGLE}deg`;
          const isSelected = selected.includes(i);
          const isRevealed = revealedSet.has(i);
          const tapEnabled = spreadPhase === "picking" && !isSelected;

          return (
            <Animated.View
              key={i}
              style={[
                styles.cardWrapper,
                {
                  opacity: combinedOpacities[i],
                  transform: [
                    { translateX: txValues[i]! },
                    { translateY: totalTranslateYs[i]! },
                    { rotate: angle },
                  ],
                  zIndex: isSelected ? 20 : 10 - Math.abs(offset),
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => handleCardTap(i)}
                disabled={!tapEnabled}
                activeOpacity={0.85}
              >
                <Animated.View
                  style={[
                    styles.card,
                    isSelected && !isRevealed && styles.cardSelected,
                    isRevealed && styles.cardRevealed,
                    { transform: [{ scaleX: flipScales[i]! }] },
                  ]}
                >
                  {isRevealed ? (
                    <View style={styles.frontFace}>
                      <Text style={styles.frontSymbol}>✦</Text>
                      <View style={styles.frontShine} />
                    </View>
                  ) : (
                    <View style={styles.backFace}>
                      <Text style={styles.backSymbol}>{BACK_SYMBOLS[i % BACK_SYMBOLS.length]}</Text>
                      <View style={styles.backDecTop} />
                      <View style={styles.backDecBot} />
                    </View>
                  )}
                </Animated.View>
              </TouchableOpacity>
              {/* 카드 선택 시 빛 burst */}
              <GlowBurst trigger={burstTriggers[i]!} />
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 32,
  },
  instruction: {
    color: Colors.silverHighlight,
    textAlign: "center",
    marginBottom: 12,
    minHeight: 22,
    letterSpacing: 0.3,
  },
  dotRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.ironOutline,
  },
  dotActive: {
    backgroundColor: Colors.taroEssence,
  },
  fan: {
    width: "100%",
    height: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrapper: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: Colors.graphiteBase,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.carbonBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardSelected: {
    borderColor: Colors.taroEssence,
    shadowColor: Colors.taroEssence,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 10,
  },
  cardRevealed: {
    backgroundColor: Colors.voidGreen,
    borderColor: Colors.taroEssence,
    borderWidth: 2,
  },
  backFace: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  backSymbol: {
    fontSize: 20,
    color: Colors.taroEssence,
    opacity: 0.65,
  },
  backDecTop: {
    position: "absolute",
    top: 7,
    left: 7,
    right: 7,
    height: 1,
    backgroundColor: Colors.carbonBorder,
  },
  backDecBot: {
    position: "absolute",
    bottom: 7,
    left: 7,
    right: 7,
    height: 1,
    backgroundColor: Colors.carbonBorder,
  },
  frontFace: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  frontSymbol: {
    fontSize: 24,
    color: Colors.taroEssence,
  },
  frontShine: {
    position: "absolute",
    top: -20,
    left: -20,
    width: 40,
    height: 80,
    backgroundColor: Colors.taroEssence,
    opacity: 0.06,
    transform: [{ rotate: "30deg" }],
  },
});
