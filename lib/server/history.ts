import { getDb } from '@/db';
import type { HistoryResult } from '@/shared/jobs';
export async function recordResult(visitorId: string, analysisId: string) {
  await getDb()
    .prepare(
      'INSERT INTO analysis_visits (visitor_id,analysis_id,seen_at) VALUES (?,?,?) ON CONFLICT(visitor_id,analysis_id) DO UPDATE SET seen_at=excluded.seen_at',
    )
    .bind(visitorId, analysisId, new Date().toISOString())
    .run();
}
export async function recentResults(
  visitorId: string,
): Promise<HistoryResult[]> {
  const { results } = await getDb()
    .prepare(`SELECT a.id,
    json_extract(a.payload,'$.topicId') AS topicId, json_extract(a.payload,'$.title') AS title,
    json_extract(a.payload,'$.sourceMode') AS sourceMode, json_extract(a.payload,'$.collectedAt') AS collectedAt,
    v.seen_at AS lastSeenAt FROM analysis_visits v JOIN analyses a ON a.id=v.analysis_id
    WHERE v.visitor_id=? ORDER BY v.seen_at DESC,a.id DESC LIMIT 20`)
    .bind(visitorId)
    .all<HistoryResult>();
  return results;
}
