import { promises as fs } from "fs";
import path from "path";

import { readNewsletterRecipients } from "../packages/shared/src/researchLive";
import { readPreferredResearchSnapshot, runAndPersistResearchPipeline } from "../apps/web/lib/researchPipelineStore";

const OUTPUT_PATH = path.join(process.cwd(), "generated", "research", "newsletter-preview.html");

function wrapNewsletterHtml(subject: string, previewText: string, bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="ko">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${subject}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<style>",
    "body{margin:0;background:#f5f0e8;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
    ".shell{max-width:720px;margin:0 auto;padding:32px 20px 64px;}",
    ".card{background:#fffdf8;border:1px solid rgba(31,41,55,.08);border-radius:24px;padding:28px;box-shadow:0 18px 40px rgba(15,23,42,.06);}",
    "h1,h2{line-height:1.15;color:#111827;}",
    "h1{font-size:28px;margin:0 0 10px;}",
    "h2{font-size:18px;margin:28px 0 12px;}",
    "p,li{font-size:15px;line-height:1.7;color:#374151;}",
    "ul{padding-left:18px;}",
    ".eyebrow{display:inline-block;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#6b7280;margin-bottom:12px;}",
    ".preview{font-size:16px;color:#4b5563;margin:0;}",
    "</style>",
    "</head>",
    "<body>",
    '<div class="shell">',
    '<div class="card">',
    '<span class="eyebrow">Daily Newsletter</span>',
    `<h1>${subject}</h1>`,
    `<p class="preview">${previewText}</p>`,
    bodyHtml,
    "</div>",
    "</div>",
    "</body>",
    "</html>"
  ].join("");
}

async function sendWithResend(input: { from: string; to: string[]; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    return {
      status: "skipped",
      reason: "RESEND_API_KEY가 없어 이메일 발송을 건너뜁니다."
    } as const;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const payload = await response.text();

  if (!response.ok) {
    throw new Error(`Resend request failed with ${response.status}: ${payload}`);
  }

  return {
    status: "sent",
    payload
  } as const;
}

async function main() {
  const recipients = readNewsletterRecipients();
  const snapshot = (await readPreferredResearchSnapshot()) ?? (await runAndPersistResearchPipeline(undefined, process.env.GITHUB_ACTIONS ? "github-actions" : "local-script"));
  const envelope = snapshot.workspace.newsletter;
  const subject = envelope.subject;
  const html = wrapNewsletterHtml(subject, envelope.previewText, envelope.bodyHtml);

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, html, "utf8");

  if (recipients.length === 0) {
    process.stdout.write("newsletter=preview-only\nreason=NEWSLETTER_TO가 비어 있어 미리보기만 생성했습니다.\n");
    return;
  }

  const from = process.env.NEWSLETTER_FROM?.trim();

  if (!from) {
    process.stdout.write("newsletter=preview-only\nreason=NEWSLETTER_FROM이 비어 있어 미리보기만 생성했습니다.\n");
    return;
  }

  const result = await sendWithResend({
    from,
    to: recipients,
    subject,
    html,
    text: envelope.bodyText
  });

  process.stdout.write(
    [
      `newsletter=${result.status}`,
      `recipients=${recipients.join(",")}`,
      `preview=${OUTPUT_PATH}`,
      "payload" in result ? `response=${result.payload}` : `reason=${result.reason}`
    ].join("\n")
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
