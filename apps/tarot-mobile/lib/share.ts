import { Share, Platform } from "react-native";

export async function shareResult(params: {
  headline: string;
  summary: string;
  ticker: string;
}): Promise<boolean> {
  const text = `🔮 타로 증권 - ${params.ticker}\n\n${params.headline}\n\n${params.summary}\n\n타로 증권 앱에서 나만의 운세를 확인하세요!`;

  const result = await Share.share({
    message: text,
    ...(Platform.OS === "ios" && { title: `🔮 ${params.ticker} 타로 결과` }),
  });

  return result.action === Share.sharedAction;
}
