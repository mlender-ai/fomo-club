const KR_STOCK_CODE_RE = /^\d{6}$/;

const FALLBACK_COLORS = [
  "#12355B",
  "#0E5E6F",
  "#344E41",
  "#5C2751",
  "#5F0F40",
  "#1B4332",
  "#2D3142",
  "#3D348B",
];

export function isKrStockCode(value: string | undefined | null): value is string {
  return typeof value === "string" && KR_STOCK_CODE_RE.test(value);
}

export function normalizeKrStockCode(value: string | undefined | null): string | undefined {
  const code = value?.trim();
  return isKrStockCode(code) ? code : undefined;
}

export function krStockLogoUrl(code: string): string {
  return `https://ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock${code}.svg`;
}

/**
 * US·해외 티커 로고 후보(프록시 서버에서만 사용). 하나가 404 여도 다음으로 넘어간다.
 * 클라이언트가 직접 때리지 않는 이유: 핫링크 차단·CORS·429 로 로고 자리가 비어 보인다.
 */
export function usStockLogoUrls(symbol: string): { url: string; source: string }[] {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];
  return [
    { url: `https://assets.parqet.com/logos/symbol/${encodeURIComponent(sym)}`, source: "parqet" },
    { url: `https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`, source: "fmp" },
  ];
}

export function stockLogoApiSrc(input: {
  naverCode?: string | undefined;
  symbol?: string | undefined;
  name?: string | undefined;
}): string | undefined {
  const code = normalizeKrStockCode(input.naverCode);
  const symbol = code ? undefined : input.symbol?.trim().toUpperCase();
  // KR 코드도 US 티커도 아니면 로고를 만들 수 없다(이니셜 폴백은 호출부가 그린다).
  if (!code && !(symbol && /^[A-Z][A-Z.-]{0,5}$/.test(symbol))) return undefined;
  const params = new URLSearchParams(code ? { code } : { symbol: symbol! });
  const name = input.name?.trim();
  if (name) params.set("name", name.slice(0, 24));
  return `/api/stock-logo?${params.toString()}`;
}

export function stockLogoApiSrcForStock(input: {
  naverCode?: string | undefined;
  symbol?: string | undefined;
  name?: string | undefined;
}): string | undefined {
  const code = normalizeKrStockCode(input.naverCode) ?? normalizeKrStockCode(input.symbol);
  if (code) return stockLogoApiSrc({ naverCode: code, name: input.name });
  // 국내 코드가 아니면 US·해외 티커로 프록시(전 종목 로고를 채운다).
  return stockLogoApiSrc({ symbol: input.symbol, name: input.name });
}

export function stockLogoInitial(name: string | undefined | null): string {
  return name?.trim().slice(0, 1) || "·";
}

export function stockLogoFallbackColor(key: string | undefined | null): string {
  const text = key?.trim() || "fomo";
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? "#12355B";
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stockLogoFallbackSvg(input: { name?: string; code?: string }): string {
  const initial = escapeSvgText(stockLogoInitial(input.name ?? input.code));
  const color = stockLogoFallbackColor(input.code ?? input.name);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${initial}">`,
    `<circle cx="32" cy="32" r="31" fill="#fff"/>`,
    `<circle cx="32" cy="32" r="25" fill="${color}"/>`,
    `<text x="32" y="39" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="23" font-weight="800" fill="#D8FF3A">${initial}</text>`,
    `</svg>`,
  ].join("");
}
