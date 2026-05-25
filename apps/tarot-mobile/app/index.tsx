import React from 'react';
import { View, Text } from 'react-native';
import { observer } from 'mobx-react-lite';
import { drawStore } from '../lib/drawStore';
import { DailyCard } from '../components/DailyCard';
import { DrawnCard } from '../lib/drawStore';

const App = observer(() => {
  const handleCardSelect = (card: DrawnCard) => {
    drawStore.onCardSelect(card);
  };
  
  return (
    <View>
      <Text>Welcome to Trading Taro</Text>
      <DailyCard onSelect={handleCardSelect} />
    </View>
  );
});

export default App;
