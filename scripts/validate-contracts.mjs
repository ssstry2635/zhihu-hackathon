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

  return m;
}
async function moduleAt(relative) {
  const m = await load(path.join(root, relative));
  if (m.status === 'unlinked')
    await m.link(async (spec, ref) => {
      if (spec === '@/db') return load(spec);
      const resolved = spec.startsWith('@/')
        ? path.join(root, spec.slice(2))
        : path.resolve(path.dirname(ref.identifier), spec);
      return load(resolved.endsWith('.ts') ? resolved : resolved + '.ts');
    });
  if (m.status === 'linked') await m.evaluate();
  return m.namespace;
}
const zhihu = await moduleAt('lib/server/zhihu.ts');
const mock = await moduleAt('shared/demo.ts');
const analysis = await moduleAt('lib/server/analysis.ts');
const round = await moduleAt('lib/server/roundtable.ts');
const overview = await moduleAt('features/overview/overview-model.ts');
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
assert.equal(result[0].textKind, 'summary');
assert.equal(result[1].textKind, 'comment');
assert.equal(result[0].relation, 'unknown');
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
assert.equal(valid.categories[0].analysisId, 'live-test');
assert.equal(valid.version, analysis.ANALYSIS_DATA_VERSION);
assert.equal(valid.promptVersion, analysis.ANALYSIS_PROMPT_VERSION);
assert(valid.openQuestions[0].evidenceRefs.length > 0);
assert(valid.openQuestions[0].categoryIds.includes('cost'));
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
const bogusQuestion = structuredClone(mock.demoAnalysis);
bogusQuestion.openQuestions[0].evidenceRefs[0].excerpt = '不存在的问题背景';
assert.throws(() =>
  analysis.validateAnalysis(bogusQuestion, mock.sources, 't', mock.TOPIC_TITLE),
);
const wrongFindingCategory = structuredClone(mock.demoAnalysis);
wrongFindingCategory.openQuestions[0].categoryIds = ['missing'];
assert.throws(() =>
  analysis.validateAnalysis(
    wrongFindingCategory,
    mock.sources,
    't',
    mock.TOPIC_TITLE,
  ),
);
const wrongTextKind = structuredClone(mock.sources);
wrongTextKind[0].textKind = 'comment';
assert.throws(() =>
  analysis.validateAnalysis(
    mock.demoAnalysis,
    wrongTextKind,
    't',
    mock.TOPIC_TITLE,
  ),
);
const wrongSourceKind = structuredClone(mock.sources);
wrongSourceKind[0].kind = 'question';
assert.throws(() =>
  analysis.validateAnalysis(
    mock.demoAnalysis,
    wrongSourceKind,
    't',
    mock.TOPIC_TITLE,
  ),
);
const orphanComment = structuredClone(mock.sources);
orphanComment.at(-1).parentSourceId = 'missing';
assert.throws(() =>
  analysis.validateAnalysis(
    mock.demoAnalysis,
    orphanComment,
    't',
    mock.TOPIC_TITLE,
  ),
);
const legacy = structuredClone(mock.demoAnalysis);
delete legacy.scope;
delete legacy.queries;
delete legacy.createdAt;
delete legacy.version;
legacy.sources.forEach((source) => delete source.textKind);
legacy.categories.forEach((category) => delete category.analysisId);
legacy.commonGround.forEach((finding) => delete finding.categoryIds);
legacy.openQuestions = ['旧版待解问题'];
const upgraded = analysis.upgradeAnalysis(legacy);
assert.equal(upgraded.sources[0].textKind, 'summary');
assert.equal(upgraded.categories[0].analysisId, legacy.id);
assert.equal(upgraded.openQuestions[0].text, '旧版待解问题');
assert.equal(upgraded.openQuestions[0].evidenceRefs.length, 0);
assert.equal(upgraded.version, 'legacy-v2-upgraded');
assert.equal(
  overview.analysisModeLabel(mock.demoAnalysis),
  '模拟样本 · 预置整理',
);
assert.equal(
  overview.analysisModeLabel({
    sourceMode: 'snapshot',
    generationMode: 'cached',
  }),
  '知乎检索快照 · 缓存整理',
);
assert.equal(
  overview
    .representativeSourceIds({
      ...mock.demoAnalysis.categories[0],
      sourceIds: ['s1', 's2', 's3'],
      evidenceRefs: [mock.evidence('s2'), mock.evidence('s2')],
    })
    .join(','),
  's2,s1',
);
assert.equal(overview.canStartRoundtable(mock.demoAnalysis.categories), true);
const incompleteStances = mock.demoAnalysis.categories
  .filter((category) => category.type === 'stance')
  .slice(0, 2)
  .map((category, i) =>
    i === 1 ? { ...category, evidenceRefs: [] } : category,
  );
assert.equal(overview.canStartRoundtable(incompleteStances), false);
assert.equal(
  overview.canStartRoundtable(
    mock.demoAnalysis.categories.filter((category) =>
      ['use', 'start'].includes(category.id),
    ),
  ),
  false,
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
        '来源文本类型与父来源校验',
        '评论作者不冒用',
        '来源去重',
        '保留溯源链接',
        '程序计算比例',
        '伪造引用拒绝',
        '无效来源拒绝',
        '待解问题证据与分类关联校验',
        '旧快照无伪造依据地升级',
        '总览模式、代表材料与圆桌门禁',
        '圆桌阶段和回应校验',
        '重复观点角色拒绝',
      ],
    },
    null,
    2,
  ),
);
