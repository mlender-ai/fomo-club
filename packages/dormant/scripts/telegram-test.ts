import "dotenv/config";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
const password = process.env.API_PASSWORD ?? process.env.DASHBOARD_PASSWORD ?? process.env.BOT_PASSWORD ?? "";
const text = process.argv.slice(2).join(" ").trim() || `Paper trading bot test at ${new Date().toISOString()}`;

async function main() {
  const response = await fetch(`${apiBaseUrl}/telegram/test`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dashboard-password": password
    },
    body: JSON.stringify({
      text
    })
  });

  if (!response.ok) {
    throw new Error(`/telegram/test -> ${response.status}`);
  }

  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
