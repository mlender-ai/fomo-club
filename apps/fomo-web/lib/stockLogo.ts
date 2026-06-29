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

export function stockLogoApiSrc(input: {
  naverCode?: string | undefined;
  name?: string | undefined;
}): string | undefined {
  const code = normalizeKrStockCode(input.naverCode);
  if (!code) return undefined;
  const params = new URLSearchParams({ code });
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
  return stockLogoApiSrc({ naverCode: code, name: input.name });
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
