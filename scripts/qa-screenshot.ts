import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const CHROME_BINARY = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

interface CliArgs {
  url: string;
  out: string;
  width: number;
  height: number;
  budget: number;
}

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    values[key] = value;
    index += 1;
  }

  if (!values.url) {
    throw new Error("Missing required --url");
  }

  if (!values.out) {
    throw new Error("Missing required --out");
  }

  return {
    url: values.url,
    out: resolve(values.out),
    width: Number.parseInt(values.width ?? "1440", 10),
    height: Number.parseInt(values.height ?? "1600", 10),
    budget: Number.parseInt(values.budget ?? "7000", 10)
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const profileDir = await mkdtemp(join(tmpdir(), "fomo-club-qa-chrome-"));

  const chromeArgs = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-features=MediaRouter,AutofillServerCommunication,OptimizationHints",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${args.width},${args.height}`,
    `--virtual-time-budget=${args.budget}`,
    `--user-data-dir=${profileDir}`,
    `--screenshot=${args.out}`,
    args.url
  ];

  try {
    await new Promise<void>((resolveRun, rejectRun) => {
      const child = spawn(CHROME_BINARY, chromeArgs, {
        stdio: "pipe"
      });

      let stderr = "";
      const timeout = setTimeout(async () => {
        child.kill("SIGKILL");

        try {
          await access(args.out);
          resolveRun();
        } catch {
          rejectRun(new Error(stderr || "Chrome QA screenshot timed out before producing an image."));
        }
      }, Math.max(args.budget + 4000, 10000));

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        rejectRun(error);
      });

      child.on("exit", (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolveRun();
          return;
        }

        rejectRun(new Error(stderr || `Chrome exited with code ${code ?? "unknown"}`));
      });
    });

    process.stdout.write(`Saved screenshot to ${args.out}\n`);
  } finally {
    await rm(profileDir, {
      force: true,
      recursive: true
    });
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
