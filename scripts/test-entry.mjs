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
const env = {
  ZHIHU_ACCESS_SECRET: 'fixture-only-not-a-real-credential',
  ZHIHU_DAILY_CALL_LIMIT: '1000',
  ZHIHU_VISITOR_DAILY_CALL_LIMIT: '500',
  ZHIHU_VISITOR_MINUTE_CALL_LIMIT: '60',
  ZHIHU_MAX_CONCURRENT_CALLS: '8',
};
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
const loading = new Map();
function load(file) {
  if (!loading.has(file)) loading.set(file, createModule(file));
  return loading.get(file);
}
async function createModule(file) {
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

  return m;
}
async function moduleAt(file) {
  const m = await load(path.resolve(file));
  if (m.status === 'unlinked')
    await m.link((spec, ref) => {
      if (spec === '@/db') return load(spec);
      const target = spec.startsWith('@/')
        ? path.resolve(spec.slice(2))
        : path.resolve(path.dirname(ref.identifier), spec);
      return load(target.endsWith('.ts') ? target : target + '.ts');
    });
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
  openQuestions: [
    {
      text: '如何衡量时间成本？',
      categoryIds: ['cost'],
      evidenceRefs: [{ sourceId: 'answer:fixture-1', excerpt: '学习需要成本' }],
    },
  ],
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
  sql.exec(
    'DELETE FROM analysis_jobs; DELETE FROM upstream_calls; DELETE FROM analysis_visits',
  );
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
await check(
  'three topics: coherent snapshots, insufficient-view gate, scripted rounds, followups and private history',
  async () => {
    clear();
    upstream = () => {
      throw Error('Preset must not call upstream');
    };
    const registry = await moduleAt('shared/topics.ts');
    const validation = await moduleAt('lib/server/analysis.ts');
    const rounds = await moduleAt('lib/server/roundtable.ts');
    function client() {
      let cookie = '';
      return async (path, method = 'GET', data, expected = 200) => {
        const req = new Request('http://localhost/api' + path, {
          method,
          headers: {
            Origin: 'http://localhost',
            ...(cookie ? { Cookie: cookie } : {}),
            'Content-Type': 'application/json',
          },
          ...(method === 'GET' || data === undefined
            ? {}
            : { body: JSON.stringify(data) }),
        });
        const res = await route[method](req),
          value = await res.json();
        assert.equal(res.status, expected, JSON.stringify(value));
        if (res.headers.has('set-cookie'))
          cookie = res.headers.get('set-cookie').split(';')[0];
        return value.data ?? value;
      };
    }
    const a = client(),
      b = client();
    await a('/visitors/session');
    await b('/visitors/session');
    assert.equal((await a('/topics')).length, 3);
    for (const topic of registry.topics) {
      const result = await a('/topics/' + topic.id + '/analyses', 'POST', {
        mode: 'mock',
      });
      assert.equal(result.resultId, topic.preset.id);
      const analysis = await a('/analyses/' + result.resultId);
      assert.equal(analysis.title, topic.title);
      assert.equal(analysis.topicId, topic.id);
      assert.equal(analysis.scope, 'same_question_only');
      assert(analysis.queries.includes(topic.title));
      assert(analysis.version);
      assert(
        analysis.sources.every(
          (source) =>
            source.textKind ===
            (source.kind === 'comment' ? 'comment' : 'summary'),
        ),
      );
      assert(
        analysis.categories.every(
          (category) => category.analysisId === analysis.id,
        ),
      );
      for (const finding of [
        ...analysis.commonGround,
        ...analysis.disagreements,
        ...analysis.openQuestions,
      ]) {
        assert(finding.categoryIds.length > 0);
        assert(finding.evidenceRefs.length > 0);
        assert(
          finding.categoryIds.every((categoryId) =>
            analysis.categories.some((category) => category.id === categoryId),
          ),
        );
        assert(
          finding.evidenceRefs.every((evidence) =>
            analysis.sources.some(
              (source) =>
                source.id === evidence.sourceId &&
                source.text.includes(evidence.excerpt),
            ),
          ),
        );
      }
      assert.equal(
        validation.validateAnalysis(
          analysis,
          analysis.sources,
          analysis.id,
          analysis.title,
          topic.id,
        ).sampleCount,
        analysis.sampleCount,
      );
      const round = await a(
        '/analyses/' + analysis.id + '/roundtables',
        'POST',
        {},
      );
      assert.equal(round.generationMode, 'scripted');
      assert.equal(round.analysisId, analysis.id);
      assert.equal(rounds.validateRound(round, analysis).messages.length, 8);
      assert(
        round.gaps.every((g) =>
          analysis.categories.some(
            (c) => c.id === g.categoryId && c.type === 'dimension',
          ),
        ),
      );
      const follow = await a(
        '/roundtables/' + round.id + '/followups',
        'POST',
        { question: '需要哪些适用条件？' },
      );
      assert(follow.messages.at(-1).content.includes(topic.title));
      assert.equal(follow.messages.length, 10);
    }
    const insufficient = structuredClone(registry.topics[0].preset);
    insufficient.id = 'synthetic-insufficient-evidence';
    insufficient.categories = insufficient.categories
      .filter(
        (category) =>
          category.type === 'dimension' ||
          ['start', 'foundation'].includes(category.id),
      )
      .map((category) => ({
        ...category,
        analysisId: insufficient.id,
        evidenceRefs: category.id === 'foundation' ? [] : category.evidenceRefs,
      }));
    sql
      .prepare('INSERT INTO analyses(id,payload,created_at) VALUES (?,?,?)')
      .run(
        insufficient.id,
        JSON.stringify(insufficient),
        insufficient.createdAt,
      );
    const blockedRound = await a(
      '/analyses/' + insufficient.id + '/roundtables',
      'POST',
      {},
      422,
    );
    assert.equal(blockedRound.error.code, 'INSUFFICIENT_VIEWS');
    assert.equal((await a('/history')).results.length, 3);
    assert.equal((await b('/history')).results.length, 0);
    await b('/analyses/' + registry.topics[1].preset.id);
    assert.equal((await b('/history')).results[0].topicId, 'remote-work');
    assert.equal((await b('/history')).results.length, 1);
    const requestId = crypto.randomUUID();
    const queued = await a(
      '/topics/remote-work/analyses',
      'POST',
      { mode: 'live', requestId },
      202,
    );
    assert.equal(queued.job.topicId, 'remote-work');
    assert.equal((await a('/history')).jobs[0].id, queued.jobId);
    assert.equal((await b('/history')).jobs.length, 0);
    await b('/jobs/' + queued.jobId, 'GET', undefined, 404);
    const collision = await b(
      '/topics/remote-work/analyses',
      'POST',
      { mode: 'live', requestId: crypto.randomUUID() },
      409,
    );
    assert.equal(collision.error.code, 'TOPIC_BUSY');
    assert(!JSON.stringify(collision).includes(queued.jobId));
    const mismatch = await a(
      '/topics/ai-homework/analyses',
      'POST',
      { mode: 'live', requestId },
      409,
    );
    assert.equal(mismatch.error.code, 'REQUEST_CONFLICT');
    await a('/topics/missing/analyses', 'POST', { mode: 'mock' }, 404);
    assert.equal(requestCount, 0);
  },
);
const budget = await moduleAt('lib/server/budget.ts');
function budgetSetup(overrides = {}) {
  sql.exec('DELETE FROM upstream_calls');
  Object.assign(
    env,
    {
      ZHIHU_DAILY_CALL_LIMIT: '1000',
      ZHIHU_VISITOR_DAILY_CALL_LIMIT: '500',
      ZHIHU_VISITOR_MINUTE_CALL_LIMIT: '60',
      ZHIHU_MAX_CONCURRENT_CALLS: '8',
    },
    overrides,
  );
}
await check('atomic global daily limit and Shanghai day boundary', async () => {
  budgetSetup({ ZHIHU_DAILY_CALL_LIMIT: '3' });
  const admitted = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => budget.reserveCall('actor-' + i)),
  );
  assert.equal(admitted.filter((r) => r.status === 'fulfilled').length, 3);
  assert(
    admitted
      .filter((r) => r.status === 'rejected')
      .every((r) => r.reason.code === 'APP_DAILY_LIMIT'),
  );
  for (const r of admitted)
    if (r.status === 'fulfilled') await budget.releaseCall(r.value);
  assert.equal(
    sql.prepare('SELECT COUNT(*) AS n FROM upstream_calls').get().n,
    3,
  );
  assert.equal(
    budget.budgetDay(Date.parse('2026-09-08T15:59:59Z')),
    '2026-09-08',
  );
  assert.equal(
    budget.budgetDay(Date.parse('2026-09-08T16:00:00Z')),
    '2026-09-09',
  );
  sql.prepare('UPDATE upstream_calls SET day_key=?').run('2026-01-01');
  await budget.releaseCall(await budget.reserveCall('new-day'));
});
await check(
  'per-visitor day/minute limits and concurrent slots recover',
  async () => {
    budgetSetup({ ZHIHU_VISITOR_DAILY_CALL_LIMIT: '2' });
    await budget.releaseCall(await budget.reserveCall('a'));
    await budget.releaseCall(await budget.reserveCall('a'));
    await assert.rejects(budget.reserveCall('a'), {
      code: 'VISITOR_DAILY_LIMIT',
    });
    await budget.releaseCall(await budget.reserveCall('b'));
    budgetSetup({ ZHIHU_VISITOR_MINUTE_CALL_LIMIT: '1' });
    await budget.releaseCall(await budget.reserveCall('a'));
    await assert.rejects(budget.reserveCall('a'), {
      code: 'VISITOR_RATE_LIMIT',
    });
    sql
      .prepare('UPDATE upstream_calls SET started_at=?')
      .run(Date.now() - 61000);
    await budget.releaseCall(await budget.reserveCall('a'));
    budgetSetup({ ZHIHU_MAX_CONCURRENT_CALLS: '2' });
    const work = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => budget.reserveCall('c-' + i)),
    );
    assert.equal(work.filter((r) => r.status === 'fulfilled').length, 2);
    assert(
      work
        .filter((r) => r.status === 'rejected')
        .every((r) => r.reason.code === 'UPSTREAM_BUSY'),
    );
    sql.prepare('UPDATE upstream_calls SET expires_at=?').run(Date.now() - 1);
    await budget.releaseCall(await budget.reserveCall('after-interruption'));
  },
);
await check(
  'same round generation is exclusive; failed attempts count and release slots',
  async () => {
    budgetSetup({ ZHIHU_MAX_CONCURRENT_CALLS: '2' });
    const first = await budget.reserveCall('a', 'round:shared');
    await assert.rejects(budget.reserveCall('b', 'round:shared'), {
      code: 'UPSTREAM_BUSY',
    });
    await budget.releaseCall(first);
    await budget.releaseCall(await budget.reserveCall('b', 'round:shared'));
    budgetSetup({ ZHIHU_MAX_CONCURRENT_CALLS: '1' });
    requestCount = 0;
    upstream = () => new Response('', { status: 500 });
    await assert.rejects(zhihu.searchZhihu('测试', 'a'), {
      code: 'ZHIHU_UNAVAILABLE',
    });
    assert.equal(requestCount, 1);
    const row = sql.prepare('SELECT * FROM upstream_calls').get();
    assert.equal(row.visitor_id, 'a');
    assert(row.finished_at);
    upstream = success;
    await zhihu.searchZhihu('测试', 'b');
    assert.equal(
      sql.prepare('SELECT COUNT(*) AS n FROM upstream_calls').get().n,
      2,
    );
    assert.equal(
      sql
        .prepare(
          'SELECT COUNT(*) AS n FROM upstream_calls WHERE finished_at IS NULL',
        )
        .get().n,
      0,
    );
  },
);
await check(
  'blocked and oversized calls never reach upstream; search text is bounded with parents',
  async () => {
    budgetSetup({ ZHIHU_DAILY_CALL_LIMIT: '0' });
    requestCount = 0;
    await assert.rejects(zhihu.searchZhihu('测试', 'a'), {
      code: 'APP_DAILY_LIMIT',
    });
    await assert.rejects(
      zhihu.generateJson('系统提示', { text: 'x'.repeat(61000) }, 'a'),
      { code: 'MODEL_INPUT_TOO_LARGE' },
    );
    assert.equal(requestCount, 0);
    assert.equal(
      sql.prepare('SELECT COUNT(*) AS n FROM upstream_calls').get().n,
      0,
    );
    const sources = zhihu.normalizeSearch({
      Code: 0,
      Data: {
        Items: Array.from({ length: 10 }, (_, i) => ({
          ContentType: 'Answer',
          ContentID: 'a' + i,
          ContentText: '文'.repeat(5000),
          CommentInfoList: [
            { Content: '甲'.repeat(1000) },
            { Content: '乙'.repeat(1000) },
            { Content: '丙'.repeat(1000) },
          ],
        })),
      },
    });
    assert.equal(sources.filter((s) => s.kind !== 'comment').length, 10);
    assert(sources.reduce((n, s) => n + s.text.length, 0) <= 24000);
    assert(sources.every((s) => s.truncated));
    assert(
      sources
        .filter((s) => s.kind === 'comment')
        .every((c) => sources.some((p) => p.id === c.parentSourceId)),
    );
    assert(
      sources.every(
        (source) =>
          source.textKind ===
          (source.kind === 'comment' ? 'comment' : 'summary'),
      ),
    );
    budgetSetup({ ZHIHU_DAILY_CALL_LIMIT: 'not-a-number' });
    await assert.rejects(zhihu.searchZhihu('测试', 'a'), {
      code: 'BUDGET_CONFIG_INVALID',
    });
    assert.equal(requestCount, 0);
  },
);
await check(
  'classification, round and followup use the initiating visitor budget',
  async () => {
    clear();
    budgetSetup();
    upstream = success;
    const topics = await moduleAt('shared/topics.ts');
    const rounds = await moduleAt('lib/server/roundtable.ts');
    const history = await moduleAt('lib/server/history.ts');
    const id = crypto.randomUUID();
    const start = await jobs.startAnalysis('live', id, 'owner', 'ai-homework');
    const done = await jobs.runAnalysisJob(start.jobId, 'owner');
    assert.equal(done.status, 'succeeded');
    const saved = JSON.parse(
      sql.prepare('SELECT payload FROM analyses WHERE id=?').get(done.resultId)
        .payload,
    );
    assert.equal(saved.topicId, 'ai-homework');
    assert.equal(saved.title, topics.topics[2].title);
    assert.equal(saved.scope, 'related_topic');
    assert.equal(saved.version, 'analysis-v3-evidence-gaps');
    assert.equal(saved.promptVersion, 'analysis-prompt-v3');
    assert.equal(saved.categories[0].analysisId, saved.id);
    assert(saved.openQuestions[0].evidenceRefs.length > 0);
    assert.equal((await history.recentResults('owner'))[0].id, done.resultId);
    assert.deepEqual(
      sql
        .prepare('SELECT DISTINCT visitor_id FROM upstream_calls')
        .all()
        .map((r) => r.visitor_id),
      ['owner'],
    );
    const real = {
      ...JSON.parse(JSON.stringify(topics.topics[1].preset)),
      id: 'synthetic-live-round',
      sourceMode: 'live',
      generationMode: 'live',
    };
    sql
      .prepare('INSERT INTO analyses(id,payload,created_at) VALUES (?,?,?)')
      .run(real.id, JSON.stringify(real), real.collectedAt);
    upstream = () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(
                topics.makePresetRound(real, 'template', ''),
              ),
            },
          },
        ],
      });
    const round = await rounds.startRound(real.id, 'round-owner');
    assert.equal(round.generationMode, 'live');
    const legacyTemplate = JSON.parse(
      sql
        .prepare('SELECT payload FROM round_templates WHERE analysis_id=?')
        .get(real.id).payload,
    );
    legacyTemplate.commonGround.forEach(
      (finding) => delete finding.categoryIds,
    );
    legacyTemplate.disagreements.forEach(
      (finding) => delete finding.categoryIds,
    );
    sql
      .prepare('UPDATE round_templates SET payload=? WHERE analysis_id=?')
      .run(JSON.stringify(legacyTemplate), real.id);
    const cachedRound = await rounds.startRound(real.id, 'round-cache-reader');
    assert.equal(cachedRound.generationMode, 'cached');
    assert(
      [...cachedRound.commonGround, ...cachedRound.disagreements].every(
        (finding) => finding.categoryIds.length > 0,
      ),
    );
    const legacyRound = JSON.parse(
      sql.prepare('SELECT payload FROM rounds WHERE id=?').get(cachedRound.id)
        .payload,
    );
    legacyRound.commonGround.forEach((finding) => delete finding.categoryIds);
    legacyRound.disagreements.forEach((finding) => delete finding.categoryIds);
    sql
      .prepare('UPDATE rounds SET payload=? WHERE id=?')
      .run(JSON.stringify(legacyRound), cachedRound.id);
    const upgradedRound = await rounds.getRound(
      cachedRound.id,
      'round-cache-reader',
    );
    assert(
      [...upgradedRound.commonGround, ...upgradedRound.disagreements].every(
        (finding) => finding.categoryIds.length > 0,
      ),
    );
    upstream = () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: '根据已有材料，需要明确适用条件。',
                evidenceRefs: real.categories[0].evidenceRefs.slice(0, 1),
              }),
            },
          },
        ],
      });
    await rounds.followup(round.id, 'round-owner', '需要什么条件？');
    assert.equal(
      sql
        .prepare('SELECT COUNT(*) AS n FROM upstream_calls WHERE visitor_id=?')
        .get('round-owner').n,
      2,
    );
  },
);
await check(
  'migration retains existing successful jobs and backfills result history',
  async () => {
    const previous = new DatabaseSync(':memory:');
    for (const file of (await fs.readdir('drizzle'))
      .filter((f) => f.endsWith('.sql') && f < '0003')
      .sort())
      previous.exec(await fs.readFile('drizzle/' + file, 'utf8'));
    previous
      .prepare('INSERT INTO analyses(id,payload,created_at) VALUES (?,?,?)')
      .run(
        'old-result',
        '{"topicId":"ai-coding","title":"原快照"}',
        '2026-09-08',
      );
    previous
      .prepare(
        "INSERT INTO analysis_jobs(id,visitor_id,fingerprint,status,stage,result_id,created_at,updated_at,expires_at) VALUES ('old-job','old-visitor','old-fingerprint','succeeded','done','old-result','2026-09-08','2026-09-08','2026-09-08')",
      )
      .run();
    previous.exec(
      await fs.readFile('drizzle/0003_ambitious_eternity.sql', 'utf8'),
    );
    assert.equal(
      previous.prepare('SELECT topic_id FROM analysis_jobs').get().topic_id,
      'ai-coding',
    );
    assert.equal(
      previous
        .prepare('SELECT analysis_id FROM analysis_visits WHERE visitor_id=?')
        .get('old-visitor').analysis_id,
      'old-result',
    );
    assert.equal(
      JSON.parse(previous.prepare('SELECT payload FROM analyses').get().payload)
        .title,
      '原快照',
    );
    previous.close();
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
