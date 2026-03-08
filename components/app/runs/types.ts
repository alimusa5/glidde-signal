export type RunRecord = {
  id: string;
  project_id: string;
  user_id: string;
  scope: "upload" | "project";
  upload_id: string | null;
  source_filter: "all" | "reviews" | "support" | "surveys";
  entry_count: number;
  status: "queued" | "processing" | "completed" | "failed";
  created_at: string;
  label: string | null;
};

export type UploadInfo = {
  id: string;
  source: string;
  created_at: string;
};

export type RunProblem = {
  id: string;
  run_id: string;
  rank: number;
  title: string;
  summary: string | null;
  mention_count: number;
  sources: string[];
  quotes: Array<{
    text: string;
    source: string;
    entry_id?: string;
    upload_id?: string;
  }>;
  created_at: string;
};

export type RunFeature = {
  id: string;
  run_id: string;
  feature: string;
  mention_count: number;
  dominant_problem: string | null;
  created_at: string;
};

export type DeltaItem = {
  title: string;
  prev_count?: number;
  curr_count?: number;
  delta?: number;
};

export type RunDeltaRow = {
  new_problems: DeltaItem[];
  worsening: DeltaItem[];
  improving: DeltaItem[];
  resolved: DeltaItem[];
};

export type RunDeltaDbRow = RunDeltaRow & {
  previous_run_id: string | null;
};

export type RunMemoRow = {
  content: string;
  created_at: string;
};

export type ProblemActionRow = {
  problem_id: string;
  suggested_action: string | null;
  first_check: string | null;
  owner_guess: string | null;
  expected_impact: string | null;
  created_at: string | null;
};
