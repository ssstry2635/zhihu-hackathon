import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const visitors = sqliteTable(
  'visitors',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    createdAt: text('created_at').notNull(),
    sessionHash: text('session_hash'),
  },
  (t) => [uniqueIndex('idx_visitors_session').on(t.sessionHash)],
);
export const analyses = sqliteTable('analyses', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
});
export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    analysisId: text('analysis_id').notNull(),
    categoryId: text('category_id').notNull(),
    authorId: text('author_id'),
    authorName: text('author_name').notNull(),
    content: text('content').notNull(),
    contributionType: text('contribution_type').notNull(),
    parentId: text('parent_id'),
    gapId: text('gap_id'),
    sourceIds: text('source_ids').notNull().default('[]'),
    externalUrl: text('external_url'),
    origin: text('origin').notNull(),
    requestId: text('request_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_posts_room').on(t.analysisId, t.categoryId, t.createdAt),
    index('idx_posts_gap').on(t.gapId),
    uniqueIndex('idx_posts_request').on(t.authorId, t.requestId),
  ],
);
export const likes = sqliteTable(
  'likes',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.visitorId] })],
);
export const rounds = sqliteTable(
  'rounds',
  {
    id: text('id').primaryKey(),
    analysisId: text('analysis_id').notNull(),
    visitorId: text('visitor_id').notNull(),
    payload: text('payload').notNull(),
    followupState: text('followup_state').notNull().default('unused'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('idx_rounds_owner').on(t.analysisId, t.visitorId)],
);
export const roundTemplates = sqliteTable('round_templates', {
  analysisId: text('analysis_id').primaryKey(),
  payload: text('payload').notNull(),
});
export const cache = sqliteTable('request_cache', {
  key: text('key').primaryKey(),
  resultId: text('result_id').notNull(),
});

export const analysisJobs = sqliteTable(
  'analysis_jobs',
  {
    id: text('id').primaryKey(),
    visitorId: text('visitor_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').notNull(),
    stage: text('stage').notNull(),
    activeKey: text('active_key'),
    resultId: text('result_id'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_analysis_jobs_active').on(t.activeKey),
    index('idx_analysis_jobs_cache').on(t.fingerprint, t.status, t.updatedAt),
    index('idx_analysis_jobs_expiry').on(t.status, t.expiresAt),
  ],
);
