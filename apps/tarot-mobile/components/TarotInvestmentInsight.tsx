import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Typography } from "../constants/theme";

interface TarotInvestmentInsightProps {
  title: string;
  content: string;
}

export const TarotInvestmentInsight: React.FC<TarotInvestmentInsightProps> = ({ title, content }) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.content}>{content}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 8,
    marginVertical: 12,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.subheading,
    fontWeight: "bold",
    marginBottom: 8,
  },
  content: {
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body * Typography.size.body,
  },
});
