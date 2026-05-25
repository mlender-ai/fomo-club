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
  // ── 0. The Fool ──
  "the-fool:upright":      { headline: "아무도 가지 않은 길 위에 서다", summary: "바보 카드가 나타났습니다. 새로운 국면이 열리고 있고, 이전의 규칙이 통하지 않을 수 있습니다. 열린 마음이 필요한 시점입니다.", detail: "남들이 정해놓은 루트가 아니라, 아직 아무도 걸어보지 않은 길이 보입니다. 두렵지만 동시에 설레는 에너지가 감지됩니다. 바보는 무지가 아니라 용기를 상징합니다. 지금은 과거의 경험에 갇히기보다, 처음 시작하는 마음으로 바라볼 때입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-fool:reversed":     { headline: "지금 뛰어들면 후회할 수 있다", summary: "역방향 바보는 충동과 준비 부족을 경고합니다. '느낌'만으로 움직이기에는 불확실한 것이 너무 많습니다.", detail: "급하게 결정하면 놓치는 것들이 있습니다. 역방향 바보는 열정이 앞서 판단을 흐리게 하는 상태를 비춥니다. 한 걸음 물러서서, 정말 알고 있는 것과 희망사항을 구분해보세요. 타이밍은 만드는 것이 아니라 기다리는 것일 수도 있습니다. 이 해석은 투자 조언이 아닙니다." },
  // ── 1. The Magician ──
  "the-magician:upright":  { headline: "당신의 손에 도구가 있다", summary: "마법사 카드는 실행력과 기회의 현실화를 상징합니다. 정보와 도구는 이미 충분합니다.", detail: "모든 재료가 테이블 위에 올라와 있는 시점입니다. 마법사는 운이 아니라 기술과 의지로 결과를 만들어냅니다. 지금은 분석하고 고민할 때가 아니라, 알고 있는 것을 실행에 옮길 때입니다. 다만 마법사의 힘은 집중에서 나옵니다. 여러 곳에 분산하면 어느 것도 완성되지 않습니다. 이 해석은 투자 조언이 아닙니다." },
  "the-magician:reversed": { headline: "재능이 낭비되고 있다", summary: "역방향 마법사는 능력은 있으나 방향이 흐트러진 상태를 나타냅니다.", detail: "할 수 있는 것과 해야 할 것 사이의 간극이 벌어져 있습니다. 능력을 증명하려는 욕심이 오히려 판단을 왜곡시킬 수 있는 시점입니다. 지금은 새로운 전략보다 기본으로 돌아가는 것이 현명합니다. 이 해석은 투자 조언이 아닙니다." },
  // ── 2. The High Priestess ──
  "the-high-priestess:upright": { headline: "보이지 않는 곳에 답이 있다", summary: "여교황 카드는 직관과 숨겨진 정보의 존재를 알립니다. 표면 아래를 들여다볼 시간입니다.", detail: "지금 드러난 정보만으로는 전체 그림이 보이지 않습니다. 여교황은 조용히 관찰하는 자에게 진실이 드러난다고 말합니다. 소문이나 여론에 휩쓸리기보다, 스스로의 감각을 믿고 한 걸음 더 깊이 들여다보세요. 이 해석은 투자 조언이 아닙니다." },
  "the-high-priestess:reversed": { headline: "직감을 무시하고 있지 않은가", summary: "역방향 여교황은 내면의 신호를 무시하거나, 정보가 의도적으로 은폐되고 있음을 경고합니다.", detail: "무언가 이상하다는 느낌이 들면서도 무시하고 있었다면, 그 감각이 맞을 수 있습니다. 역방향 여교황은 진실이 가려져 있는 상태를 비춥니다. 남의 확신에 기대기보다 자신의 불안을 정직하게 마주해보세요. 이 해석은 투자 조언이 아닙니다." },
  // ── 3-6 ──
  "the-empress:upright":   { headline: "풍요가 무르익는 계절", summary: "여황제 카드는 성장과 번영의 에너지를 전합니다. 씨앗이 자라는 데는 시간이 걸립니다.", detail: "지금은 서두를 때가 아닙니다. 여황제는 자연의 리듬처럼, 성장에는 올바른 시기와 인내가 필요하다고 말합니다. 이미 뿌려놓은 것이 있다면, 그것이 열매를 맺을 때까지 기다리는 것도 전략입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-emperor:upright":   { headline: "흔들리지 않는 기준이 필요하다", summary: "황제 카드는 원칙과 구조를 상징합니다. 감정이 아닌 기준으로 판단할 시점입니다.", detail: "주변의 소음과 변동에 일희일비하고 있다면, 황제는 자신만의 원칙을 세우라고 말합니다. 명확한 기준이 있는 사람은 흔들리지 않습니다. 지금은 감정적 반응보다 냉정한 체계가 당신을 지켜줄 때입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-lovers:upright":    { headline: "선택의 기로에 서 있다", summary: "연인 카드는 중요한 갈림길을 상징합니다. 어느 쪽을 택하든 돌아갈 수 없는 결정이 될 수 있습니다.", detail: "두 가지 길 사이에서 고민하고 계시다면, 그 고민 자체가 의미 있습니다. 연인 카드는 가벼운 선택이 아니라 가치관이 반영된 결정을 요구합니다. 남들의 선택이 아닌 나의 기준으로 정하세요. 이 해석은 투자 조언이 아닙니다." },
  "the-chariot:upright":   { headline: "멈추면 안 되는 순간", summary: "전차 카드는 강한 추진력과 집중을 상징합니다. 망설임을 뒤로하고 전진할 에너지가 있습니다.", detail: "전차는 목표를 향해 일직선으로 나아가는 의지를 비춥니다. 다만 전차를 모는 것은 쉽지 않습니다. 양쪽으로 끌리는 힘을 통제하며 한 방향을 유지하는 것이 관건입니다. 흔들리는 마음을 한 곳에 집중시킬 수 있다면, 지금의 에너지가 결실로 이어질 수 있습니다. 이 해석은 투자 조언이 아닙니다." },
  // ── 7-9 ──
  "strength:upright":      { headline: "조급함을 내려놓을 때", summary: "힘 카드는 폭발적인 힘이 아니라 조용한 인내를 상징합니다. 이기는 것은 끝까지 버티는 사람입니다.", detail: "지금 당장 눈에 보이는 결과가 없더라도, 그것이 실패를 의미하지 않습니다. 힘 카드는 사자를 힘으로 제압하는 것이 아니라 부드럽게 길들이는 여인을 그립니다. 시장의 변동 앞에서 조급함을 내려놓고, 자신의 판단을 믿고 기다릴 수 있는 내면의 근력이 필요한 시점입니다. 이 해석은 투자 조언이 아닙니다." },
  "strength:reversed":     { headline: "자기 의심이 발목을 잡고 있다", summary: "역방향 힘은 스스로를 신뢰하지 못하는 상태를 나타냅니다. 불안이 판단을 흐리게 하고 있습니다.", detail: "맞는 결정을 하고도 흔들리고, 확신이 서지 않아 계속 남의 의견을 찾고 있다면 — 역방향 힘이 비추는 바로 그 상태입니다. 지금은 외부 정보를 더 구하는 것보다 자신의 감정을 먼저 정리하는 것이 우선입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-hermit:upright":    { headline: "홀로 고민하는 시간이 답이다", summary: "은둔자 카드는 남들의 의견을 멈추고 나만의 시간을 가지라고 말합니다.", detail: "유튜브, 리포트, 카톡방 — 정보의 홍수 속에서 오히려 판단이 흐려지고 있지 않나요? 은둔자는 산 위에서 홀로 등불을 들고 있는 카드입니다. 남의 확신이 아닌 나만의 통찰이 필요한 시간입니다. 아무것도 하지 않는 것도 전략일 수 있습니다. 이 해석은 투자 조언이 아닙니다." },
  "the-hermit:reversed":   { headline: "고립이 너무 길어지고 있다", summary: "역방향 은둔자는 정보 차단이 오히려 위험해진 상태를 경고합니다.", detail: "혼자만의 판단에 갇혀 시장의 변화를 놓치고 있을 수 있습니다. 관망이 전략이었다면, 이제는 다시 세상 밖으로 나와 현실을 확인할 때입니다. 이 해석은 투자 조언이 아닙니다." },
  // ── 10-14 ──
  "wheel-of-fortune:upright": { headline: "흐름이 바뀌기 시작했다", summary: "운명의 바퀴는 전환점을 알립니다. 사이클이 바뀌는 순간에 서 있습니다.", detail: "올라갈 때는 영원히 올라갈 것 같고, 내려갈 때는 바닥이 없는 것 같지만 — 바퀴는 항상 돌아갑니다. 지금이 어떤 위치이든, 이 상태가 영원하지 않다는 것을 기억하세요. 변화의 조짐이 이미 시작되었을 수 있습니다. 이 해석은 투자 조언이 아닙니다." },
  "wheel-of-fortune:reversed": { headline: "운이 따르지 않는 시기", summary: "역방향 운명의 바퀴는 타이밍이 맞지 않는 구간임을 나타냅니다.", detail: "아무리 노력해도 결과가 따라오지 않는 시기가 있습니다. 역방향 바퀴는 그런 구간에서 억지로 흐름을 만들려 하지 말라고 경고합니다. 잠시 멈추고 바퀴가 다시 돌아오기를 기다리는 것도 지혜입니다. 이 해석은 투자 조언이 아닙니다." },
  "justice:upright":       { headline: "원인이 결과가 되는 시간", summary: "정의 카드는 공정한 결과를 상징합니다. 과거의 선택이 지금의 상황을 만들었습니다.", detail: "좋든 나쁘든, 지금의 상황은 우연이 아닙니다. 정의 카드는 모든 행동에는 그에 상응하는 결과가 따른다고 말합니다. 이전의 판단이 옳았다면 결실이, 성급했다면 교훈이 찾아올 시점입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-hanged-man:upright": { headline: "멈춰야 보이는 것이 있다", summary: "매달린 사람은 시각의 전환을 상징합니다. 기존의 방식으로는 답이 나오지 않습니다.", detail: "거꾸로 매달린 사람은 고통이 아니라 깨달음의 자세입니다. 지금까지의 접근법이 통하지 않는다면, 완전히 다른 각도에서 바라볼 필요가 있습니다. 때로는 후퇴처럼 보이는 것이 가장 현명한 전진입니다. 이 해석은 투자 조언이 아닙니다." },
  "death:upright":         { headline: "끝이 아니라 전환이다", summary: "죽음 카드는 공포가 아닌 변환을 상징합니다. 하나의 사이클이 마무리되고 있습니다.", detail: "붙들고 있던 것을 놓아야 새로운 것이 들어옵니다. 죽음 카드는 물리적 종말이 아니라, 낡은 관점이나 전략의 종료를 의미합니다. 지금 놓아주는 것이 아깝더라도, 그 빈자리에 더 나은 것이 채워질 수 있습니다. 이 해석은 투자 조언이 아닙니다." },
  "death:reversed":        { headline: "변화가 두려워 붙들고 있다", summary: "역방향 죽음은 끝내야 할 것을 끝내지 못하고 있는 상태를 나타냅니다.", detail: "이미 끝났어야 할 것을 놓지 못하고 있지 않나요? 역방향 죽음은 변화에 대한 저항이 오히려 고통을 연장시키는 상태를 비춥니다. 새로운 시작을 위해서는 먼저 마침표를 찍어야 합니다. 이 해석은 투자 조언이 아닙니다." },
  "temperance:upright":    { headline: "급할수록 균형이 답이다", summary: "절제 카드는 조화와 인내를 상징합니다. 극단은 답이 아닙니다.", detail: "한쪽으로 치우치면 반드시 반대쪽의 힘이 찾아옵니다. 절제는 올인도, 전량 매도도 아닌 중간 지점의 지혜를 말합니다. 성급하게 전부를 걸거나 전부를 포기하기보다, 균형 잡힌 자세를 유지하세요. 이 해석은 투자 조언이 아닙니다." },
  // ── 15-18 ──
  "the-devil:upright":     { headline: "집착이 눈을 가리고 있다", summary: "악마 카드는 탐욕이나 집착이 판단을 왜곡시키고 있음을 경고합니다.", detail: "이미 마음이 한 방향으로 기울어져 있지 않나요? 악마 카드는 우리가 스스로 선택했다고 믿지만 실은 매여있는 상태를 비춥니다. '조금만 더'라는 생각이 반복된다면, 그것이 욕심인지 판단인지 구분해보세요. 이 해석은 투자 조언이 아닙니다." },
  "the-tower:upright":     { headline: "예상치 못한 충격이 온다", summary: "탑 카드는 갑작스러운 변화와 기존 구조의 붕괴를 상징합니다. 충격은 두렵지만, 그 이후의 재건이 더 중요합니다.", detail: "단단하다고 믿었던 것이 무너질 수 있는 시점입니다. 탑 카드는 가장 무서운 카드이지만, 동시에 가장 정직한 카드입니다. 거짓 위에 쌓은 것은 언젠가 무너지게 되어 있고, 진짜 바닥 위에서만 진짜 건물을 지을 수 있습니다. 이 해석은 투자 조언이 아닙니다." },
  "the-tower:reversed":    { headline: "위기를 피했지만 안심은 이르다", summary: "역방향 탑은 최악은 면했으나, 근본적 불안이 해소되지 않은 상태입니다.", detail: "당장의 충격은 피했을지 모르지만, 구조적 문제가 해결된 것은 아닙니다. 역방향 탑은 '이번에는 괜찮았다'는 안도감이 다음의 경계심을 낮추는 것을 경고합니다. 이 해석은 투자 조언이 아닙니다." },
  "the-star:upright":      { headline: "어둠 뒤에 반드시 빛이 온다", summary: "별 카드는 회복과 희망의 에너지를 전합니다. 가장 힘든 시기를 지나왔다면, 이제 회복이 시작됩니다.", detail: "별은 타로에서 가장 따뜻한 카드 중 하나입니다. 폭풍(탑) 이후에 나타나는 별은, 가장 어두운 밤에도 길을 비추는 존재입니다. 조급함을 내려놓고 장기적 시야로 바라볼 때, 지금의 고통이 성장의 과정이었음을 알게 될 것입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-star:reversed":     { headline: "희망을 잃어가고 있다면", summary: "역방향 별은 절망과 회복 의지의 약화를 나타냅니다.", detail: "한 번의 실망이 모든 것을 포기하게 만들기도 합니다. 역방향 별은 희망이 사라진 것이 아니라, 지금 그것을 볼 수 없는 상태임을 말합니다. 완전히 무너지기 전에, 작은 것이라도 붙들 수 있는 것을 찾아보세요. 이 해석은 투자 조언이 아닙니다." },
  "the-moon:upright":      { headline: "안개 속을 걷고 있다", summary: "달 카드는 불확실성과 환상을 경고합니다. 지금 보이는 것이 전부가 아닙니다.", detail: "달빛 아래서는 그림자가 실물보다 크게 보입니다. 달 카드가 나타났을 때, 가장 위험한 것은 불완전한 정보를 완전한 것으로 착각하는 것입니다. '확실하다'는 느낌이 드는 순간이야말로 가장 경계해야 할 때입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-moon:reversed":     { headline: "드디어 안개가 걷히고 있다", summary: "역방향 달은 혼란이 정리되고 진실이 드러나기 시작하는 시점입니다.", detail: "오랫동안 불확실했던 것들의 윤곽이 잡히기 시작합니다. 가짜 정보와 진짜 흐름이 구분되기 시작하는 시점입니다. 다만 아직 완전히 맑아진 것은 아니니, 성급한 결론보다 조금 더 지켜보는 여유가 필요합니다. 이 해석은 투자 조언이 아닙니다." },
  // ── 19-21 ──
  "the-sun:upright":       { headline: "명확한 에너지가 빛나는 날", summary: "태양 카드는 확신과 낙관의 에너지를 전합니다. 모호함이 사라지고 방향이 선명해지는 시점입니다.", detail: "태양 아래서는 그림자가 사라집니다. 오랫동안 고민하던 것에 대한 답이 보이기 시작하는 에너지입니다. 다만 태양이 뜬 날이 영원히 계속되지는 않습니다. 밝은 에너지가 있을 때 해야 할 것을 하고, 너무 들뜨지 않는 것도 지혜입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-sun:reversed":      { headline: "잠시 구름이 해를 가렸다", summary: "역방향 태양은 일시적 우울이나 에너지 저하를 나타냅니다.", detail: "기본적으로 긍정적인 에너지이지만, 구름이 잠시 해를 가린 것처럼 활력이 떨어진 상태입니다. 이것은 근본적 문제가 아니라 일시적 상태입니다. 무리하지 말고 에너지를 충전하는 시간을 가지세요. 이 해석은 투자 조언이 아닙니다." },
  "judgement:upright":     { headline: "과거의 판단을 다시 돌아볼 때", summary: "심판 카드는 재평가와 자기 성찰을 요구합니다. 이전에 내린 결정이 지금도 유효한지 점검하세요.", detail: "심판 카드의 나팔 소리는 '일어나라'는 의미입니다. 과거에 했던 선택들 — 좋았든 나빴든 — 을 차분히 돌아보고, 같은 실수를 반복하지 않기 위한 시간입니다. 후회하기 위해서가 아니라, 더 나은 다음 판단을 위해서 과거를 직시하세요. 이 해석은 투자 조언이 아닙니다." },
  "judgement:reversed":    { headline: "자기 성찰을 피하고 있다", summary: "역방향 심판은 과거의 실수를 인정하지 않으려는 상태를 나타냅니다.", detail: "아픈 기억을 회피하면 같은 패턴이 반복됩니다. 역방향 심판은 불편하더라도 과거를 직시하라고 말합니다. 실수를 인정하는 것이 약함이 아니라, 성장의 시작입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-world:upright":     { headline: "하나의 여정이 완성되다", summary: "세계 카드는 사이클의 완성과 성취를 상징합니다. 긴 여정의 끝에 서 있습니다.", detail: "오랫동안 이어진 흐름이 마무리되는 에너지입니다. 세계 카드는 끝이자 동시에 새로운 시작입니다. 한 단계를 완성했다는 뿌듯함을 느끼되, 곧 시작될 다음 사이클을 위한 준비도 함께 해야 할 때입니다. 이 해석은 투자 조언이 아닙니다." },
  "the-world:reversed":    { headline: "마무리 짓지 못한 숙제", summary: "역방향 세계는 완성 직전에 멈춰선 상태를 나타냅니다.", detail: "거의 다 왔지만 마지막 한 걸음이 남아있습니다. 역방향 세계는 포기하기에는 너무 아까운 지점에 서 있음을 상기시킵니다. 지금 포기하면 처음부터 다시 시작해야 할 수 있습니다. 이 해석은 투자 조언이 아닙니다." },
};

// 범용 폴백 생성 — 해석 맵에 없는 카드+방향 조합용
function getGenericInterp(card: CardMeta, isReversed: boolean): Interpretation {
  const meaning = isReversed ? card.meaningReversed : card.meaningUpright;
  const orientation = isReversed ? "역방향" : "정방향";
  return {
    headline: isReversed
      ? `지금 ${card.nameKo}가 경고한다`
      : `${card.nameKo}가 비추는 지금의 흐름`,
    summary: `${card.nameKo}(${card.name}) ${orientation}이 나타났습니다. ${meaning} — 이 에너지가 지금 당신의 투자 심리와 맞닿아 있습니다.`,
    detail: `${card.nameKo} 카드는 ${meaning}을 상징합니다. ${isReversed ? "역방향은 이 에너지가 막혀있거나 왜곡된 상태를 의미합니다. 지금 느끼는 불안이나 확신이 진짜인지, 아니면 감정이 만들어낸 환상인지 구분해보세요." : "이 카드의 에너지가 순방향으로 흐르고 있습니다. 카드가 전하는 메시지를 자신의 상황에 비추어 차분히 생각해보세요."} 타로는 결정을 대신하지 않습니다. 스스로의 직관을 깨우는 거울입니다. 이 해석은 투자 조언이 아닙니다.`,
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
