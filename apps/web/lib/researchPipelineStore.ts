import { promises as fs } from "fs";
import path from "path";

import {
  RESEARCH_CONTRACT_METADATA,
  RESEARCH_CONTRACT_VERSION,
  buildResearchWorkspace,
  renderResearchPipelineMarkdown,
  type ResearchBehaviorSummary,
  type ResearchWorkspaceData,
  type TickerAnalysis,
  type UserResearchPreferences
} from "@fomo/shared/src/research";
import { generateResearchPipelineSnapshot, type GeneratedResearchSnapshot } from "@fomo/shared/src/researchPipeline";
import { readResearchBehaviorSummary } from "@fomo/shared/src/researchBehaviorStore";
import { buildLiveResearchWorkspace } from "@fomo/shared/src/researchLive";

const OUTPUT_DIR = path.join(process.cwd(), "generated", "research");
const JSON_BASENAME = "latest.json";
const MARKDOWN_BASENAME = "latest.md";
const DEFAULT_PUBLISHED_SNAPSHOT_URL = "https://raw.githubusercontent.com/mlender-ai/auto-trading-bot/main/generated/research/latest.json";
const PUBLISHED_SNAPSHOT_TTL_MS = 60_000;

export const RESEARCH_PIPELINE_JSON_PATH = path.join(OUTPUT_DIR, JSON_BASENAME);
export const RESEARCH_PIPELINE_MARKDOWN_PATH = path.join(OUTPUT_DIR, MARKDOWN_BASENAME);
export const RESEARCH_PIPELINE_ARTIFACT_PATH = path.posix.join("generated", "research", JSON_BASENAME);

let publishedSnapshotCache: {
  fetchedAt: number;
  snapshot: GeneratedResearchSnapshot | null;
} | null = null;

function samePreferences(left: UserResearchPreferences, right: UserResearchPreferences): boolean {
  return left.sectors.join(",") === right.sectors.join(",") && left.tickers.join(",") === right.tickers.join(",");
}

function compactChartSeries(series: TickerAnalysis["chartSeries"]): TickerAnalysis["chartSeries"] {
  if (!series || series.length <= 28) {
    return series;
  }

  const step = Math.max(1, Math.floor(series.length / 28));
  const sampled = series.filter((_, index) => index === 0 || index === series.length - 1 || index % step === 0);
  return sampled.slice(0, 28);
}

function compactWorkspaceForHome(workspace: ResearchWorkspaceData): ResearchWorkspaceData {
  return {
    ...workspace,
    tickerAnalyses: workspace.tickerAnalyses.map((analysis) => {
      const compactedSeries = compactChartSeries(analysis.chartSeries);

      return compactedSeries
        ? {
            ...analysis,
            chartSeries: compactedSeries
          }
        : analysis;
    }),
    meeting: {
      ...workspace.meeting,
      messages: []
    },
    productReview: {
      notes: [],
      actionItems: []
    },
    agentPipeline: {
      ...workspace.agentPipeline,
      definitions: [],
      steps: [],
      runtime: {
        ...workspace.agentPipeline.runtime,
        summaryMarkdown: "",
        transcript: []
      }
    },
    newsletter: {
      ...workspace.newsletter,
      bodyText: "",
      bodyHtml: ""
    }
  };
}

function toSnapshot(workspace: ResearchWorkspaceData, warnings: string[] = []): GeneratedResearchSnapshot {
  const markdown = renderResearchPipelineMarkdown({
    contractVersion: workspace.contractVersion,
    generatedAt: workspace.generatedAt,
    preferences: workspace.preferences,
    behaviorSummary: workspace.behaviorSummary,
    news: workspace.news,
    tickerAnalyses: workspace.tickerAnalyses,
    agentPipeline: workspace.agentPipeline,
    productReview: workspace.productReview
  });

  workspace.agentPipeline.runtime.summaryMarkdown = markdown;

  return {
    contract: RESEARCH_CONTRACT_METADATA,
    contractVersion: RESEARCH_CONTRACT_VERSION,
    workspace,
    markdown,
    warnings
  };
}

function attachBehaviorSummary(snapshot: GeneratedResearchSnapshot, behaviorSummary: ResearchBehaviorSummary): GeneratedResearchSnapshot {
  snapshot.workspace.contractVersion = RESEARCH_CONTRACT_VERSION;
  snapshot.workspace.behaviorSummary = behaviorSummary;
  snapshot.contract = RESEARCH_CONTRACT_METADATA;
  snapshot.contractVersion = RESEARCH_CONTRACT_VERSION;
  snapshot.markdown = renderResearchPipelineMarkdown({
    contractVersion: snapshot.workspace.contractVersion,
    generatedAt: snapshot.workspace.generatedAt,
    preferences: snapshot.workspace.preferences,
    behaviorSummary: snapshot.workspace.behaviorSummary,
    news: snapshot.workspace.news,
    tickerAnalyses: snapshot.workspace.tickerAnalyses,
    agentPipeline: snapshot.workspace.agentPipeline,
    productReview: snapshot.workspace.productReview
  });
  snapshot.workspace.agentPipeline.runtime.summaryMarkdown = snapshot.markdown;
  return snapshot;
}

