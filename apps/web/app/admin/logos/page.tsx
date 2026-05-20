import { readTickerLogosConfig } from "@/lib/tarot/tickerLogosConfig";
import { LogosClient } from "./LogosClient";

export const dynamic = "force-dynamic";

// 앱과 동일한 도메인 맵 (타입 안전하게 JSON-only로 유지)
const TICKER_DOMAIN_MAP: Record<string, string> = {
  AAPL: "apple.com", NVDA: "nvidia.com", TSLA: "tesla.com", MSFT: "microsoft.com",
  GOOGL: "google.com", GOOG: "google.com", AMZN: "amazon.com", META: "meta.com",
  NFLX: "netflix.com", BRKB: "berkshirehathaway.com", "BRK.B": "berkshirehathaway.com",
  JPM: "jpmorganchase.com", V: "visa.com", MA: "mastercard.com",
  UNH: "unitedhealthgroup.com", JNJ: "jnj.com", WMT: "walmart.com",
  AVGO: "broadcom.com", HD: "homedepot.com", PG: "pg.com", ORCL: "oracle.com",
  AMD: "amd.com", INTC: "intel.com", QCOM: "qualcomm.com", TXN: "ti.com",
  CRM: "salesforce.com", ADBE: "adobe.com", NOW: "servicenow.com",
  PYPL: "paypal.com", UBER: "uber.com", SPOT: "spotify.com",
  COIN: "coinbase.com", HOOD: "robinhood.com", PLTR: "palantir.com",
  SOFI: "sofi.com", RBLX: "roblox.com", SNAP: "snap.com", LYFT: "lyft.com",
  ABNB: "airbnb.com", RIVN: "rivian.com", LCID: "lucidmotors.com",
  NIO: "nio.com", BABA: "alibaba.com", JD: "jd.com", PDD: "pinduoduo.com",
  BIDU: "baidu.com",
  "005930.KS": "samsung.com", "000660.KS": "skhynix.com",
  "035420.KS": "navercorp.com", "035720.KS": "kakao.com",
  "051910.KS": "lgchem.com", "006400.KS": "samsungsdi.com",
  "207940.KS": "samsungbiologics.com", "066570.KS": "lg.com",
  "003550.KS": "lgcorp.com", "012330.KS": "mobis.co.kr",
  "005380.KS": "hyundai.com", "000270.KS": "kia.com",
  "028260.KS": "samsungsds.com", "034730.KS": "sk.com",
  "017670.KS": "sktelecom.com", "030200.KS": "kt.com",
  "032830.KS": "samsunglife.com", "086790.KS": "hanabank.com",
  "105560.KS": "kbfg.com", "035760.KQ": "cjenm.com",
};

export default async function LogosPage() {
  const config = readTickerLogosConfig();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>티커 로고 관리</h1>
        <p className="admin-page-desc">
          종목별 로고 URL 오버라이드. 기본값은 Clearbit → Google Favicons 자동 해석.
        </p>
      </header>

      <LogosClient
        initialOverrides={config.overrides}
        domainMap={TICKER_DOMAIN_MAP}
      />
    </div>
  );
}
