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
            style={styles.tab}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <View style={[styles.labelWrapper, isActive && styles.labelWrapperActive]}>
              <Text
                variant="body-sm"
                color={isActive ? Colors.taroEssence : Colors.midGrayText}
                style={isActive ? styles.labelActive : styles.labelInactive}
              >
                {tab.label}
              </Text>
            </View>
            <View style={[styles.indicator, isActive && styles.indicatorActive]} />
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
    paddingTop: 10,
  },
  labelWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  labelWrapperActive: {
    backgroundColor: Colors.voidGreen,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
  },
  labelActive: {
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  labelInactive: {
    fontWeight: "400",
    fontSize: 14,
  },
  indicator: {
    height: 2,
    width: "50%",
    marginTop: 6,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  indicatorActive: {
    backgroundColor: Colors.luminousReveal,
    shadowColor: Colors.taroEssence,
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});
