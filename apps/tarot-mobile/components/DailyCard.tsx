import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { DrawnCard } from '../lib/drawStore';

interface DailyCardProps {
  onSelect: (card: DrawnCard) => void;
}

export const DailyCard: React.FC<DailyCardProps> = ({ onSelect }) => {
  const mockCard: DrawnCard = {
    card: {
      id: 'the-fool',
      name: 'The Fool',
      orientation: 'upright',
    },
    orientation: 'upright',
  };

  const handlePress = () => {
    onSelect(mockCard);
  };

  return (
    <TouchableOpacity onPress={handlePress}>
      <View>
        <Text>The Fool (Daily Card)</Text>
      </View>
    </TouchableOpacity>
  );
};
