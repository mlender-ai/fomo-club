import { create } from "zustand";
import { apiFetch } from "./api";

let AsyncStorage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch {}

const AGREED_KEY = "tarot_disclaimer_agreed";

interface OnboardingState {
  hasAgreed: boolean;
  currentVersion: string | null;
  latestVersion: string;
  needsUpdate: boolean;
  loading: boolean;
  showOnboarding: boolean;

  /** AsyncStorage에서 동의 상태를 로드 (스플래시에서 호출) */
  loadFromStorage: () => Promise<void>;
  checkDisclaimer: (userId: string) => Promise<void>;
  agreeDisclaimer: (userId: string, version: string) => Promise<void>;
  setShowOnboarding: (show: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  hasAgreed: false,
  currentVersion: null,
  latestVersion: "V1",
  needsUpdate: false,
  loading: true,
  showOnboarding: false,

  loadFromStorage: async () => {
    if (!AsyncStorage) {
      set({ loading: false });
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(AGREED_KEY);
      if (raw) {
        const { agreed, version } = JSON.parse(raw) as { agreed: boolean; version: string };
        set({ hasAgreed: agreed, currentVersion: version, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  checkDisclaimer: async (userId) => {
    set({ loading: true });
    try {
      const data = await apiFetch<{
        hasAgreed: boolean;
        version: string | null;
        latestVersion: string;
        needsUpdate: boolean;
      }>(`/api/tarot/disclaimer?userId=${userId}`);

      if (data.hasAgreed && AsyncStorage) {
        await AsyncStorage.setItem(
          AGREED_KEY,
          JSON.stringify({ agreed: true, version: data.version })
        );
      }

      set({
        hasAgreed: data.hasAgreed,
        currentVersion: data.version,
        latestVersion: data.latestVersion,
        needsUpdate: data.needsUpdate,
        showOnboarding: !data.hasAgreed || data.needsUpdate,
        loading: false,
      });
    } catch {
      set({ showOnboarding: true, loading: false });
    }
  },

  agreeDisclaimer: async (userId, version) => {
    try {
      await apiFetch("/api/tarot/disclaimer", {
        method: "POST",
        body: JSON.stringify({ userId, version }),
      });
      if (AsyncStorage) {
        await AsyncStorage.setItem(AGREED_KEY, JSON.stringify({ agreed: true, version }));
      }
      set({
        hasAgreed: true,
        currentVersion: version,
        needsUpdate: false,
        showOnboarding: false,
      });
    } catch {
      set({ showOnboarding: false });
    }
  },

  setShowOnboarding: (show) => set({ showOnboarding: show }),
}));

