export type JobStage =
  | 'queued'
  | 'collecting'
  | 'classifying'
  | 'saving'
  | 'done';
export type JobError = { code: string; message: string; canUsePreset: boolean };
export type AnalysisJob = {
  id: string;
  topicId: string;
  title: string;
  sourceUrl: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: JobStage;
  resultId: string | null;
  error: JobError | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
export type AnalysisStart =
  | { resultId: string; cached: boolean }
  | { jobId: string; job: AnalysisJob };
export const jobStageLabels: Record<JobStage, string> = {
  queued: '准备采集',
  collecting: '检索知乎材料',
  classifying: '整理观点与核对引用',
  saving: '保存本次讨论快照',
  done: '整理完成',
};

export type HistoryResult = {
  id: string;
  topicId: string;
  title: string;
  sourceUrl?: string | null;
  sourceMode: 'mock' | 'live' | 'snapshot';
  collectedAt: string;
  lastSeenAt: string;
};
export type AnalysisHistory = { results: HistoryResult[]; jobs: AnalysisJob[] };
