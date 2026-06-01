import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../ui/Text";
import { Colors } from "../../constants/theme";

export type TickerTab = "chart" | "info" | "disclosure";

interface Props {
  activeTab: TickerTab;
  onTabChange: (tab: TickerTab) => void;
}

const TABS: { key: TickerTab; label: string }[] = [
  { key: "chart", label: "차트" },
  { key: "info", label: "종목정보" },
  { key: "disclosure", label: "공시" },
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
  // 선택 상태: 배경색 + 테두리로 비선택 탭과 명확히 구분 (#268 Designer)
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
    opacity: 0.65,
  },
  indicator: {
    height: 3,
    width: "60%",
    marginTop: 6,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  indicatorActive: {
    backgroundColor: Colors.taroEssence,
    // 그림자로 선택 인디케이터 시인성 강화
    shadowColor: Colors.taroEssence,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 2,
  },
});
