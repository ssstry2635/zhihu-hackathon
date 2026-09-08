import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root = process.cwd();
const context = vm.createContext({
  console,
  URL,
  Response,
  Request,
  Headers,
  AbortSignal,
  TextEncoder,
  Uint8Array,
  crypto,
  fetch: () => {
    throw new Error('单元测试禁止外部请求');
  },
});
const modules = new Map();
async function load(file) {
  if (modules.has(file)) return modules.get(file);
  if (file === '@/db') {
    const m = new vm.SyntheticModule(
      ['env', 'getDb'],
      function () {
        this.setExport('env', {});
        this.setExport('getDb', () => {
          throw new Error('校验测试不能访问数据库');
        });
      },
      { context },
    );
    modules.set(file, m);
    return m;
  }
  const code = await fs.readFile(file, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const m = new vm.SourceTextModule(js, { context, identifier: file });
  modules.set(file, m);
  await m.link(async (spec, ref) => {
    if (spec === '@/db') return load(spec);
    const resolved = spec.startsWith('@/')
      ? path.join(root, spec.slice(2))
      : path.resolve(path.dirname(ref.identifier), spec);
    return load(resolved.endsWith('.ts') ? resolved : resolved + '.ts');
  });
  return m;
}
async function moduleAt(relative) {
  const m = await load(path.join(root, relative));
  if (m.status === 'linked') await m.evaluate();
  return m.namespace;
}
const zhihu = await moduleAt('lib/server/zhihu.ts');
const mock = await moduleAt('shared/demo.ts');
const analysis = await moduleAt('lib/server/analysis.ts');
const round = await moduleAt('lib/server/roundtable.ts');
const result = zhihu.normalizeSearch({
  Code: 0,
  Data: {
    Items: [
      { ContentType: 'Question', ContentID: 'q', ContentText: '问题不是观点' },
      {
        ContentType: 'Answer',
        ContentID: 'a',
        ContentText: '这是回答摘要。',
        Title: '测试',
        AuthorName: '作者甲',
        Url: 'https://www.zhihu.com/question/1/answer/2?utm_source=test',
        CommentInfoList: [
          { Content: '评论没有作者。' },
          { Content: '评论没有作者。' },
          null,
        ],
      },
      { ContentType: 'Answer', ContentID: 'a', ContentText: '重复结果' },
    ],
  },
});
assert.equal(result.length, 2);
assert.equal(result[0].kind, 'answer');
assert.equal(result[1].authorName, null);
assert.equal(result[1].parentSourceId, result[0].id);
assert(result[0].url.endsWith('utm_source=test'));
assert.throws(() => zhihu.normalizeSearch({ Code: 20001 }));
const valid = analysis.validateAnalysis(
  mock.demoAnalysis,
  mock.sources,
  'live-test',
  mock.TOPIC_TITLE,
);
assert.equal(valid.sampleCount, 12);
assert.equal(valid.commentCount, 4);
assert.equal(valid.categories[0].sampleRatio, 4 / 12);
const counts = structuredClone(mock.demoAnalysis);
counts.categories[0].sampleCount = 999;
assert.equal(
  analysis.validateAnalysis(counts, mock.sources, 't', mock.TOPIC_TITLE)
    .categories[0].sampleCount,
  4,
);
const bogus = structuredClone(mock.demoAnalysis);
bogus.categories[0].evidenceRefs[0].excerpt = '不存在于来源的句子';
assert.throws(() =>
  analysis.validateAnalysis(bogus, mock.sources, 't', mock.TOPIC_TITLE),
);
const missing = structuredClone(mock.demoAnalysis);
missing.categories[0].sourceIds.push('missing');
assert.throws(() =>
  analysis.validateAnalysis(missing, mock.sources, 't', mock.TOPIC_TITLE),
);
const template = mock.makeDemoRound('template', 'tester');
assert.equal(
  round.validateRound(template, mock.demoAnalysis).messages.length,
  8,
);
const wrongReply = structuredClone(template);
wrongReply.messages[4].replyToMessageId = 'future-message';
assert.throws(() => round.validateRound(wrongReply, mock.demoAnalysis));
const wrongRole = structuredClone(template);
wrongRole.roles[2].categoryId = 'start';
assert.throws(() => round.validateRound(wrongRole, mock.demoAnalysis));
console.log(
  JSON.stringify(
    {
      status: 'passed',
      checks: [
        '官方摘要标准化',
        '评论作者不冒用',
        '来源去重',
        '保留溯源链接',
        '程序计算比例',
        '伪造引用拒绝',
        '无效来源拒绝',
        '圆桌阶段和回应校验',
        '重复观点角色拒绝',
      ],
    },
    null,
    2,
  ),
);
