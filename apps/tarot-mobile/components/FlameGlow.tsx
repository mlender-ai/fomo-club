import { useEffect, useRef } from "react";
import { Animated, Easing, View, StyleSheet } from "react-native";
import { Colors } from "../constants/theme";

export function FlameGlow({ delay = 0 }: { delay?: number }) {
  const pulseScale = useRef(new Animated.Value(0.85)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const innerGlow = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const enterDelay = delay;

    Animated.timing(pulseOpacity, {
      toValue: 1,
      duration: 800,
      delay: enterDelay,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.08,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(innerGlow, {
            toValue: 0.6,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 0.85,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(innerGlow, {
            toValue: 0.3,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start();
  }, []);

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <Animated.View
        style={[
          styles.outerRing,
          { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
        ]}
      />
      <Animated.View
        style={[styles.innerCore, { opacity: innerGlow }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  outerRing: {
    position: "absolute",
    width: "110%",
    height: "110%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.taroEssence,
    shadowColor: Colors.luminousReveal,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
  },
  innerCore: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 14,
    backgroundColor: Colors.taroEssence,
  },
});
