import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const sql = new DatabaseSync(':memory:');
for (const file of (await fs.readdir('drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sql.exec(await fs.readFile('drizzle/' + file, 'utf8'));
const env = { ZHIHU_ACCESS_SECRET: 'fixture-only-not-a-real-credential' };
const db = {
  prepare(query) {
    let values = [];
    const execute = () => ({
      meta: { changes: Number(sql.prepare(query).run(...values).changes) },
    });
    const statement = {
      bind(...args) {
        values = args;
        return statement;
      },
      async first() {
        return sql.prepare(query).get(...values) || null;
      },
      async all() {
        return { results: sql.prepare(query).all(...values) };
      },
      async run() {
        return execute();
      },
      execute,
    };
    return statement;
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results = statements.map((s) => s.execute());
      sql.exec('COMMIT');
      return results;
    } catch (e) {
      sql.exec('ROLLBACK');
      throw e;
    }
  },
};
let requestCount = 0;
let upstream = () => {
  throw Error('No fixture supplied; network is forbidden.');
};
const context = vm.createContext({
  console,
  URL,
  Response,
  Request,
  Headers,
  AbortSignal,
  Error,
  TextEncoder,
  Uint8Array,
  crypto,
  fetch: (...args) => {
    requestCount++;
    return upstream(...args);
  },
});
const modules = new Map();
async function load(file) {
  if (modules.has(file)) return modules.get(file);
  if (file === '@/db') {
    const m = new vm.SyntheticModule(
      ['env', 'getDb'],
      function () {
        this.setExport('env', env);
        this.setExport('getDb', () => db);
      },
      { context },
    );
    modules.set(file, m);
    return m;
  }
  const code = ts.transpileModule(await fs.readFile(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const m = new vm.SourceTextModule(code, { context, identifier: file });
  modules.set(file, m);
  await m.link((spec, ref) => {
    if (spec === '@/db') return load(spec);
    const target = spec.startsWith('@/')
      ? path.resolve(spec.slice(2))
      : path.resolve(path.dirname(ref.identifier), spec);
    return load(target.endsWith('.ts') ? target : target + '.ts');
  });
  return m;
}
async function moduleAt(file) {
  const m = await load(path.resolve(file));
  if (m.status === 'linked') await m.evaluate();
  return m.namespace;
}
const zhihu = await moduleAt('lib/server/zhihu.ts');
const jobs = await moduleAt('lib/server/jobs.ts');
const route = await moduleAt('app/api/[...path]/route.ts');
const sourceText = '学习需要成本，也可能节省时间。';
const searchFixture = {
  Code: 0,
  Data: {
    Items: [
      {
        ContentType: 'Answer',
        ContentID: 'fixture-1',
        ContentText: sourceText,
        Url: 'https://www.zhihu.com/question/1/answer/2?utm_source=fixture',
        CommentInfoList: [{ Content: '适合有具体任务的人。' }],
      },
    ],
  },
};
const modelFixture = {
  categories: [
    {
      id: 'cost',
      type: 'dimension',
      name: '学习投入',
      description: '比较学习与节省的时间',
      discussionQuestion: '投入多少时间合适？',
      sourceIds: ['answer:fixture-1'],
      evidenceRefs: [{ sourceId: 'answer:fixture-1', excerpt: '学习需要成本' }],
    },
  ],
  commonGround: [],
  disagreements: [],
  openQuestions: ['如何衡量时间成本？'],
};
function success(url, init) {
  assert.equal(new URL(url).origin, 'https://developer.zhihu.com');
  assert.equal(init.headers.Authorization, 'Bearer ' + env.ZHIHU_ACCESS_SECRET);
  assert(
    Math.abs(Number(init.headers['X-Request-Timestamp']) - Date.now() / 1000) <
      5,
  );
  assert.equal(init.redirect, 'error');
  if (init.method === 'GET') {
    assert.equal(new URL(url).searchParams.get('Count'), '10');
    return Response.json(searchFixture);
  }
  assert.deepEqual(Object.keys(JSON.parse(init.body)).sort(), [
    'messages',
    'model',
    'stream',
  ]);
  return Response.json({
    choices: [{ message: { content: JSON.stringify(modelFixture) } }],
  });
}
const checks = [];
const check = async (name, run) => {
  await run();
  checks.push(name);
};
const clear = () => {
  sql.exec('DELETE FROM analysis_jobs');
  requestCount = 0;
};
await check(
  'no credential: no upstream request; configuration does not claim verification',
  async () => {
    delete env.ZHIHU_ACCESS_SECRET;
    assert.equal(zhihu.getZhihuConfig().readiness, 'missing-secret');
    await assert.rejects(jobs.startAnalysis('live', crypto.randomUUID(), 'a'), {
      code: 'LIVE_NOT_CONFIGURED',
    });
    assert.equal(requestCount, 0);
    env.ZHIHU_ACCESS_SECRET = 'fixture-only-not-a-real-credential';
    assert.equal(zhihu.getZhihuConfig().readiness, 'configured-unverified');
    assert(
      !JSON.stringify(zhihu.getZhihuConfig()).includes(env.ZHIHU_ACCESS_SECRET),
    );
    env.ZHIHU_MODEL = 'invalid';
    assert.equal(zhihu.getZhihuConfig().liveAvailable, false);
    await assert.rejects(jobs.startAnalysis('live', crypto.randomUUID(), 'a'), {
      code: 'MODEL_NOT_SUPPORTED',
    });
    delete env.ZHIHU_MODEL;
  },
);
await check(
  'concurrent create / execute: one task and one upstream pair',
  async () => {
    clear();
    const id = crypto.randomUUID();
    const [a, b] = await Promise.all([
      jobs.startAnalysis('live', id, 'a'),
      jobs.startAnalysis('live', crypto.randomUUID(), 'a'),
    ]);
    assert.equal(a.jobId, b.jobId);
    assert.equal(requestCount, 0);
    let unblock;
    let collecting;
    const entered = new Promise((resolve) => {
      collecting = resolve;
    });
    const blocked = new Promise((resolve) => {
      unblock = resolve;
    });
    upstream = async (url, init) => {
      if (init.method === 'GET') {
        collecting();
        await blocked;
      }
      return success(url, init);
    };
    const run = jobs.runAnalysisJob(a.jobId, 'a');
    await entered;
    assert.equal((await jobs.getJob(a.jobId, 'a')).stage, 'collecting');
    assert.equal((await jobs.runAnalysisJob(a.jobId, 'a')).status, 'running');
    await assert.rejects(jobs.getJob(a.jobId, 'b'), { code: 'NOT_FOUND' });
    await assert.rejects(jobs.runAnalysisJob(a.jobId, 'b'), {
      code: 'NOT_FOUND',
    });
    unblock();
    const done = await run;
    assert.equal(done.status, 'succeeded');
    assert.equal(requestCount, 2);
    assert.equal(
      (await jobs.runAnalysisJob(a.jobId, 'a')).resultId,
      done.resultId,
    );
    assert.equal((await jobs.startAnalysis('live', id, 'a')).jobId, a.jobId);
    const cached = await jobs.startAnalysis('live', crypto.randomUUID(), 'b');
    assert.equal(cached.resultId, done.resultId);
    assert.equal(requestCount, 2);
    assert(
      sql.prepare('SELECT payload FROM analyses WHERE id=?').get(done.resultId),
    );
    // Different model must not reuse the previous cache.
    env.ZHIHU_MODEL = 'zhida-thinking-1p5';
    assert(
      'jobId' in (await jobs.startAnalysis('live', crypto.randomUUID(), 'b')),
    );
    delete env.ZHIHU_MODEL;
  },
);
await check(
  'HTTP and business errors, timeouts, malformed responses: never retry',
  async () => {
    for (const [reply, code] of [
      [() => new Response('', { status: 401 }), 'ZHIHU_AUTH_FAILED'],
      [() => new Response('', { status: 403 }), 'ZHIHU_AUTH_FAILED'],
      [() => new Response('', { status: 429 }), 'ZHIHU_RATE_LIMITED'],
      [() => new Response('', { status: 500 }), 'ZHIHU_UNAVAILABLE'],
      [() => Response.json({ Code: 20001 }), 'ZHIHU_AUTH_FAILED'],
      [() => Response.json({ Code: 30001 }), 'ZHIHU_RATE_LIMITED'],
      [() => new Response('<html>upstream</html>'), 'ZHIHU_RESPONSE_INVALID'],
      [
        () => {
          const e = new Error('timeout');
          e.name = 'TimeoutError';
          throw e;
        },
        'ZHIHU_TIMEOUT',
      ],
    ]) {
      requestCount = 0;
      upstream = reply;
      await assert.rejects(zhihu.searchZhihu('AI 编程'), { code });
      assert.equal(requestCount, 1);
    }
    assert.equal(
      zhihu.normalizeSearch({
        Code: 0,
        Data: {
          Items: [
            null,
            false,
            { ContentType: 'Answer', ContentID: {}, ContentText: 'bad' },
            { ContentType: 'Answer', ContentID: 'x', ContentText: {} },
          ],
        },
      }).length,
      0,
    );
  },
);
await check(
  'empty search / invalid model output produce explicit durable failures',
  async () => {
    for (const invalidModel of [false, true]) {
      clear();
      upstream = (url, init) =>
        invalidModel
          ? init.method === 'GET'
            ? Response.json(searchFixture)
            : Response.json({ choices: [{ message: { content: '{}' } }] })
          : Response.json({ Code: 0, Data: { Items: [] } });
      const start = await jobs.startAnalysis('live', crypto.randomUUID(), 'a');
      const failed = await jobs.runAnalysisJob(start.jobId, 'a');
      assert.equal(failed.status, 'failed');
      assert.equal(
        failed.error.code,
        invalidModel ? 'MODEL_OUTPUT_INVALID' : 'EMPTY_SOURCES',
      );
      assert(failed.error.canUsePreset);
      const before = requestCount;
      await jobs.runAnalysisJob(start.jobId, 'a');
      assert.equal(requestCount, before);
    }
  },
);
await check(
  'expired work is terminal; late model results cannot overwrite it',
  async () => {
    clear();
    let unblock, reached;
    const ready = new Promise((resolve) => {
      reached = resolve;
    });
    const blocked = new Promise((resolve) => {
      unblock = resolve;
    });
    upstream = async (url, init) => {
      if (init.method === 'POST') {
        reached();
        await blocked;
      }
      return success(url, init);
    };
    const start = await jobs.startAnalysis('live', crypto.randomUUID(), 'a');
    const run = jobs.runAnalysisJob(start.jobId, 'a');
    await ready;
    assert.equal((await jobs.getJob(start.jobId, 'a')).stage, 'classifying');
    sql
      .prepare('UPDATE analysis_jobs SET expires_at=? WHERE id=?')
      .run('2000-01-01T00:00:00.000Z', start.jobId);
    assert.equal(
      (await jobs.getJob(start.jobId, 'a')).error.code,
      'JOB_EXPIRED',
    );
    unblock();
    assert.equal((await run).status, 'failed');
    assert.equal((await jobs.getJob(start.jobId, 'a')).resultId, null);
  },
);
await check(
  'route contract: 202 create + owner-only GET/run + 200 cached/preset',
  async () => {
    clear();
    upstream = success;
    let cookie = '';
    async function call(
      path,
      method = 'GET',
      data,
      expected = 200,
      own = true,
    ) {
      const req = new Request('http://localhost/api' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(own && cookie ? { Cookie: cookie } : {}),
          Origin: 'http://localhost',
        },
        ...(method === 'GET' || data === undefined
          ? {}
          : { body: JSON.stringify(data) }),
      });
      const res = await route[method](req);
      assert.equal(res.status, expected, await res.clone().text());
      if (own && res.headers.has('set-cookie'))
        cookie = res.headers.get('set-cookie').split(';')[0];
      return (await res.json()).data;
    }
    await call('/visitors/session');
    const job = await call(
      '/topics/ai-coding/analyses',
      'POST',
      { mode: 'live', requestId: crypto.randomUUID() },
      202,
    );
    await call('/jobs/' + job.jobId, 'GET', undefined, 404, false);
    await call('/jobs/' + job.jobId + '/run', 'POST', {}, 404, false);
    const done = await call('/jobs/' + job.jobId + '/run', 'POST', {});
    assert.equal(done.status, 'succeeded');
    assert.equal((await call('/jobs/' + job.jobId)).resultId, done.resultId);
    assert.equal(
      (
        await call('/topics/ai-coding/analyses', 'POST', {
          mode: 'live',
          requestId: crypto.randomUUID(),
        })
      ).resultId,
      done.resultId,
    );
    assert.equal(
      (await call('/topics/ai-coding/analyses', 'POST', { mode: 'mock' }))
        .resultId,
      'demo-v1',
    );
    await call(
      '/topics/ai-coding/analyses/extra',
      'POST',
      { mode: 'mock' },
      404,
    );
  },
);
sql.close();
console.log(
  JSON.stringify(
    { status: 'passed', officialNetworkRequests: 0, checks },
    null,
    2,
  ),
);
