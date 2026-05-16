import { View, StyleSheet } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { AD_UNIT_BANNER } from "../lib/ads/adIds";
import { Colors } from "../constants/colors";

interface Props {
  size?: BannerAdSize;
}

export function AdBanner({ size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER }: Props) {
  return (
    <View style={styles.container}>
      <BannerAd unitId={AD_UNIT_BANNER} size={size} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", backgroundColor: Colors.bg },
});
