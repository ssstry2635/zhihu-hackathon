import type {
  Analysis,
  Category,
  Evidence,
  Post,
  Roundtable,
  Source,
} from './types';
export const DEMO_ID = 'demo-v1';
export const TOPIC_TITLE = '普通人现在还有必要学习 AI 编程吗？';
const collectedAt = '2026-09-08T00:00:00.000Z';
const entries = [
  [
    '林间',
    '从一个具体的小问题开始',
    '我用 AI 做了一个整理工作记录的小工具。它没有改变我的职业，但每周节省了一些重复劳动。对我来说，先找到实际任务，再学习需要的知识，比先学完一套课程有效。',
  ],
  [
    '周同学',
    '做得出来，也要判断对错',
    '我支持用 AI 入门，但代码生成成功不代表结果正确。尤其是处理重要数据时，需要懂基本的数据结构、测试和错误排查。学习的门槛降低了，验证的责任还在。',
  ],
  [
    '小陈',
    '先想清楚为什么学',
    '我试过跟着教程学了两周，没有自己的项目，很快就停下了。如果只是担心落后，没有具体使用场景，盲目投入未必值得。',
  ],
  [
    '阿岚',
    '小工具也有实际价值',
    '我的目标不是当程序员，只是把活动报名表整理好。用 AI 帮忙写脚本后，我愿意继续学一点表格处理和调试。能解决一个小问题，就有继续学的动力。',
  ],
  [
    '何同学',
    '时间投入容易被忽略',
    '第一次做网页，页面很快出来了，但部署和排错花了更多时间。零基础学习者需要把验证、修改和维护的时间算进去，而不只看第一次生成有多快。',
  ],
  [
    '远山',
    '求职需要另一套证据',
    '做出一个能用的小工具，与胜任软件工程岗位是两件事。求职还需要展示协作、测试、维护和解释技术选择的能力。不能把一次成功生成当作就业保证。',
  ],
  [
    '宁宁',
    '已有行业经验可以成为起点',
    '我熟悉自己工作的流程，因此能描述清楚要解决的问题。AI 让我更快尝试实现，但需求判断主要来自已有经验。普通人也可以从自己的领域找到切入点。',
  ],
  [
    '赵同学',
    '基础可以和项目一起学',
    '我没有先把所有语法学完，而是在项目里遇到问题就补一块知识。这个方法适合愿意反复验证的人；如果完全依赖生成结果，问题积累后会很难改。',
  ],
  [
    '小孟',
    '先试一次，再决定投入',
    '我建议先选一个低风险、范围小的任务，投入一个周末试试。做完后记录花了多少时间、解决了什么，再决定是否继续，不必一开始就承诺长期学习。',
  ],
  [
    '程同学',
    '岗位要求不会只看生成速度',
    '团队开发需要知道代码为什么这样写。即使 AI 提高了实现速度，版本管理、评审和沟通仍然重要。学习 AI 编程可以是起点，但不是能力证明的终点。',
  ],
  [
    '水杉',
    '不是每个人现在都有必要学',
    '如果现有工具已经解决需求，或者短期内没有时间投入，暂缓学习是合理选择。愿意尝试的人可以从小任务开始，没必要把学习变成每个人的义务。',
  ],
  [
    '李同学',
    '不同起点，需要不同建议',
    '会表格公式的人与完全没接触过计算逻辑的人，遇到的困难可能不同。建议应该说明已有基础和可投入时间，笼统说简单或困难都不够具体。',
  ],
];
export const sources: Source[] = entries.map(
  ([authorName, title, text], i) => ({
    id: 's' + (i + 1),
    kind: i === 6 ? 'article' : 'answer',
    title,
    text,
    authorName,
    url: null,
    relation: 'unknown',
    collectedAt,
  }),
);
[
  ['s1', '能不能分享具体节省了哪些步骤？'],
  ['s5', '我的情况相似，排错比生成页面花的时间长。'],
  ['s6', '先区分个人使用和求职，争论就清楚多了。'],
  ['s9', '想看零基础实际投入时间的记录。'],
].forEach(([parentSourceId, text], i) =>
  sources.push({
    id: 'c' + (i + 1),
    kind: 'comment',
    parentSourceId,
    title: '精选评论',
    text,
    authorName: null,
    url: null,
    relation: 'unknown',
    collectedAt,
  }),
);
export const evidence = (id: string): Evidence => ({
  sourceId: id,
  excerpt: sources.find((s) => s.id === id)!.text.split('。')[0] + '。',
});
const cat = (
  id: string,
  type: Category['type'],
  name: string,
  description: string,
  discussionQuestion: string,
  ids: string[],
): Category => ({
  id,
  type,
  name,
  description,
  discussionQuestion,
  sourceIds: ids,
  evidenceRefs: ids.slice(0, 2).map(evidence),
  sampleCount: ids.length,
  sampleRatio: ids.length / 12,
});
export const demoAnalysis: Analysis = {
  id: DEMO_ID,
  topicId: 'ai-coding',
  title: TOPIC_TITLE,
  sourceMode: 'mock',
  generationMode: 'scripted',
  collectedAt,
  sampleCount: 12,
  commentCount: 4,
  sources,
  categories: [
    cat(
      'use',
      'dimension',
      '实际用途',
      '从手边的小任务出发，讨论学习能带来什么。',
      '你希望用 AI 编程解决什么具体问题？',
      ['s1', 's4', 's7', 's9'],
    ),
    cat(
      'cost',
      'dimension',
      '学习投入',
      '把学习、排错和维护的时间一起算进去。',
      '零基础做成第一个项目，实际需要投入什么？',
      ['s3', 's5', 's8', 's9', 's12'],
    ),
    cat(
      'career',
      'dimension',
      '就业与能力',
      '个人工具与工作要求之间，还有哪些距离。',
      '什么才能证明一个人具备可靠的开发能力？',
      ['s2', 's6', 's10', 's12'],
    ),
    cat(
      'start',
      'stance',
      '支持从具体任务入手',
      '小范围尝试，让实际问题带动学习。',
      '哪些小任务适合作为第一步？',
      ['s1', 's4', 's7', 's9'],
    ),
    cat(
      'foundation',
      'stance',
      '强调基础与验证能力',
      '工具提高速度，人仍需要对结果作判断。',
      '哪些基础和验证步骤不能交给 AI 省略？',
      ['s2', 's5', 's6', 's8', 's10'],
    ),
    cat(
      'intent',
      'stance',
      '质疑没有目标的投入',
      '先判断需求、时间和已有工具是否足够。',
      '什么情况下，暂缓学习是更合适的选择？',
      ['s3', 's9', 's11', 's12'],
    ),
  ],
  commonGround: [
    {
      id: 'f1',
      text: '具体目标与验证能力，是多份材料共同强调的条件。',
      evidenceRefs: [evidence('s1'), evidence('s2'), evidence('s3')],
    },
  ],
  disagreements: [
    {
      id: 'f2',
      text: '可以边做边学到什么程度？何时必须先补基础？',
      evidenceRefs: [evidence('s2'), evidence('s8')],
    },
    {
      id: 'f3',
      text: '有限的时间，值得投入一次尝试还是应该暂缓？',
      evidenceRefs: [evidence('s9'), evidence('s11')],
    },
  ],
  openQuestions: ['不同基础的学习者，完成同一个小任务各需要多少时间？'],
};
export function seedPosts(analysis: Analysis): Post[] {
  return analysis.categories.flatMap((category, i) => [
    {
      id: 'seed-' + category.id + '-1',
      analysisId: analysis.id,
      categoryId: category.id,
      authorId: null,
      authorName: '林间',
      content:
        category.type === 'dimension'
          ? '我更想听听具体经历：你原本有什么基础，尝试了什么，最后在哪一步卡住？'
          : '我觉得可以先说清楚各自的目标。做自己的小工具和准备求职，对“学会”的要求不一样。',
      contributionType: 'opinion' as const,
      parentPostId: null,
      gapId: null,
      sourceIds: category.sourceIds.slice(0, 1),
      externalEvidenceUrl: null,
      origin: 'seed' as const,
      voteCount: 0,
      likedByMe: false,
      createdAt: '2026-09-08T01:00:00.000Z',
    },
    {
      id: 'seed-' + category.id + '-2',
      analysisId: analysis.id,
      categoryId: category.id,
      authorId: null,
      authorName: '周同学',
      content:
        '我赞同把适用条件说清楚。愿意反复排错、有一个具体任务，可能比一开始知道多少术语更影响能否坚持。',
      contributionType: 'condition' as const,
      parentPostId: 'seed-' + category.id + '-1',
      gapId: null,
      sourceIds: [],
      externalEvidenceUrl: null,
      origin: 'seed' as const,
      voteCount: 0,
      likedByMe: false,
      createdAt: '2026-09-08T01:10:00.000Z',
    },
  ]);
}
export function makeDemoRound(id: string, visitorId: string): Roundtable {
  const e = (s: string) => [evidence(s)];
  return {
    id,
    analysisId: DEMO_ID,
    visitorId,
    generationMode: 'scripted',
    followupUsed: false,
    roles: [
      {
        id: 'host',
        name: '主持人',
        categoryId: null,
        description: '梳理议题与证据',
        color: 'host',
      },
      {
        id: 'practice',
        name: '实践派',
        categoryId: 'start',
        description: '从具体任务入手',
        color: 'blue',
      },
      {
        id: 'basics',
        name: '基础派',
        categoryId: 'foundation',
        description: '强调验证与基础',
        color: 'green',
      },
      {
        id: 'purpose',
        name: '目标派',
        categoryId: 'intent',
        description: '先判断投入是否值得',
        color: 'amber',
      },
    ],
    messages: [
      {
        id: 'm1',
        speakerRoleId: 'host',
        phase: 'opening',
        content:
          '今天我们讨论的，是普通人学习 AI 编程的价值。请分别说明自己的主张，以及它适用的条件。',
        evidenceRefs: [],
      },
      {
        id: 'm2',
        speakerRoleId: 'practice',
        phase: 'statement',
        content:
          '有一个具体的小任务，就值得开始尝试。学习不一定要以转行作为目标，让重复劳动少一点也是实际收益。',
        evidenceRefs: e('s1'),
      },
      {
        id: 'm3',
        speakerRoleId: 'basics',
        phase: 'statement',
        content:
          '我支持尝试，但“生成成功”不能等同“结果正确”。至少要理解如何测试、发现错误和验证输出，尤其涉及重要数据时。',
        evidenceRefs: e('s2'),
      },
      {
        id: 'm4',
        speakerRoleId: 'purpose',
        phase: 'statement',
        content:
          '我关心的是投入条件。如果没有自己的需求，仅仅因为焦虑而学习，可能很快失去动力；暂缓也可以是一种合理选择。',
        evidenceRefs: e('s3'),
      },
      {
        id: 'm5',
        speakerRoleId: 'practice',
        phase: 'exchange',
        replyToMessageId: 'm3',
        content:
          '验证很重要，但基础是否一定要先全部学完？材料里也有人在项目中遇到问题再补知识。我们争的可能是学习顺序，而不是要不要验证。',
        evidenceRefs: e('s8'),
      },
      {
        id: 'm6',
        speakerRoleId: 'basics',
        phase: 'exchange',
        replyToMessageId: 'm5',
        content:
          '可以边做边学，但任务风险要有限。做个人工具和准备求职不能用同一个完成标准，后者还要证明测试、维护与协作能力。',
        evidenceRefs: e('s6'),
      },
      {
        id: 'm7',
        speakerRoleId: 'purpose',
        phase: 'exchange',
        replyToMessageId: 'm2',
        content:
          '那可以把建议收窄为一次小范围尝试。记录一个周末的时间和成果，再决定是否继续，比直接要求所有人长期投入更具体。',
        evidenceRefs: e('s9'),
      },
      {
        id: 'm8',
        speakerRoleId: 'host',
        phase: 'summary',
        content:
          '共同点是明确目标，并对结果负责。分歧在于基础学习的时机，以及有限时间是否值得投入。材料仍缺少不同起点学习者的可比较记录，这可以交给真人讨论继续补充。',
        evidenceRefs: [evidence('s2'), evidence('s9'), evidence('s12')],
      },
    ],
    commonGround: demoAnalysis.commonGround,
    disagreements: demoAnalysis.disagreements,
    gaps: [
      {
        id: id + '-time',
        question: '零基础完成第一个小任务，实际投入了多少时间？',
        categoryId: 'cost',
        supplementCount: 0,
      },
      {
        id: id + '-verify',
        question: '你用什么方法确认 AI 生成的结果是正确的？',
        categoryId: 'career',
        supplementCount: 0,
      },
    ],
  };
}
