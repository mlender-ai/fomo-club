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