function getSnapshotTimestamp(snapshot: GeneratedResearchSnapshot): number {
  const candidate = snapshot.workspace.agentPipeline.runtime.generatedAt || snapshot.workspace.generatedAt;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotMatchesPreferences(snapshot: GeneratedResearchSnapshot, preferences?: Partial<UserResearchPreferences>): boolean {
  if (!preferences) {
    return true;
  }

  const normalized = buildResearchWorkspace(preferences).preferences;
  return samePreferences(snapshot.workspace.preferences, normalized);
}

export async function readStoredResearchSnapshot(): Promise<GeneratedResearchSnapshot | null> {
  try {
    const raw = await fs.readFile(RESEARCH_PIPELINE_JSON_PATH, "utf8");
    return JSON.parse(raw) as GeneratedResearchSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function readPublishedResearchSnapshot(): Promise<GeneratedResearchSnapshot | null> {
  if (publishedSnapshotCache && Date.now() - publishedSnapshotCache.fetchedAt < PUBLISHED_SNAPSHOT_TTL_MS) {
    return publishedSnapshotCache.snapshot;
  }

  const snapshotUrl = process.env.RESEARCH_PUBLISHED_SNAPSHOT_URL || DEFAULT_PUBLISHED_SNAPSHOT_URL;

  try {
    const response = await fetch(snapshotUrl, {
      headers: {
        accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(1_500)
    });

    if (!response.ok) {
      publishedSnapshotCache = {
        fetchedAt: Date.now(),
        snapshot: null
      };
      return null;
    }

    const snapshot = (await response.json()) as GeneratedResearchSnapshot;
    publishedSnapshotCache = {
      fetchedAt: Date.now(),
      snapshot
    };
    return snapshot;
  } catch {
    publishedSnapshotCache = {
      fetchedAt: Date.now(),
      snapshot: null
    };
    return null;
  }
}

export async function readPreferredResearchSnapshot(preferences?: Partial<UserResearchPreferences>): Promise<GeneratedResearchSnapshot | null> {
  const [stored, behaviorSummary] = await Promise.all([readStoredResearchSnapshot(), readResearchBehaviorSummary()]);

  if (stored && snapshotMatchesPreferences(stored, preferences)) {
    return attachBehaviorSummary(stored, behaviorSummary);
  }

  const published = await readPublishedResearchSnapshot();
  const candidates = [published].filter((snapshot): snapshot is GeneratedResearchSnapshot => Boolean(snapshot && snapshotMatchesPreferences(snapshot, preferences)));

  if (candidates.length === 0) {
    return null;
  }

  return attachBehaviorSummary(candidates.sort((left, right) => getSnapshotTimestamp(right) - getSnapshotTimestamp(left))[0]!, behaviorSummary);
}

export async function getInitialResearchWorkspace(preferences?: Partial<UserResearchPreferences>): Promise<ResearchWorkspaceData> {
  const snapshot = await readPreferredResearchSnapshot(preferences);

  if (snapshot) {
    snapshot.workspace.agentPipeline.runtime.summaryMarkdown ||= snapshot.markdown;
    return compactWorkspaceForHome(snapshot.workspace);
  }

  const live = await buildLiveResearchWorkspace(preferences);
  const behaviorSummary = await readResearchBehaviorSummary();
  live.workspace.behaviorSummary = behaviorSummary;
  live.workspace.contractVersion = RESEARCH_CONTRACT_VERSION;
  const fallback = toSnapshot(live.workspace, live.warnings);
  live.workspace.agentPipeline.runtime.summaryMarkdown = fallback.markdown;

  return compactWorkspaceForHome(live.workspace);
}

export async function runAndPersistResearchPipeline(preferences?: Partial<UserResearchPreferences>, source: "web-api" | "local-script" | "github-actions" = "local-script") {
  const behaviorSummary = await readResearchBehaviorSummary();
  const snapshot = attachBehaviorSummary(
    await generateResearchPipelineSnapshot({
    ...(preferences ? { preferences } : {}),
    source,
    artifactPath: RESEARCH_PIPELINE_ARTIFACT_PATH
    }),
    behaviorSummary
  );

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(RESEARCH_PIPELINE_JSON_PATH, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.writeFile(RESEARCH_PIPELINE_MARKDOWN_PATH, snapshot.markdown, "utf8");

  return snapshot;
}
