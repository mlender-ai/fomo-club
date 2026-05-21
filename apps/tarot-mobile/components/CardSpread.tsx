import { useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, Animated, StyleSheet, Easing } from "react-native";
import { Text } from "./ui/Text";
import { Colors } from "../constants/theme";

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

  // --- original animation refs ---
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

  // --- new micro-interaction refs ---

  // shimmer sweep per card — setTimeout stagger keeps cards permanently out of phase
  const shimmerAnims = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(0))
  ).current;

  // press scale — springs on tap
  const pressScales = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(1))
  ).current;

  // glow pulse per card — starts looping when card is selected
  const glowPulseAnims = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(0))
  ).current;

  // instruction text crossfade
  const instructionOpacity = useRef(new Animated.Value(1)).current;
  const [displayedInstruction, setDisplayedInstruction] = useState(" ");

  // reveal scale overshoot
  const revealScales = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(1))
  ).current;

  // --- effects ---

  // entrance stagger
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

  // shimmer sweep — each card starts its loop with a staggered delay to stay out of phase
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    shimmerAnims.forEach((anim, i) => {
      const t = setTimeout(() => {
        Animated.loop(
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ).start();
      }, i * 300);
      timers.push(t);
    });
    return () => {
      timers.forEach(clearTimeout);
      shimmerAnims.forEach((anim) => anim.stopAnimation());
    };
  }, []);

  // crossfade instruction text when it changes
  const instructionText = (): string => {
    if (spreadPhase === "spreading") return " ";
    if (spreadPhase === "revealing") return "운명의 카드가 공개됩니다...";
    if (spreadType === "single") return "직관이 이끄는 카드를 선택하세요";
    const labels = ["첫 번째", "두 번째", "세 번째"] as const;
    return `${labels[selected.length] ?? "세 번째"} 카드를 선택하세요`;
  };

  const currentInstruction = instructionText();
  const prevInstruction = useRef(currentInstruction);

  useEffect(() => {
    if (currentInstruction === prevInstruction.current) return;
    prevInstruction.current = currentInstruction;

    Animated.timing(instructionOpacity, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      setDisplayedInstruction(currentInstruction);
      Animated.timing(instructionOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  }, [currentInstruction]);

  // initialize displayed instruction
  useEffect(() => {
    setDisplayedInstruction(currentInstruction);
  }, [spreadPhase]);

  // --- handlers ---

  const handleCardTap = (cardIdx: number) => {
    if (spreadPhase !== "picking") return;
    if (selected.includes(cardIdx)) return;

    const newSelected = [...selected, cardIdx];
    setSelected(newSelected);

    // spring lift
    Animated.spring(liftYs[cardIdx]!, {
      toValue: -28,
      tension: 150,
      friction: 8,
      useNativeDriver: true,
    }).start();

    // start glow pulse for selected card
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulseAnims[cardIdx]!, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulseAnims[cardIdx]!, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

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

  const handlePressIn = (cardIdx: number) => {
    if (spreadPhase !== "picking" || selected.includes(cardIdx)) return;
    Animated.spring(pressScales[cardIdx]!, {
      toValue: 0.91,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = (cardIdx: number) => {
    Animated.spring(pressScales[cardIdx]!, {
      toValue: 1,
      tension: 200,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const startReveal = (indices: number[]) => {
    let done = 0;
    indices.forEach((cardIdx, i) => {
      setTimeout(() => {
        // stop glow pulse
        glowPulseAnims[cardIdx]!.stopAnimation();
        glowPulseAnims[cardIdx]!.setValue(0);

        // flip: scaleX → 0, swap face, scaleX → 1 with overshoot
        Animated.timing(flipScales[cardIdx]!, {
          toValue: 0,
          duration: 210,
          useNativeDriver: true,
        }).start(() => {
          setRevealedSet((prev) => new Set([...prev, cardIdx]));
          Animated.spring(flipScales[cardIdx]!, {
            toValue: 1,
            tension: 180,
            friction: 7,
            useNativeDriver: true,
          }).start(() => {
            // subtle reveal scale pulse
            Animated.sequence([
              Animated.timing(revealScales[cardIdx]!, {
                toValue: 1.07,
                duration: 180,
                useNativeDriver: true,
              }),
              Animated.timing(revealScales[cardIdx]!, {
                toValue: 1,
                duration: 220,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
            ]).start(() => {
              done++;
              if (done === indices.length) {
                setTimeout(onComplete, 700);
              }
            });
          });
        });
      }, i * 320);
    });
  };

  return (
    <View style={styles.root}>
      <Animated.View style={{ opacity: instructionOpacity }}>
        <Text variant="body-sm" style={styles.instruction}>
          {displayedInstruction}
        </Text>
      </Animated.View>

      {spreadType === "three-card" && spreadPhase !== "spreading" && (
        <View style={styles.dotRow}>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                i < selected.length && styles.dotActive,
                i < selected.length && {
                  transform: [{ scale: 1.3 }],
                },
              ]}
            />
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

          // shimmer stripe position
          const shimmerX = shimmerAnims[i]!.interpolate({
            inputRange: [0, 1],
            outputRange: [-CARD_W * 1.5, CARD_W * 1.5],
          });

          // glow ring opacity
          const glowRingOpacity = glowPulseAnims[i]!.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.75],
          });

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
                    { scale: Animated.multiply(pressScales[i]!, revealScales[i]!) },
                  ],
                  zIndex: isSelected ? 20 : 10 - Math.abs(offset),
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => handleCardTap(i)}
                onPressIn={() => handlePressIn(i)}
                onPressOut={() => handlePressOut(i)}
                disabled={!tapEnabled}
                activeOpacity={1}
              >
                <Animated.View
                  style={[
                    styles.card,
                    isSelected && !isRevealed && styles.cardSelected,
                    isRevealed && styles.cardRevealed,
                    { transform: [{ scaleX: flipScales[i]! }] },
                  ]}
                >
                  {/* shimmer sweep overlay on card back */}
                  {!isRevealed && !isSelected && (
                    <Animated.View
                      style={[
                        styles.shimmerStripe,
                        { transform: [{ translateX: shimmerX }, { rotate: "25deg" }] },
                      ]}
                      pointerEvents="none"
                    />
                  )}

                  {/* glow ring for selected cards */}
                  {isSelected && !isRevealed && (
                    <Animated.View
                      style={[styles.glowRing, { opacity: glowRingOpacity }]}
                      pointerEvents="none"
                    />
                  )}

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
  shimmerStripe: {
    position: "absolute",
    width: 18,
    height: CARD_H * 1.5,
    backgroundColor: Colors.taroEssence,
    opacity: 0.09,
    top: -CARD_H * 0.25,
  },
  glowRing: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.taroEssence,
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
