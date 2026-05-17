/**
 * 로컬 뽑기 엔진 — 백엔드 없이 Expo Go 단독 동작
 * 타로 카드 22장 메타데이터 + 폴백 해석 + AsyncStorage 기록 저장
 */
import type { DrawResult, DrawnCard, SpreadType } from "./drawStore";

// ─── 카드 22장 ────────────────────────────────────────────────────────────────

interface CardMeta {
  id: string;
  name: string;
  nameKo: string;
  number: number;
  symbol: string;
  meaningUpright: string;
  meaningReversed: string;
}

const CARDS: CardMeta[] = [
  { id: "the-fool",           name: "The Fool",           nameKo: "바보",        number: 0,  symbol: "0",  meaningUpright: "새로운 시작, 무한한 가능성",     meaningReversed: "무모함, 준비 부족" },
  { id: "the-magician",       name: "The Magician",       nameKo: "마법사",      number: 1,  symbol: "I",  meaningUpright: "의지력, 기술, 현실화",          meaningReversed: "재능 낭비, 조종" },
  { id: "the-high-priestess", name: "The High Priestess", nameKo: "여교황",      number: 2,  symbol: "II", meaningUpright: "직관, 신비, 숨겨진 정보",       meaningReversed: "정보 은폐, 판단 흐림" },
  { id: "the-empress",        name: "The Empress",        nameKo: "여황제",      number: 3,  symbol: "III",meaningUpright: "풍요, 성장, 번영",             meaningReversed: "성장 정체, 과잉" },
  { id: "the-emperor",        name: "The Emperor",        nameKo: "황제",        number: 4,  symbol: "IV", meaningUpright: "권위, 구조, 안정",             meaningReversed: "경직성, 과도한 통제" },
  { id: "the-hierophant",     name: "The Hierophant",     nameKo: "교황",        number: 5,  symbol: "V",  meaningUpright: "전통, 관습, 기관의 지원",      meaningReversed: "반항, 혁신" },
  { id: "the-lovers",         name: "The Lovers",         nameKo: "연인",        number: 6,  symbol: "VI", meaningUpright: "중요한 선택, 파트너십",        meaningReversed: "불균형, 잘못된 선택" },
  { id: "the-chariot",        name: "The Chariot",        nameKo: "전차",        number: 7,  symbol: "VII",meaningUpright: "강한 의지, 승리, 전진",        meaningReversed: "방향 상실, 좌절" },
  { id: "strength",           name: "Strength",           nameKo: "힘",          number: 8,  symbol: "VIII",meaningUpright: "내면의 힘, 인내",            meaningReversed: "자기 의심, 약점 노출" },
  { id: "the-hermit",         name: "The Hermit",         nameKo: "은둔자",      number: 9,  symbol: "IX", meaningUpright: "내면 탐구, 전략적 후퇴",       meaningReversed: "고립, 정보 차단" },
  { id: "wheel-of-fortune",   name: "Wheel of Fortune",   nameKo: "운명의 바퀴", number: 10, symbol: "X",  meaningUpright: "운명의 전환, 기회",            meaningReversed: "불운, 저항" },
  { id: "justice",            name: "Justice",            nameKo: "정의",        number: 11, symbol: "XI", meaningUpright: "공정한 결과, 균형",            meaningReversed: "불공정, 불균형" },
  { id: "the-hanged-man",     name: "The Hanged Man",     nameKo: "매달린 사람", number: 12, symbol: "XII",meaningUpright: "관점 전환, 일시 정지",        meaningReversed: "지연, 저항" },
  { id: "death",              name: "Death",              nameKo: "죽음",        number: 13, symbol: "XIII",meaningUpright: "변화, 사이클의 종료",        meaningReversed: "변화 저항, 정체" },
  { id: "temperance",         name: "Temperance",         nameKo: "절제",        number: 14, symbol: "XIV",meaningUpright: "균형, 절제, 조화",           meaningReversed: "불균형, 과잉" },
  { id: "the-devil",          name: "The Devil",          nameKo: "악마",        number: 15, symbol: "XV", meaningUpright: "집착 인식, 제약",            meaningReversed: "해방, 집착 끊기" },
  { id: "the-tower",          name: "The Tower",          nameKo: "탑",          number: 16, symbol: "XVI",meaningUpright: "갑작스러운 변화, 혼돈",      meaningReversed: "붕괴 회피, 두려움" },
  { id: "the-star",           name: "The Star",           nameKo: "별",          number: 17, symbol: "★",  meaningUpright: "희망, 회복, 평온",            meaningReversed: "절망, 연결 단절" },
  { id: "the-moon",           name: "The Moon",           nameKo: "달",          number: 18, symbol: "☾",  meaningUpright: "환상, 불확실성, 숨겨진 것",   meaningReversed: "혼란 해소, 진실" },
  { id: "the-sun",            name: "The Sun",            nameKo: "태양",        number: 19, symbol: "☀",  meaningUpright: "성공, 활력, 낙관",            meaningReversed: "일시적 우울, 에너지 고갈" },
  { id: "judgement",          name: "Judgement",          nameKo: "심판",        number: 20, symbol: "☆",  meaningUpright: "재탄생, 자아 평가",           meaningReversed: "자기 의심, 회피" },
  { id: "the-world",          name: "The World",          nameKo: "세계",        number: 21, symbol: "◎",  meaningUpright: "완성, 성취, 통합",            meaningReversed: "미완성, 지연" },
];

