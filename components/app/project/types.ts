export type UploadResult = { uploadId: string; count: number };

export type LatestUploadSummary = {
  uploadId: string;
  source: string;
  createdAt: string;
  count: number;
};

export type RunHistoryItem = {
  id: string;
  scope: "upload" | "project";
  source_filter: "all" | "reviews" | "support" | "surveys";
  entry_count: number;
  status: "queued" | "processing" | "completed" | "failed";
  created_at: string;
};

export type RunMemoMeta = {
  run_id: string;
  created_at: string;
};

export type MemoMetaByRunId = Record<string, { created_at: string }>;

export type UpgradePayload = {
  title: string;
  starterIncludes: string[];
  proUnlocks: string[];
  cta: string;
};

export type EntitlementsPayload = {
  plan: "starter" | "pro";
  isPro: boolean;
  runsUsedThisPeriod?: number | null;
  runsLimit?: number | null;
  nextResetAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type RunCreateSuccess = {
  runId: string;
  entitlements?: EntitlementsPayload;
};

export type RunCreateError = {
  code?: string;
  error?: string;
  entitlements?: EntitlementsPayload;
  upgrade?: UpgradePayload;
  waitSeconds?: number;
};
