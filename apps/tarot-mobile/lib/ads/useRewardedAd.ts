import { useCallback, useEffect, useRef, useState } from "react";
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from "react-native-google-mobile-ads";
import { AD_UNIT_REWARDED } from "./adIds";

type Status = "idle" | "loading" | "ready" | "showing" | "error";

export function useRewardedAd(onEarned: () => void) {
  const adRef = useRef<RewardedAd | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const load = useCallback(() => {
    setStatus("loading");
    const ad = RewardedAd.createForAdRequest(AD_UNIT_REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });

    const onLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setStatus("ready");
    });

    const onEarnedReward = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        onEarned();
      }
    );

    const onClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setStatus("idle");
      onLoaded();
      onEarnedReward();
      onClosed();
      adRef.current = null;
    });

    const onError = ad.addAdEventListener(AdEventType.ERROR, () => {
      setStatus("error");
    });

    adRef.current = ad;
    ad.load();
  }, [onEarned]);

  const show = useCallback(() => {
    if (!adRef.current || status !== "ready") return;
    setStatus("showing");
    adRef.current.show();
  }, [status]);

  useEffect(() => {
    return () => {
      adRef.current = null;
    };
  }, []);

  return { status, load, show };
}
