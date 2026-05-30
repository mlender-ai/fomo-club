import React from "react";
import { View, ScrollView } from "react-native";
import { DailyCard } from "../components/DailyCard";
import { RecommendedCards } from "../components/RecommendedCards";
import { TAROT_CARDS } from "../../packages/tarot-core";

// Filter active cards for recommendations
const recommendedCards = Object.values(TAROT_CARDS)
  .filter((card): card is typeof TAROT_CARDS[keyof typeof TAROT_CARDS] => card.isActive)
  .slice(0, 4)
  .map(card => ({
    id: card.id,
    name: card.name,
    nameKo: card.nameKo,
    imageUrl: card.imageUrl,
    keywordsKo: card.keywordsKo,
  }));

const HomePage: React.FC = () => {
  return (
    <ScrollView style={{ flex: 1 }}>
      <DailyCard />
      <View style={{ marginTop: 32 }}>
        <RecommendedCards cards={recommendedCards} />
      </View>
    </ScrollView>
  );
};

export default HomePage;
