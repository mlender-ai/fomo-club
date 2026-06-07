import { create } from "zustand";
import { setTickerLogoOverrides } from "./tickerLogo";

type LoadingState = "idle" | "loading" | "done" | "error";

interface TickerLogoState {
  loadingState: LoadingState;
  loadedLogos: Record<string, string>;
  _setLogos: (overrides: Record<string, string>) => void;
  _setLoadingState: (state: LoadingState) => void;
}

export const useTickerLogoStore = create<TickerLogoState>((set) => ({
  loadingState: "idle",
  loadedLogos: {},

  _setLogos: (overrides) => {
    setTickerLogoOverrides(overrides);
    set({ loadedLogos: overrides, loadingState: "done" });
  },
  _setLoadingState: (loadingState) => set({ loadingState }),
}));

// Granular selectors — components only re-render on the slice they subscribe to
export const selectLogoLoadingState = (s: TickerLogoState) => s.loadingState;
export const selectLoadedLogos = (s: TickerLogoState) => s.loadedLogos;
