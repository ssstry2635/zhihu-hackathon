import { getDb } from '@/db';
import { ensureDemo, getAnalysis } from '@/lib/server/analysis';
import {
  getPost,
  listPosts,
  createPost,
  setLike,
  visitorFor,
  renameVisitor,
} from '@/lib/server/forum';
import { startRound, getRound, followup } from '@/lib/server/roundtable';
import { getZhihuConfig } from '@/lib/server/zhihu';
import { startAnalysis, getJob, runAnalysisJob } from '@/lib/server/jobs';
import {
  assert,
  body,
  checkOrigin,
  fail,
  json,
  stringField,
} from '@/lib/server/http';
import { TOPIC_TITLE } from '@/shared/demo';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  let cookie: string | undefined;
  try {
    const method = request.method,
      url = new URL(request.url),
      path = url.pathname.slice(5).split('/').map(decodeURIComponent);
    if (method !== 'GET') checkOrigin(request);
    if (method === 'GET' && path[0] === 'config') return json(getZhihuConfig());
    await ensureDemo();
    const session = await visitorFor(request);
    cookie = session.cookie;
    const visitor = session.visitor;
    let response: Response;
    if (path[0] === 'visitors' && path[1] === 'session') {
      response =
        method === 'POST'
          ? json(
              await renameVisitor(
                visitor.id,
                (await body(request)).displayName,
              ),
            )
          : json(visitor);
    } else if (method === 'POST' && path[0] === 'topics' && path.length === 1) {
      const b = await body(request);
      assert(
        b.title === TOPIC_TITLE,
        'DEMO_TOPIC_ONLY',
        '当前 Demo 仅开放预置议题。',
      );
      response = json({ id: 'ai-coding', title: TOPIC_TITLE, url: null });
    } else if (
      method === 'POST' &&
      path[0] === 'topics' &&
      path[1] === 'ai-coding' &&
      path[2] === 'analyses' &&
      path.length === 3
    ) {
      const b = await body(request);
      assert(
        b.mode === 'mock' || b.mode === 'live',
        'INVALID_MODE',
        '请选择有效的来源模式。',
      );
      const result = await startAnalysis(
        b.mode,
        b.mode === 'mock' ? '' : stringField(b.requestId, '请求标识', 100),
        visitor.id,
      );
      response = json(result, 'jobId' in result ? 202 : 200);
    } else if (path[0] === 'jobs' && path.length === 2 && method === 'GET') {
      response = json(await getJob(path[1], visitor.id));
    } else if (
      path[0] === 'jobs' &&
      path[2] === 'run' &&
      path.length === 3 &&
      method === 'POST'
    ) {
      const job = await runAnalysisJob(path[1], visitor.id);
      response = json(
        job,
        job.status === 'running' || job.status === 'queued' ? 202 : 200,
      );
    } else if (path[0] === 'analyses' && path.length === 2 && method === 'GET')
      response = json(await getAnalysis(path[1]));
    else if (
      path[0] === 'analyses' &&
      path[2] === 'categories' &&
      path[4] === 'posts' &&
      path.length === 5
    ) {
      if (method === 'GET')
        response = json(
          await listPosts(
            path[1],
            path[3],
            visitor.id,
            url.searchParams.get('cursor'),
            url.searchParams.get('gapId'),
          ),
        );
      else {
        assert(method === 'POST', 'METHOD_NOT_ALLOWED', '不支持此操作。', 405);
        response = json(
          await createPost(path[1], path[3], visitor, await body(request)),
          201,
        );
      }
    } else if (path[0] === 'gaps' && path.length === 2 && method === 'GET') {
      const gapId = path[1],
        roundId = gapId.split('~')[0];
      const row = await getDb()
        .prepare('SELECT payload,analysis_id FROM rounds WHERE id=?')
        .bind(roundId)
        .first<{ payload: string; analysis_id: string }>();
      assert(row, 'NOT_FOUND', '待解问题不存在。', 404);
      const gap = JSON.parse(row.payload).gaps.find(
        (g: { id: string }) => g.id === gapId,
      );
      assert(gap, 'NOT_FOUND', '待解问题不存在。', 404);
      const count = await getDb()
        .prepare(
          'SELECT COUNT(*) AS n FROM posts WHERE gap_id=? AND origin=? AND parent_id IS NULL',
        )
        .bind(gapId, 'user')
        .first<{ n: number }>();
      response = json({
        ...gap,
        analysisId: row.analysis_id,
        supplementCount: count?.n ?? 0,
      });
    } else if (path[0] === 'posts' && path[2] === 'like' && method === 'PUT')
      response = json(
        await setLike(path[1], visitor.id, (await body(request)).liked),
      );
    else if (path[0] === 'posts' && path.length === 2 && method === 'GET')
      response = json(await getPost(path[1], visitor.id));
    else if (
      path[0] === 'analyses' &&
      path[2] === 'roundtables' &&
      method === 'POST'
    )
      response = json(await startRound(path[1], visitor.id));
    else if (path[0] === 'roundtables' && path.length === 2 && method === 'GET')
      response = json(await getRound(path[1], visitor.id));
    else if (
      path[0] === 'roundtables' &&
      path[2] === 'followups' &&
      method === 'POST'
    )
      response = json(
        await followup(path[1], visitor.id, (await body(request)).question),
      );
    else
      response = Response.json(
        { error: { code: 'NOT_FOUND', message: '接口不存在。' } },
        { status: 404 },
      );
    if (cookie) response.headers.set('Set-Cookie', cookie);
    return response;
  } catch (error) {
    const response = fail(error);
    if (cookie) response.headers.set('Set-Cookie', cookie);
    return response;
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
