import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "ticker-logos.json");

interface TickerLogosConfig {
  overrides: Record<string, string>;
}

export function readTickerLogosConfig(): TickerLogosConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as TickerLogosConfig;
  } catch {
    return { overrides: {} };
  }
}

export function writeTickerLogosConfig(config: TickerLogosConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
