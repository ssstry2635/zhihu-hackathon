export type SourceMode = 'mock' | 'live' | 'snapshot';
export const ANALYSIS_VERSION = 'analysis-v3-evidence-gaps';
export type Source = {
  id: string;
  kind: 'answer' | 'article' | 'comment';
  externalId?: string;
  truncated?: boolean;
  parentSourceId?: string;
  title: string;
  text: string;
  textKind: 'summary' | 'comment';
  authorName: string | null;
  url: string | null;
  relation: 'same_question' | 'related' | 'unknown';
  collectedAt: string;
};
export type Evidence = { sourceId: string; excerpt: string };
export type Category = {
  id: string;
  analysisId: string;
  type: 'dimension' | 'stance';
  name: string;
  description: string;
  discussionQuestion: string;
  sourceIds: string[];
  evidenceRefs: Evidence[];
  sampleCount: number;
  sampleRatio: number;
};
export function hasSufficientRoundtableViews(categories: Category[]) {
  return (
    categories.filter(
      (category) =>
        category.type === 'stance' &&
        category.sourceIds.length > 0 &&
        category.evidenceRefs.length > 0,
    ).length >= 2
  );
}
export type Finding = {
  id: string;
  text: string;
  categoryIds: string[];
  evidenceRefs: Evidence[];
};
export type Analysis = {
  id: string;
  topicId: string;
  title: string;
  sourceMode: SourceMode;
  generationMode: 'scripted' | 'live' | 'cached';
  scope: 'same_question_only' | 'related_topic';
  queries: string[];
  collectedAt: string;
  createdAt: string;
  version: string;
  model?: string;
  promptVersion?: string;
  sampleCount: number;
  commentCount: number;
  sources: Source[];
  categories: Category[];
  commonGround: Finding[];
  disagreements: Finding[];
  openQuestions: Finding[];
};
export type ContributionType =
  | 'opinion'
  | 'experience'
  | 'condition'
  | 'evidence';
export type Post = {
  id: string;
  analysisId: string;
  categoryId: string;
  authorId: string | null;
  authorName: string;
  content: string;
  contributionType: ContributionType;
  parentPostId: string | null;
  gapId: string | null;
  sourceIds: string[];
  externalEvidenceUrl: string | null;
  origin: 'seed' | 'user';
  voteCount: number;
  likedByMe: boolean;
  createdAt: string;
};
export type Role = {
  id: string;
  name: string;
  categoryId: string | null;
  description: string;
  color: string;
};
export type RoundMessage = {
  id: string;
  speakerRoleId: string;
  phase: 'opening' | 'statement' | 'exchange' | 'summary' | 'followup';
  content: string;
  replyToMessageId?: string;
  evidenceRefs: Evidence[];
};
export type Gap = {
  id: string;
  question: string;
  categoryId: string;
  supplementCount: number;
};
export type Roundtable = {
  id: string;
  analysisId: string;
  visitorId: string;
  generationMode: 'scripted' | 'live' | 'cached';
  roles: Role[];
  messages: RoundMessage[];
  gaps: Gap[];
  commonGround: Finding[];
  disagreements: Finding[];
  followupUsed: boolean;
  followupState?: 'pending' | 'failed';
};
export type Visitor = { id: string; displayName: string };
export type AppConfig = {
  liveAvailable: boolean;
  credentialConfigured: boolean;
  readiness: 'missing-secret' | 'unsupported-model' | 'configured-unverified';
  skillVersion: string;
  model: string | null;
  searchLimit: number;
  cacheMinutes: number;
};
export const contributionLabels: Record<ContributionType, string> = {
  opinion: '观点',
  experience: '亲身经历',
  condition: '适用条件',
  evidence: '证据补充',
};
