import React, { useState, useEffect } from "react";
import { Image, View, Text, StyleSheet } from "react-native";
import { getTickerLogoUrls, getTickerColor } from "../lib/tickerLogo";

interface Props {
  ticker: string;
  size?: number;
}

export function TickerLogo({ ticker, size = 32 }: Props) {
  const urls = getTickerLogoUrls(ticker, Math.max(size * 2, 128));
  const [urlIndex, setUrlIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const radius = size * 0.25;

  // ticker 변경 시 항상 첫 URL부터 재시도 + 로드 상태 초기화
  useEffect(() => {
    setUrlIndex(0);
    setLoaded(false);
  }, [ticker]);

  const currentUrl = urls[urlIndex] ?? null;

  // 모든 소스 실패 또는 URL 없음 → 컬러 이니셜 폴백
  if (!currentUrl) {
    return <Fallback ticker={ticker} size={size} radius={radius} />;
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* 이미지 로드 완료 전 폴백 항상 표시 (blank 상태 방지) */}
      {!loaded && <Fallback ticker={ticker} size={size} radius={radius} />}
      <Image
        source={{ uri: currentUrl }}
        style={[
          { width: size, height: size, borderRadius: radius },
          // 로드 전: invisible로 마운트해 onLoad/onError 이벤트 수신 대기
          !loaded && (StyleSheet.absoluteFill as object),
          !loaded && { opacity: 0 },
        ]}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setUrlIndex((prev) => prev + 1);
        }}
        resizeMode="contain"
      />
    </View>
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
