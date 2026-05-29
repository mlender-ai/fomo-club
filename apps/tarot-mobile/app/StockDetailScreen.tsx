import React from "react";
import { ScrollView, View, Text, ActivityIndicator } from "react-native";
import { useRoute } from "@react-navigation/native";
import { TarotInvestmentInsight } from "../components/TarotInvestmentInsight";
import { Colors, Typography } from "../constants/theme";
import { useTarotInsight } from "../hooks/useTarotInsight";

const StockDetailScreen: React.FC = () => {
  const route = useRoute();
  const { stockId, cardId, orientation, marketCondition } = route.params as {
    stockId: string;
    cardId: string;
    orientation: string;
    marketCondition: string;
  };

  const { insight, loading } = useTarotInsight(stockId, cardId, orientation, marketCondition);

  return (
    <ScrollView style={styles.container}>
      {/* 기타 섹션들 */}
      <View style={styles.section}>
        <Text style={styles.heading}>종목 뉴스</Text>
        {/* 기존 뉴스 UI */}
        <View style={styles.newsContainer}>
          <Text style={styles.newsItem}>여기에 뉴스 항목이 들어갑니다.</Text>
        </View>
        {/* 타로 인사이트 */}
        {loading ? (
          <ActivityIndicator size="large" color={Colors.accent} />
        ) : insight ? (
          <TarotInvestmentInsight title={insight.title} content={insight.content} />
        ) : (
          <Text style={styles.errorText}>타로 인사이트를 불러오지 못했습니다.</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  heading: {
    fontSize: Typography.size.heading,
    color: Colors.text,
    fontWeight: "bold",
    marginBottom: 12,
  },
  newsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  newsItem: {
    fontSize: Typography.size.body,
    color: Colors.text,
    lineHeight: Typography.lineHeight.body * Typography.size.body,
  },
  errorText: {
    color: Colors.muted,
    fontSize: Typography.size.bodySm,
    textAlign: "center",
  },
});

export default StockDetailScreen;
