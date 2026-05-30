import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Colors, Typography } from "../constants/theme";

interface RecommendedCardProps {
  id: string;
  name: string;
  nameKo: string;
  imageUrl: string;
  keywordsKo: string[];
}

const RecommendedCard: React.FC<RecommendedCardProps> = ({
  name,
  nameKo,
  imageUrl,
  keywordsKo,
}) => {
  return (
    <View style={styles.card}>
      <Image source={{ uri: imageUrl }} style={styles.image} />
      <View style={styles.textContainer}>
        <Text style={styles.cardName}>{nameKo} ({name})</Text>
        <Text style={styles.keywords}>{keywordsKo.join(", ")}</Text>
      </View>
    </View>
  );
};

export const RecommendedCards: React.FC<{ cards: RecommendedCardProps[] }> = ({ cards }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>추천 타로 카드</Text>
      <View style={styles.cardsList}>
        {cards.map((card) => (
          <RecommendedCard key={card.id} {...card} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.subheading,
    fontWeight: "bold",
    marginBottom: 12,
  },
  cardsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: Colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 120,
    resizeMode: "cover",
  },
  textContainer: {
    padding: 8,
  },
  cardName: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: "bold",
    marginBottom: 4,
  },
  keywords: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
  },
});
