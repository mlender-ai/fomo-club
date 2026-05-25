import React from "react";
import { View, Text, StyleSheet, Image, Animated } from "react-native";
import { TAROT_CARDS, getCardNarrative, TarotCardId, TarotCardOrientation } from "tarot-core";

interface Card {
  id: TarotCardId;
  orientation: TarotCardOrientation;
}

interface CardSpreadProps {
  spread: Card[];
}

const CardSpread: React.FC<CardSpreadProps> = ({ spread }) => {
  return (
    <View style={styles.container}>
      {spread.map((card, index) => {
        const cardMeta = TAROT_CARDS[card.id];
        const narrative = getCardNarrative(card.id, card.orientation);
        return (
          <View key={index} style={styles.cardContainer}>
            <Image
              source={{ uri: cardMeta.imageUrl }}
              style={[
                styles.cardImage,
                card.orientation === "reversed" && { transform: [{ rotate: "180deg" }] },
              ]}
            />
            <Text style={styles.cardName}>{cardMeta.nameKo}</Text>
            <Text style={styles.cardKeywords}>
              {cardMeta.keywordsKo.join(", ")}
            </Text>
            <Text style={styles.cardNarrative}>{narrative}</Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: 16,
    backgroundColor: "#121212",
  },
  cardContainer: {
    alignItems: "center",
    marginHorizontal: 8,
  },
  cardImage: {
    width: 100,
    height: 160,
    marginBottom: 8,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fafafa",
    marginBottom: 4,
  },
  cardKeywords: {
    fontSize: 14,
    color: "#898989",
    textAlign: "center",
    marginBottom: 8,
  },
  cardNarrative: {
    fontSize: 14,
    color: "#b4b4b4",
    textAlign: "center",
    fontStyle: "italic",
  },
});

export default CardSpread;
