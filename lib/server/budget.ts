import { env, getDb } from '@/db';
import { AppError } from './http';
export const BUDGET_DEFAULTS = {
  daily: 120,
  visitorDaily: 20,
  visitorMinute: 6,
  concurrent: 2,
};
export function getCallLimits() {
  function value(raw: string | undefined, fallback: number, max: number) {
    if (raw === undefined || !raw.trim()) return fallback;
    if (!/^\d+$/.test(raw.trim()) || Number(raw) > max)
      throw new AppError(
        'BUDGET_CONFIG_INVALID',
        '实时调用限制配置有误，请联系团队检查。',
        503,
      );
    return Number(raw);
  }
  return {
    daily: value(env.ZHIHU_DAILY_CALL_LIMIT, BUDGET_DEFAULTS.daily, 10000),
    visitorDaily: value(
      env.ZHIHU_VISITOR_DAILY_CALL_LIMIT,
      BUDGET_DEFAULTS.visitorDaily,
      1000,
    ),
    visitorMinute: value(
      env.ZHIHU_VISITOR_MINUTE_CALL_LIMIT,
      BUDGET_DEFAULTS.visitorMinute,
      60,
    ),
    concurrent: value(
      env.ZHIHU_MAX_CONCURRENT_CALLS,
      BUDGET_DEFAULTS.concurrent,
      8,
    ),
  };
}
export function budgetDay(now: number) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
// One row reserves one upstream attempt. Failed/uncertain attempts still count.
// This single SQLite statement serializes admission across Worker instances.
export async function reserveCall(
  visitorId: string,
  operationKey: string | null = null,
) {
  const limits = getCallLimits(),
    now = Date.now(),
    day = budgetDay(now),
    db = getDb();
  await db
    .prepare(
      'UPDATE upstream_calls SET operation_key=NULL WHERE operation_key IS NOT NULL AND expires_at<=?',
    )
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const result = await db
    .prepare(`INSERT OR IGNORE INTO upstream_calls (id,visitor_id,day_key,started_at,expires_at,operation_key)
    SELECT ?,?,?,?,?,? WHERE
    (SELECT COUNT(*) FROM upstream_calls WHERE day_key=?)<? AND
    (SELECT COUNT(*) FROM upstream_calls WHERE day_key=? AND visitor_id=?)<? AND
    (SELECT COUNT(*) FROM upstream_calls WHERE visitor_id=? AND started_at>?)<? AND
    (SELECT COUNT(*) FROM upstream_calls WHERE finished_at IS NULL AND expires_at>?)<?`)
    .bind(
      id,
      visitorId,
      day,
      now,
      now + 70000,
      operationKey,
      day,
      limits.daily,
      day,
      visitorId,
      limits.visitorDaily,
      visitorId,
      now - 60000,
      limits.visitorMinute,
      now,
      limits.concurrent,
    )
    .run();
  if (result.meta.changes === 1) return id;
  const counts = await db
    .prepare(`SELECT
    (SELECT COUNT(*) FROM upstream_calls WHERE day_key=?) AS total,
    (SELECT COUNT(*) FROM upstream_calls WHERE day_key=? AND visitor_id=?) AS personal,
    (SELECT COUNT(*) FROM upstream_calls WHERE visitor_id=? AND started_at>?) AS recent`)
    .bind(day, day, visitorId, visitorId, now - 60000)
    .first<{ total: number; personal: number; recent: number }>();
  if ((counts?.total ?? 0) >= limits.daily)
    throw new AppError(
      'APP_DAILY_LIMIT',
      '今天的实时体验总额度已用完，可继续查看已有结果或预置演示。',
      429,
    );
  if ((counts?.personal ?? 0) >= limits.visitorDaily)
    throw new AppError(
      'VISITOR_DAILY_LIMIT',
      '当前访客今天的实时调用已达上限，可继续查看已有结果或预置演示。',
      429,
    );
  if ((counts?.recent ?? 0) >= limits.visitorMinute)
    throw new AppError(
      'VISITOR_RATE_LIMIT',
      '操作较频繁，请稍后再发起实时请求。已有结果和预置演示仍可使用。',
      429,
    );
  throw new AppError(
    'UPSTREAM_BUSY',
    '实时处理名额暂满，或相同内容正在生成。请稍后重试，已有结果仍可查看。',
    429,
  );
}
export async function releaseCall(id: string) {
  await getDb()
    .prepare(
      'UPDATE upstream_calls SET finished_at=?,operation_key=NULL WHERE id=?',
    )
    .bind(Date.now(), id)
    .run();
}
export async function withCallPermit<T>(
  visitorId: string,
  run: () => Promise<T>,
  operationKey: string | null = null,
) {
  const id = await reserveCall(visitorId, operationKey);
  try {
    return await run();
  } finally {
    await releaseCall(id);
  }
}
