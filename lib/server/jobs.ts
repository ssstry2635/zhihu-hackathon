import { getDb } from '@/db';
import type { AnalysisJob, AnalysisStart, JobStage } from '@/shared/jobs';
import { findTopic } from '@/shared/topics';
import { recordResult } from './history';
import { assert, errorInfo } from './http';
import { buildLiveAnalysis } from './analysis';
import { getZhihuConfig, assertLiveReady, SKILL_VERSION } from './zhihu';
// Coordinate this version with B when normalization/classification contracts change.
const DATA_VERSION = 'analysis-v2-budgeted';
const RUN_TIMEOUT_MS = 120_000;
const QUEUED_TIMEOUT_MS = 600_000;
const CACHE_MS = 3_600_000;
type Row = {
  id: string;
  visitor_id: string;
  topic_id: string;
  fingerprint: string;
  status: AnalysisJob['status'];
  stage: JobStage;
  result_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};
const db = () => getDb();
const iso = () => new Date().toISOString();
function publicJob(row: Row): AnalysisJob {
  return {
    id: row.id,
    topicId: row.topic_id,
    status: row.status,
    stage: row.stage,
    resultId: row.result_id,
    error: row.error ? JSON.parse(row.error) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
async function expireJobs() {
  const now = iso();
  const error = {
    code: 'JOB_EXPIRED',
    message:
      '任务等待超时，未自动重新采集或调用模型。可以使用预置演示，或明确发起新任务。',
    canUsePreset: true,
  };
  await db()
    .prepare(
      "UPDATE analysis_jobs SET status='failed',error=?,active_key=NULL,updated_at=? WHERE status IN ('queued','running') AND expires_at<=?",
    )
    .bind(JSON.stringify(error), now, now)
    .run();
}
export async function getJob(
  id: string,
  visitorId: string,
): Promise<AnalysisJob> {
  await expireJobs();
  const row = await db()
    .prepare('SELECT * FROM analysis_jobs WHERE id=? AND visitor_id=?')
    .bind(id, visitorId)
    .first<Row>();
  assert(
    row,
    'NOT_FOUND',
    '没有找到这个任务，请使用发起任务时的浏览器身份。',
    404,
  );
  return publicJob(row);
}
export async function startAnalysis(
  mode: 'mock' | 'live',
  requestId: string,
  visitorId: string,
  topicId = 'ai-coding',
): Promise<AnalysisStart> {
  const topic = findTopic(topicId);
  assert(topic, 'NOT_FOUND', '这个议题尚未开放，请选择列表中的议题。', 404);
  if (mode === 'mock') {
    await recordResult(visitorId, topic.preset.id);
    return { resultId: topic.preset.id, cached: true };
  }
  assert(
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId),
    'INVALID_REQUEST_ID',
    '请求标识格式不正确。',
  );
  await expireJobs();
  const previous = await db()
    .prepare('SELECT * FROM analysis_jobs WHERE id=? AND visitor_id=?')
    .bind(requestId, visitorId)
    .first<Row>();
  if (previous) {
    assert(
      previous.topic_id === topicId,
      'REQUEST_CONFLICT',
      '同一请求标识不能用于不同议题。',
      409,
    );
    return { jobId: previous.id, job: publicJob(previous) };
  }
  assertLiveReady();
  const fingerprint = JSON.stringify([
    topic.id,
    topic.title,
    'related-search:10',
    SKILL_VERSION,
    DATA_VERSION,
    getZhihuConfig().model,
  ]);
  const activeKey = fingerprint;
  const current = await db()
    .prepare(
      "SELECT * FROM analysis_jobs WHERE fingerprint=? AND status IN ('queued','running')",
    )
    .bind(activeKey)
    .first<Row>();
  if (current) {
    assert(
      current.visitor_id === visitorId,
      'TOPIC_BUSY',
      '这个议题正在整理，稍后可复用结果，也可以先看预置演示。',
      409,
    );
    return { jobId: current.id, job: publicJob(current) };
  }
  const cached = await db()
    .prepare(
      "SELECT result_id FROM analysis_jobs WHERE fingerprint=? AND status='succeeded' AND updated_at>? ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(fingerprint, new Date(Date.now() - CACHE_MS).toISOString())
    .first<{ result_id: string }>();
  if (cached) {
    await recordResult(visitorId, cached.result_id);
    return { resultId: cached.result_id, cached: true };
  }
  const now = iso();
  await db()
    .prepare(
      "INSERT OR IGNORE INTO analysis_jobs (id,visitor_id,topic_id,fingerprint,status,stage,active_key,created_at,updated_at,expires_at) VALUES (?,?,?,?,'queued','queued',?,?,?,?)",
    )
    .bind(
      requestId,
      visitorId,
      topicId,
      fingerprint,
      activeKey,
      now,
      now,
      new Date(Date.now() + QUEUED_TIMEOUT_MS).toISOString(),
    )
    .run();
  // Unique active_key also handles simultaneous clicks from multiple tabs.
  const row = await db()
    .prepare(
      'SELECT * FROM analysis_jobs WHERE active_key=? OR (id=? AND visitor_id=?) LIMIT 1',
    )
    .bind(activeKey, requestId, visitorId)
    .first<Row>();
  assert(row, 'REQUEST_CONFLICT', '请求标识已被使用，请重新发起任务。', 409);
  assert(
    row.visitor_id === visitorId,
    'TOPIC_BUSY',
    '这个议题正在整理，稍后可复用结果。',
    409,
  );
  return { jobId: row.id, job: publicJob(row) };
}
export async function runAnalysisJob(
  id: string,
  visitorId: string,
): Promise<AnalysisJob> {
  const job = await getJob(id, visitorId);
  if (job.status !== 'queued') return job;
  const startedAt = iso();
  const claim = await db()
    .prepare(
      "UPDATE analysis_jobs SET status='running',stage='collecting',updated_at=?,expires_at=? WHERE id=? AND visitor_id=? AND status='queued'",
    )
    .bind(
      startedAt,
      new Date(Date.now() + RUN_TIMEOUT_MS).toISOString(),
      id,
      visitorId,
    )
    .run();
  if (claim.meta.changes !== 1) return getJob(id, visitorId);
  try {
    assertLiveReady();
    const onStage = async (stage: JobStage) => {
      const changed = await db()
        .prepare(
          "UPDATE analysis_jobs SET stage=?,updated_at=? WHERE id=? AND status='running' AND expires_at>?",
        )
        .bind(stage, iso(), id, iso())
        .run();
      assert(
        changed.meta.changes === 1,
        'JOB_EXPIRED',
        '任务已过期，未重复调用模型。',
        409,
      );
    };
    // Await execution inside POST. No durable queue is bound to this Worker;
    // unawaited promises or waitUntil cannot guarantee completion after disconnect.
    const topic = findTopic(job.topicId);
    assert(topic, 'NOT_FOUND', '这个议题尚未开放。', 404);
    const analysis = await buildLiveAnalysis(
      topic.title,
      onStage,
      topic.id,
      visitorId,
    );
    const finishedAt = iso();
    await db().batch([
      db()
        .prepare(
          "INSERT INTO analyses (id,payload,created_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM analysis_jobs WHERE id=? AND status='running' AND expires_at>?)",
        )
        .bind(
          analysis.id,
          JSON.stringify(analysis),
          analysis.collectedAt,
          id,
          finishedAt,
        ),
      db()
        .prepare(
          "UPDATE analysis_jobs SET status='succeeded',stage='done',result_id=?,active_key=NULL,updated_at=? WHERE id=? AND status='running' AND expires_at>?",
        )
        .bind(analysis.id, finishedAt, id, finishedAt),
      db()
        .prepare(
          "INSERT INTO analysis_visits (visitor_id,analysis_id,seen_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM analysis_jobs WHERE id=? AND status='succeeded') ON CONFLICT(visitor_id,analysis_id) DO UPDATE SET seen_at=excluded.seen_at",
        )
        .bind(visitorId, analysis.id, finishedAt, id),
    ]);
  } catch (error) {
    await db()
      .prepare(
        "UPDATE analysis_jobs SET status='failed',error=?,active_key=NULL,updated_at=? WHERE id=? AND status='running'",
      )
      .bind(
        JSON.stringify({ ...errorInfo(error), canUsePreset: true }),
        iso(),
        id,
      )
      .run();
  }
  return getJob(id, visitorId);
}

export async function recentJobs(visitorId: string): Promise<AnalysisJob[]> {
  await expireJobs();
  const { results } = await db()
    .prepare(
      'SELECT * FROM analysis_jobs WHERE visitor_id=? ORDER BY created_at DESC,id DESC LIMIT 20',
    )
    .bind(visitorId)
    .all<Row>();
  return results.map(publicJob);
}
