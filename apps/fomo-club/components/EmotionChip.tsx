import { useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { FomoColors, Radius, Spacing } from "../constants/fomoTheme";

/**
 * 감정 선택 칩. docs/IDENTITY_AND_MILESTONES.md love mark — 누를 때 톡 눌리는 촉감.
 *
 * 누르는 순간 살짝 작아졌다 돌아오는 스케일 반응(RN Animated, reanimated 금지)으로
 * "내가 골랐다"는 감각을 준다. 선택된 칩은 감정 색으로 채워 내 선택을 또렷이 보여준다.
 *
 * 투표를 마치면(locked) 칩은 입력을 받지 않는다. 내가 고른 칩은 ✓로 "남겼다"는 확인을
 * 주고, 고르지 않은 칩은 옅게 물러나 오늘의 선택이 끝났음을 담담하게 보여준다.
 */
export function EmotionChip({
  label,
  color,
  selected,
  disabled,
  locked,
  onPress,
}: {
  label: string;
  color: string;
  selected: boolean;
  /** 진행 중(투표 요청 등) 일시 비활성. */
  disabled?: boolean;
  /** 오늘 투표를 이미 마쳐 더 누를 수 없는 상태. */
  locked?: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = (to: number) => {
    Animated.timing(scale, {
      toValue: to,
      duration: 110,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // 잠긴 뒤 고르지 않은 칩은 뒤로 물러나고, 진행 중에는 살짝 흐려진다.
  const opacity = locked ? (selected ? 1 : 0.32) : disabled ? 0.6 : 1;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled || locked}
        onPressIn={() => press(0.93)}
        onPressOut={() => press(1)}
        onPress={onPress}
        style={[
          styles.chip,
          {
            borderColor: selected ? color : FomoColors.hairline,
            backgroundColor: selected ? color + "22" : FomoColors.surface,
            opacity,
          },
        ]}
      >
        <Text style={{ color: selected ? color : FomoColors.whiteout }}>
          {selected && locked ? `${label} ✓` : label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.s16,
    paddingVertical: Spacing.s12,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
});
