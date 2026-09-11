import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://localhost:3000';
assert(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  '该测试仅允许写入本地演示环境。',
);
function client() {
  let cookie = '';
  return async (path, method = 'GET', data, expected = 200) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
    if (method !== 'GET' && data !== undefined)
      options.body = JSON.stringify(data);
    const response = await fetch(base + '/api' + path, options);
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const value = await response.json();
    assert.equal(
      response.status,
      expected,
      path + ': ' + JSON.stringify(value),
    );
    return value.data ?? value;
  };
}
const a = client(),
  b = client();
const config = await a('/config');
assert.equal(typeof config.liveAvailable, 'boolean');
assert(!('secret' in config));
const analysis = await a('/analyses/demo-v1');
assert.equal(analysis.sampleCount, 12);
assert.equal(analysis.commentCount, 4);
assert.equal(analysis.sources.length, 16);
assert.equal(analysis.scope, 'same_question_only');
assert.equal(analysis.version, 'analysis-v3-evidence-gaps');
assert(
  analysis.sources.every(
    (source) =>
      source.textKind === (source.kind === 'comment' ? 'comment' : 'summary'),
  ),
);
assert(
  analysis.categories.every(
    (c) => c.sampleRatio === c.sampleCount / analysis.sampleCount,
  ),
);
assert(
  analysis.categories.every((category) => category.analysisId === analysis.id),
);
assert(
  [
    ...analysis.commonGround,
    ...analysis.disagreements,
    ...analysis.openQuestions,
  ]
    .flatMap((finding) => finding.evidenceRefs)
    .every((evidence) =>
      analysis.sources.some(
        (source) =>
          source.id === evidence.sourceId &&
          source.text.includes(evidence.excerpt),
      ),
    ),
);
const va = await a('/visitors/session', 'POST', { displayName: '测试访客甲' });
const vb = await b('/visitors/session', 'POST', { displayName: '测试访客乙' });
assert.notEqual(va.id, vb.id);
assert.equal((await a('/visitors/session')).id, va.id);
const path = '/analyses/demo-v1/categories/cost/posts';
const key = crypto.randomUUID();
const payload = {
  content: '本地验收：我用一个小任务记录学习和排错所花的时间。',
  contributionType: 'experience',
  requestId: key,
};
const created = await a(path, 'POST', payload, 201);
assert.equal(created.authorId, va.id);
const duplicate = await a(path, 'POST', payload, 201);
assert.equal(created.id, duplicate.id);
const list = await b(path);
assert(
  list.posts.some((p) => p.id === created.id),
  '另一访客必须能读取已发布帖子',
);
const reply = await b(
  path,
  'POST',
  {
    content: '本地验收回复：可以补充你的已有基础吗？',
    contributionType: 'condition',
    parentPostId: created.id,
    requestId: crypto.randomUUID(),
  },
  201,
);
assert.equal(reply.parentPostId, created.id);
await b(
  path,
  'POST',
  {
    content: '不允许无限嵌套',
    parentPostId: reply.id,
    requestId: crypto.randomUUID(),
  },
  400,
);
await b(
  '/analyses/demo-v1/categories/career/posts',
  'POST',
  {
    content: '不允许跨分类回复',
    parentPostId: created.id,
    requestId: crypto.randomUUID(),
  },
  400,
);
const liked1 = await b('/posts/' + created.id + '/like', 'PUT', {
  liked: true,
});
const liked2 = await b('/posts/' + created.id + '/like', 'PUT', {
  liked: true,
});
assert.equal(liked1.voteCount, 1);
assert.equal(liked2.voteCount, 1);
const unliked = await b('/posts/' + created.id + '/like', 'PUT', {
  liked: false,
});
assert.equal(unliked.voteCount, 0);
const ra = await a('/analyses/demo-v1/roundtables', 'POST', {});
const rb = await b('/analyses/demo-v1/roundtables', 'POST', {});
assert.notEqual(ra.id, rb.id);
assert.equal(ra.messages.length, 8);
assert.equal((await a('/analyses/demo-v1/roundtables', 'POST', {})).id, ra.id);
await b('/roundtables/' + ra.id, 'GET', undefined, 404);
const gap = ra.gaps[0];
const gapInfo = await b('/gaps/' + encodeURIComponent(gap.id));
assert.equal(gapInfo.question, gap.question);
await b(
  '/analyses/demo-v1/categories/' + gap.categoryId + '/posts',
  'POST',
  {
    content: '本地验收补充：记录生成、调试和验证三部分投入。',
    contributionType: 'experience',
    gapId: gap.id,
    requestId: crypto.randomUUID(),
  },
  201,
);
const reread = await a('/roundtables/' + ra.id);
assert.equal(reread.gaps[0].supplementCount, 1);
const follow = await a('/roundtables/' + ra.id + '/followups', 'POST', {
  question: '如果每周只有三小时呢？',
});
assert(follow.followupUsed);
assert.equal(follow.messages.length, 10);
assert(follow.messages.at(-1).content.includes(analysis.openQuestions[0].text));
await a(
  '/roundtables/' + ra.id + '/followups',
  'POST',
  { question: '不能重复追问' },
  409,
);
const followB = await b('/roundtables/' + rb.id + '/followups', 'POST', {
  question: '另一访客仍可追问吗？',
});
assert(followB.followupUsed);
await a('/analyses/missing', 'GET', undefined, 404);
await a(path, 'POST', { content: ' ', requestId: crypto.randomUUID() }, 400);
await a(
  path,
  'POST',
  {
    content: '检验不安全链接',
    externalEvidenceUrl: 'javascript:alert(1)',
    requestId: crypto.randomUUID(),
  },
  400,
);
if (!config.liveAvailable)
  await a(
    '/topics/ai-coding/analyses',
    'POST',
    { mode: 'live', requestId: crypto.randomUUID() },
    503,
  );
for (const route of [
  '/',
  '/overview?analysis=demo-v1',
  '/discussion/cost?analysis=demo-v1',
  '/roundtable?analysis=demo-v1',
])
  assert.equal((await fetch(base + route)).status, 200);
console.log(
  JSON.stringify(
    {
      status: 'passed',
      checks: [
        '四页可访问',
        '样本统计',
        'B 分类契约与待解问题依据',
        '访客隔离与身份恢复',
        '跨访客发帖回复',
        '重复提交去重',
        '越界回复拒绝',
        '点赞幂等',
        '独立圆桌与追问额度',
        '待解问题补充持久化',
        '错误与无凭证降级',
      ],
      testPostId: created.id,
    },
    null,
    2,
  ),
);