// ─── 폴백 해석 템플릿 ─────────────────────────────────────────────────────────

interface Interpretation {
  headline: string;
  summary: string;
  detail: string;
}

const INTERP_MAP: Record<string, Interpretation> = {
  "the-fool:upright":      { headline: "새로운 여정의 시작", summary: "바보 카드가 나타났습니다. 이 종목에는 예측하기 어려운 새로운 에너지가 흐르고 있습니다.", detail: "바보는 출발점을 상징합니다. 지금 이 순간은 새로운 국면이 열리는 시점일 수 있습니다. 열린 눈으로 상황을 바라볼 것을 권합니다. 이 해석은 투자 조언이 아닙니다." },
  "the-fool:reversed":     { headline: "준비 없는 도약은 위험하다", summary: "역방향 바보는 충동적 행동에 대한 경고를 담고 있습니다.", detail: "정보가 불충분하거나 타이밍이 무르익지 않았을 수 있습니다. 한 걸음 물러서 재점검하는 것이 현명할 수 있습니다. 이 해석은 투자 조언이 아닙니다." },
  "the-tower:upright":     { headline: "예상치 못한 충격의 에너지", summary: "탑 카드가 나타났습니다. 급격한 변화와 기존 구조의 재편을 상징합니다.", detail: "오랫동안 쌓아온 것들이 흔들리거나 재편될 수 있는 시점입니다. 충격 이후에 오는 정화와 재건의 가능성도 함께 담겨 있습니다. 이 해석은 투자 조언이 아닙니다." },
  "the-star:upright":      { headline: "폭풍 뒤에 빛나는 희망", summary: "별 카드는 회복과 희망의 에너지를 전합니다.", detail: "혼란스러웠던 흐름이 정리되고 장기적 가능성이 열리는 에너지입니다. 서두르지 않고 흐름을 따라가는 지혜가 필요합니다. 이 해석은 투자 조언이 아닙니다." },
  "the-moon:upright":      { headline: "안개 속, 보이지 않는 것들", summary: "달 카드는 불확실성과 숨겨진 정보를 경고합니다.", detail: "지금 이 흐름 속에는 드러나지 않은 요소들이 있을 수 있습니다. 성급한 결론보다 관망하는 지혜를 권합니다. 이 해석은 투자 조언이 아닙니다." },
  "the-sun:upright":       { headline: "밝고 낙관적인 에너지가 흐른다", summary: "태양 카드는 명확함과 성공의 에너지를 전합니다.", detail: "활기찬 흐름이 감지됩니다. 긍정적 에너지가 전면에 드러나고 있는 시점입니다. 이 해석은 투자 조언이 아닙니다." },
  "wheel-of-fortune:upright": { headline: "운명의 바퀴가 돌아간다", summary: "운명의 바퀴가 전환점을 알립니다.", detail: "사이클이 바뀌는 시점입니다. 기회와 변화가 함께 찾아오고 있습니다. 이 해석은 투자 조언이 아닙니다." },
  "the-world:upright":     { headline: "하나의 사이클이 완성된다", summary: "세계 카드는 완성과 성취를 상징합니다.", detail: "긴 여정이 마무리되고 새로운 사이클이 시작될 준비가 된 시점입니다. 이 해석은 투자 조언이 아닙니다." },
  "strength:upright":      { headline: "조용하지만 강한 흐름", summary: "힘 카드는 내면의 힘과 인내를 상징합니다.", detail: "화려하지 않지만 지속적인 에너지가 흐르고 있습니다. 끈기 있는 접근이 결실을 맺을 수 있는 시점입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-hermit:upright":    { headline: "고독 속의 통찰", summary: "은둔자 카드는 내면 탐구와 전략적 관망을 권합니다.", detail: "밖으로 나서기보다 안으로 집중하는 시간이 필요할 수 있습니다. 충분한 정보 수집 후 결정하세요. 이 해석은 투자 조언이 아닙니다." },
  "death:upright":         { headline: "변화와 전환의 에너지", summary: "죽음 카드는 끝이 아닌 변환을 상징합니다.", detail: "한 사이클이 마무리되고 새로운 시작이 준비되고 있습니다. 변화를 두려워하지 말고 흐름을 받아들이세요. 이 해석은 투자 조언이 아닙니다." },
};

// 범용 폴백 생성
function getGenericInterp(card: CardMeta, isReversed: boolean): Interpretation {
  const meaning = isReversed ? card.meaningReversed : card.meaningUpright;
  return {
    headline: isReversed ? `${card.nameKo}의 그림자 에너지` : `${card.nameKo}의 에너지가 흐른다`,
    summary: `${card.name} 카드${isReversed ? "(역방향)" : ""}가 나타났습니다. ${meaning}의 에너지가 감지됩니다.`,
    detail: `${card.nameKo} 카드는 ${meaning}을 상징합니다. 지금 이 흐름 속에서 카드가 전하는 메시지를 차분히 바라보세요. 타로는 결정을 대신하지 않으며, 스스로의 직관을 깨우는 거울입니다. 이 해석은 투자 조언이 아닙니다.`,
  };
}

function getInterpretation(cardId: string, isReversed: boolean): Interpretation {
  const key = `${cardId}:${isReversed ? "reversed" : "upright"}`;
  return INTERP_MAP[key] ?? getGenericInterp(
    CARDS.find((c) => c.id === cardId)!,
    isReversed
  );
}

// ─── 카드 랜덤 뽑기 ──────────────────────────────────────────────────────────

function drawCards(count: number): Array<{ card: CardMeta; isReversed: boolean }> {
  const shuffled = [...CARDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((card) => ({
    card,
    isReversed: Math.random() < 0.3, // 30% 역방향
  }));
}

// 3장 슬롯 이름
const THREE_CARD_SLOTS = ["과거", "현재", "미래"];

// ─── 메인 뽑기 함수 ───────────────────────────────────────────────────────────

export function localDraw(
  ticker: string,
  tickerName: string,
  spread: SpreadType
): DrawResult {
  const cardCount = spread === "single" ? 1 : 3;
  const drawn = drawCards(cardCount);

  const cards: DrawnCard[] = drawn.map((d, i) => {
    const interp = getInterpretation(d.card.id, d.isReversed);
    return {
      id: d.card.id,
      name: d.card.name,
      nameKo: d.card.nameKo,
      symbol: d.card.symbol,
      isReversed: d.isReversed,
      headline: interp.headline,
      summary: interp.summary,
      detail: interp.detail,
      ...(spread === "three-card" ? { slot: THREE_CARD_SLOTS[i] } : {}),
    } as DrawnCard;
  });

  // 전체 해석 (1장이면 그 카드 해석, 3장이면 조합)
  const interpretation =
    spread === "single"
      ? (cards[0]?.summary ?? "")
      : `${tickerName}의 ${THREE_CARD_SLOTS[0]}: ${cards[0]?.headline ?? ""}, ${THREE_CARD_SLOTS[1]}: ${cards[1]?.headline ?? ""}, ${THREE_CARD_SLOTS[2]}: ${cards[2]?.headline ?? ""}`;

  return {
    id: `local-${Date.now()}`,
    ticker,
    tickerName,
    spread,
    cards,
    interpretation,
    drawnAt: new Date().toISOString(),
  };
}

// ─── 로컬 기록 저장/조회 (AsyncStorage) ──────────────────────────────────────

let AsyncStorage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch {}

const HISTORY_KEY = "tarot_local_history";
const MAX_LOCAL_HISTORY = 50;

export interface LocalHistoryItem {
  id: string;
  ticker: string;
  tickerName: string;
  market: string;
  spread: SpreadType;
  headline: string;
  cardNameKo: string;
  cardSymbol: string;
  isReversed: boolean;
  drawnAt: string;
  interpretation: string;
  cards: DrawnCard[];
}

export async function saveLocalDraw(result: DrawResult, market: string): Promise<void> {
  if (!AsyncStorage) return;
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const prev: LocalHistoryItem[] = raw ? (JSON.parse(raw) as LocalHistoryItem[]) : [];
    const item: LocalHistoryItem = {
      id: result.id,
      ticker: result.ticker,
      tickerName: result.tickerName,
      market,
      spread: result.spread,
      headline: result.cards[0]?.headline ?? "",
      cardNameKo: result.cards[0]?.nameKo ?? "",
      cardSymbol: result.cards[0]?.symbol ?? "✦",
      isReversed: result.cards[0]?.isReversed ?? false,
      drawnAt: result.drawnAt,
      interpretation: result.interpretation,
      cards: result.cards,
    };
    const next = [item, ...prev].slice(0, MAX_LOCAL_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

export async function loadLocalHistory(): Promise<LocalHistoryItem[]> {
  if (!AsyncStorage) return [];
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as LocalHistoryItem[]) : [];
  } catch {
    return [];
  }
}

// ─── 로컬 검색 (인기 종목) ────────────────────────────────────────────────────

export interface LocalSearchResult {
  ticker: string;
  label: string;
  market: string;
  exchange: string;
}

const POPULAR_STOCKS: LocalSearchResult[] = [
  { ticker: "AAPL",     label: "Apple Inc.",           market: "US", exchange: "NASDAQ" },
  { ticker: "NVDA",     label: "NVIDIA Corporation",   market: "US", exchange: "NASDAQ" },
  { ticker: "TSLA",     label: "Tesla Inc.",           market: "US", exchange: "NASDAQ" },
  { ticker: "MSFT",     label: "Microsoft Corp.",      market: "US", exchange: "NASDAQ" },
  { ticker: "GOOGL",    label: "Alphabet Inc.",        market: "US", exchange: "NASDAQ" },
  { ticker: "AMZN",     label: "Amazon.com Inc.",      market: "US", exchange: "NASDAQ" },
  { ticker: "META",     label: "Meta Platforms",       market: "US", exchange: "NASDAQ" },
  { ticker: "005930.KS",label: "삼성전자",              market: "KR", exchange: "KRX" },
  { ticker: "000660.KS",label: "SK하이닉스",            market: "KR", exchange: "KRX" },
  { ticker: "035420.KS",label: "NAVER",                market: "KR", exchange: "KRX" },
  { ticker: "035720.KS",label: "카카오",                market: "KR", exchange: "KRX" },
  { ticker: "051910.KS",label: "LG화학",               market: "KR", exchange: "KRX" },
  { ticker: "006400.KS",label: "삼성SDI",              market: "KR", exchange: "KRX" },
  { ticker: "207940.KS",label: "삼성바이오로직스",      market: "KR", exchange: "KRX" },
  { ticker: "066570.KS",label: "LG전자",               market: "KR", exchange: "KRX" },
];

export function localSearch(query: string): LocalSearchResult[] {
  const q = query.toLowerCase();
  return POPULAR_STOCKS.filter(
    (s) =>
      s.label.toLowerCase().includes(q) ||
      s.ticker.toLowerCase().includes(q)
  ).slice(0, 8);
}
