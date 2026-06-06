import { useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { FomoColors, Radius, Spacing } from "../constants/fomoTheme";

/**
 * 감정 선택 칩. docs/IDENTITY_AND_MILESTONES.md love mark — 누를 때 톡 눌리는 촉감.
 *
 * 누르는 순간 살짝 작아졌다 돌아오는 스케일 반응(RN Animated, reanimated 금지)으로
 * "내가 골랐다"는 감각을 준다. 선택된 칩은 감정 색으로 채워 내 선택을 또렷이 보여준다.
 */
export function EmotionChip({
  label,
  color,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  color: string;
  selected: boolean;
  disabled?: boolean;
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

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled}
        onPressIn={() => press(0.93)}
        onPressOut={() => press(1)}
        onPress={onPress}
        style={[
          styles.chip,
          {
            borderColor: selected ? color : FomoColors.hairline,
            backgroundColor: selected ? color + "22" : FomoColors.surface,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <Text style={{ color: selected ? color : FomoColors.whiteout }}>{label}</Text>
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
