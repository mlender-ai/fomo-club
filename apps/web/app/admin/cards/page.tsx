import { prisma } from "../../../lib/prisma";
import { CardTable } from "./CardTable";

export const dynamic = "force-dynamic";

async function getCards() {
  return prisma.tarotCard.findMany({
    orderBy: { number: "asc" },
    include: {
      _count: {
        select: { drawHistoryCards: true },
      },
    },
  });
}

export default async function CardsPage() {
  const cards = await getCards();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>카드 관리</h1>
          <p className="admin-page-desc">22장 메이저 아르카나 카드 메타데이터</p>
        </div>
        <div className="admin-header-stats">
          <span className="admin-stat-pill">
            전체 {cards.length}장
          </span>
          <span className="admin-stat-pill admin-stat-active">
            활성 {cards.filter((c) => c.status === "ACTIVE").length}장
          </span>
        </div>
      </header>

      <CardTable cards={cards} />
    </div>
  );
}
