import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { useDrawStore } from "../../lib/drawStore";

interface Props {
  symbol: string;
  shortName?: string;
}

/**
 * 뉴스 탭 하단에 배치되는 타로 카드 추천 섹션.
 * 최신 뉴스를 읽은 사용자가 자연스럽게 카드 뽑기로 이어지도록 유도한다 (#263).
 */
export function TarotCardRecommendation({ symbol, shortName }: Props) {
  const router = useRouter();
  const { setTicker } = useDrawStore();

  const handleDraw = () => {
    setTicker(symbol, shortName ?? symbol);
    router.push("/(tabs)/draw");
  };

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        뉴스 관련 타로 카드 추천
      </Text>
      <TouchableOpacity style={styles.card} onPress={handleDraw} activeOpacity={0.85}>
        <View style={styles.iconRow}>
          <Text style={styles.icon}>✦</Text>
        </View>
        <Text variant="subheading" color={Colors.whiteout} style={styles.title}>
          이 뉴스, 카드로 해석해볼까요?
        </Text>
        <Text variant="body-sm" color={Colors.midGrayText} style={styles.desc}>
          오늘의 뉴스 흐름을 바탕으로 AI가 {shortName ?? symbol}의 타로 카드 해석을 생성합니다.
          지금 이 종목을 들고 있는 당신의 마음을 카드로 확인해보세요.
        </Text>
        <View style={styles.ctaRow}>
          <View style={styles.ctaButton}>
            <Text variant="body-sm" color={Colors.ebonyCanvas} style={styles.ctaText}>
              카드 뽑기
            </Text>
          </View>
        </View>
        <Text variant="caption" color={Colors.ironOutline} style={styles.disclaimer}>
          투자 조언이 아닌 참고용 콘텐츠입니다.
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.s24,
  },
  sectionLabel: {
    marginBottom: Spacing.s8,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.voidGreen,
    borderRadius: Radius.cards,
    padding: Spacing.s24,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
    gap: 12,
  },
  iconRow: {
    alignSelf: "flex-start",
  },
  icon: {
    fontSize: 28,
    color: Colors.taroEssence,
  },
  title: {
    fontWeight: "700",
    lineHeight: 26,
  },
  desc: {
    lineHeight: 20,
  },
  ctaRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  ctaButton: {
    backgroundColor: Colors.taroEssence,
    borderRadius: Radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  ctaText: {
    fontWeight: "700",
  },
  disclaimer: {
    fontSize: 10,
    opacity: 0.6,
    marginTop: 4,
  },
});
