import { useState, useRef } from "react";
import {
  View, TouchableOpacity, ScrollView, StyleSheet,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing } from "../../constants/theme";
import { useOnboardingStore } from "../../lib/onboardingStore";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    icon: "✦",
    title: "타로 증권에\n오신 것을 환영합니다",
    desc: "차트가 낯설어도 괜찮아요.\n시장의 흐름을 타로 카드의 직관적인 언어로 풀어냅니다.",
  },
  {
    icon: "◈",
    title: "종목을 선택하고\n카드를 뽑으세요",
    desc: "관심 종목을 검색한 후\n1장 또는 3장 스프레드로 카드를 뽑을 수 있습니다.",
  },
  {
    icon: "⊡",
    title: "AI가 시장과 카드를\n연결합니다",
    desc: "실시간 시장 데이터를 기반으로\nAI가 타로 해석을 생성합니다.",
  },
  {
    icon: "⚠",
    title: "투자 조언이\n아닙니다",
    desc: "본 서비스는 오락 목적으로 제공됩니다.\n모든 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.\n\n타로 해석을 실제 투자 결정에 활용하지 마세요.",
    isDisclaimer: true,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { agreeDisclaimer } = useOnboardingStore();
  const [page, setPage] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isLast = page === SLIDES.length - 1;
  const slide = SLIDES[page];

  const goNext = async () => {
    if (isLast) {
      if (!agreed) return;
      // AsyncStorage에 동의 저장 (서버 없어도 로컬 저장)
      await agreeDisclaimer("guest", "V1");
      router.replace("/login");
      return;
    }
    const next = page + 1;
    setPage(next);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  };

  const onScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setPage(idx);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 슬라이드 */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={styles.slide}>
            <Text style={[styles.slideIcon, s.isDisclaimer && styles.disclaimerIcon]}>
              {s.icon}
            </Text>
            <Text variant="heading-lg" style={styles.slideTitle}>{s.title}</Text>
            <Text variant="body-sm" style={styles.slideDesc}>{s.desc}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 페이지 인디케이터 */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      {/* 동의 체크박스 (마지막 슬라이드) */}
      {isLast && (
        <TouchableOpacity
          style={styles.agreeRow}
          onPress={() => setAgreed((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkMark}>✓</Text>}
          </View>
          <Text variant="body-sm" color={Colors.silverHighlight}>
            위 내용을 이해했으며, 투자 조언이 아님에 동의합니다
          </Text>
        </TouchableOpacity>
      )}

      {/* 버튼 */}
      <View style={styles.btnArea}>
        <Button
          variant="primary"
          label={isLast ? "시작하기" : "다음"}
          disabled={isLast && !agreed}
          onPress={goNext}
        />
        {!isLast && (
          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text variant="caption" color={Colors.ironOutline} style={styles.skip}>
              건너뛰기
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.ebonyCanvas },
  scroll:          { flex: 1 },
  slide:           { width, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.s32 },
  slideIcon:       { fontSize: 64, color: Colors.taroEssence, marginBottom: Spacing.s32 },
  disclaimerIcon:  { color: "#e5a020" },
  slideTitle:      { color: Colors.whiteout, textAlign: "center", marginBottom: Spacing.s16 },
  slideDesc:       { color: Colors.midGrayText, textAlign: "center", lineHeight: 22 },
  dots:            { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: Spacing.s24 },
  dot:             { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.carbonBorder },
  dotActive:       { width: 20, backgroundColor: Colors.taroEssence },
  agreeRow:        { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: Spacing.s24, marginBottom: Spacing.s16, gap: 12 },
  checkbox:        { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: Colors.carbonBorder, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxChecked: { backgroundColor: Colors.arcaneCta, borderColor: Colors.arcaneCta },
  checkMark:       { color: Colors.whiteout, fontSize: 13, fontWeight: "700" },
  btnArea:         { paddingHorizontal: Spacing.s24, paddingBottom: Spacing.s32, gap: 12 },
  skip:            { textAlign: "center" },
});
