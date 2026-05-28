import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors } from "../../constants/theme";

export type TickerTab = "chart" | "info";

interface Props {
  activeTab: TickerTab;
  onTabChange: (tab: TickerTab) => void;
}

const TABS: { key: TickerTab; label: string }[] = [
  { key: "chart", label: "차트" },
  { key: "info", label: "종목정보" },
];

export function TabBar({ activeTab, onTabChange }: Props) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              variant="body-sm"
              color={isActive ? Colors.taroEssence : Colors.midGrayText}
              style={isActive ? styles.labelActive : styles.labelInactive}
            >
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.carbonBorder,
    backgroundColor: Colors.ebonyCanvas,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    gap: 4,
  },
  tabActive: {
    borderBottomColor: Colors.taroEssence,
    backgroundColor: Colors.voidGreen,
  },
  labelActive: {
    fontWeight: "700",
    fontSize: 14,
  },
  labelInactive: {
    fontWeight: "400",
    fontSize: 14,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.taroEssence,
    position: "absolute",
    bottom: 2,
  },
});
