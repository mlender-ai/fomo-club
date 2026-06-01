import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../ui/Text";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { useAnnouncements, type Announcement } from "../../lib/announcementStore";

const TYPE_LABEL: Record<string, string> = {
  earnings:   "실적",
  filing:     "공시",
  dividend:   "배당",
  governance: "지배구조",
  other:      "기타",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

interface ItemRowProps {
  item: Announcement;
  isLast: boolean;
  selected: boolean;
  onSelect: () => void;
}

function AnnouncementRow({ item, isLast, selected, onSelect }: ItemRowProps) {
  const typeLabel = TYPE_LABEL[item.type] ?? "기타";

  return (
    <TouchableOpacity
      style={[
        styles.row,
        !isLast && styles.rowBorder,
        selected && styles.rowSelected,
      ]}
      onPress={onSelect}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          {/* 선택 상태: 왼쪽 강조 바 */}
          {selected && <View style={styles.selectedBar} />}
          <View style={[styles.typeBadge, selected && styles.typeBadgeSelected]}>
            <Text
              variant="caption"
              color={selected ? Colors.ebonyCanvas : Colors.taroEssence}
            >
              {typeLabel}
            </Text>
          </View>
          <Text variant="caption" color={Colors.ironOutline} style={styles.source}>
            {item.source}
          </Text>
        </View>
        <Text
          variant="body-sm"
          color={selected ? Colors.whiteout : Colors.silverHighlight}
          numberOfLines={selected ? undefined : 2}
          style={[styles.title, selected && styles.titleSelected]}
        >
          {item.title}
        </Text>
        <Text variant="caption" color={Colors.midGrayText}>
          {timeAgo(item.publishedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  symbol: string;
}

export function AnnouncementSection({ symbol }: Props) {
  const { items, loading } = useAnnouncements(symbol);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
          공시
        </Text>
        <View style={[styles.card, styles.loadingCard]}>
          <ActivityIndicator size="small" color={Colors.taroEssence} />
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
          공시
        </Text>
        <View style={[styles.card, styles.emptyCard]}>
          <Text variant="caption" color={Colors.midGrayText} style={styles.emptyText}>
            등록된 공시가 없습니다
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="caption" color={Colors.midGrayText} style={styles.sectionLabel}>
        공시
      </Text>
      <View style={styles.card}>
        {items.map((item, i) => (
          <AnnouncementRow
            key={item.id}
            item={item}
            isLast={i === items.length - 1}
            selected={selectedId === item.id}
            onSelect={() => setSelectedId((prev) => (prev === item.id ? null : item.id))}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.s24,
  },
  sectionLabel: {
    marginBottom: Spacing.s8,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.graphiteBase,
    borderRadius: Radius.cards,
    borderWidth: 1,
    borderColor: Colors.carbonBorder,
    overflow: "hidden",
  },
  loadingCard: {
    alignItems: "center",
    paddingVertical: Spacing.s32,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: Spacing.s24,
  },
  emptyText: {
    opacity: 0.6,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.graphiteBase,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.carbonBorder,
  },
  // 선택 상태: 배경 강조 (#268 Designer — 선택 항목 시각적 구분 강화)
  rowSelected: {
    backgroundColor: Colors.voidGreen,
    borderLeftWidth: 0, // selectedBar로 대체
  },
  rowContent: {
    gap: 6,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // 선택 시 왼쪽 강조 바로 선택 상태 명확하게 표시
  selectedBar: {
    position: "absolute",
    left: -16,
    top: -14,
    bottom: -14,
    width: 3,
    backgroundColor: Colors.taroEssence,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  typeBadge: {
    backgroundColor: Colors.voidGreen,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.deepInsight,
  },
  typeBadgeSelected: {
    backgroundColor: Colors.taroEssence,
    borderColor: Colors.taroEssence,
  },
  source: {
    fontSize: 11,
  },
  title: {
    lineHeight: 20,
  },
  titleSelected: {
    fontWeight: "600",
  },
});
