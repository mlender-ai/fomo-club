import React, { useState } from "react";
import { Image, View, Text, StyleSheet } from "react-native";
import { getTickerLogoUrls, getTickerColor } from "../lib/tickerLogo";

interface Props {
  ticker: string;
  size?: number;
}

export function TickerLogo({ ticker, size = 32 }: Props) {
  const urls = getTickerLogoUrls(ticker, size * 2); // 2x for retina
  const [urlIndex, setUrlIndex] = useState(0);
  const radius = size * 0.25;

  const currentUrl = urls[urlIndex] ?? null;

  if (!currentUrl) {
    return <Fallback ticker={ticker} size={size} radius={radius} />;
  }

  return (
    <Image
      source={{ uri: currentUrl }}
      style={{ width: size, height: size, borderRadius: radius }}
      onError={() => {
        if (urlIndex + 1 < urls.length) {
          setUrlIndex((i) => i + 1);
        } else {
          setUrlIndex(urls.length); // triggers fallback on next render
        }
      }}
      resizeMode="contain"
    />
  );
}

function Fallback({ ticker, size, radius }: { ticker: string; size: number; radius: number }) {
  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: getTickerColor(ticker),
        },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.38 }]}>
        {ticker.replace(/\.\w+$/, "").slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    color: "#ffffff",
    fontWeight: "700",
    letterSpacing: -0.5,
  },
});
