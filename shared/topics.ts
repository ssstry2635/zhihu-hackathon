import { demoAnalysis, makeDemoRound, seedPosts } from './demo';
import type {
  Analysis,
  Category,
  Evidence,
  Post,
  Roundtable,
  Source,
} from './types';
export type Topic = {
  id: string;
  title: string;
  subtitle: string;
  section: string;
  tags: string[];
  preset: Analysis;
};
type Scenario = {
  id: string;
  title: string;
  subtitle: string;
  section: string;
  tags: string[];
  entries: [string, string, string][];
  comments: [number, string][];
  dimensions: [string, string, string, number[]][];
  stances: [string, string, string, number[]][];
  common: string;
  disagreement: string;
  exchange: [string, string, string];
};
const scenarios: Scenario[] = [
  {
    id: 'remote-work',
    title: '远程办公能成为长期工作方式吗？',
    subtitle: '少一点通勤之后，协作、边界和公平如何安排？',
    section: '工作与生活',
    tags: ['远程办公', '团队协作'],
    entries: [
      [
        '小禾',
        '省下通勤，留出完整时间',
        '远程办公让我省下通勤时间，也能把需要专注的工作集中完成。但这依赖一个安静的空间，以及团队对交付时间的清楚约定。',
      ],
      [
        '周远',
        '新人需要更多可见的支持',
        '我刚加入团队时，很多小问题在线上不容易开口问。远程并非不能带新人，但需要固定答疑、清晰文档和有人负责跟进。',
      ],
      [
        '阿宁',
        '在家不等于随时待命',
        '我支持远程，但下班后不断出现的消息侵占了休息。是否尊重响应时间和休息边界，比人在不在办公室更影响体验。',
      ],
      [
        '木子',
        '混合安排应围绕任务',
        '我们把独立写作留在家里，把需要共同讨论的活动集中到同一天。混合办公有效的前提是先确定任务，不能只按固定天数打卡。',
      ],
      [
        '林简',
        '远程条件并不相同',
        '有人有独立书房，有人只能在合租房里开会。讨论远程政策时，要考虑设备、空间和照护责任，不能默认每个人条件一样。',
      ],
      [
        '许同学',
        '协作成本也要被看见',
        '一次看似简单的决定，在线上可能要等待几个时区的人回复。我更愿意先约定哪些问题异步处理、哪些必须同步讨论，再决定远程比例。',
      ],
    ],
    comments: [
      [0, '节省通勤之外，也想比较实际协作耗时。'],
      [4, '如果公司能提供共享工位补贴，选择会不会更多？'],
    ],
    dimensions: [
      ['focus', '专注与效率', '如何比较通勤节省和协作等待的时间？', [0, 3, 5]],
      [
        'coordination',
        '协作与成长',
        '新人获得帮助，需要哪些具体安排？',
        [1, 3, 5],
      ],
      [
        'boundaries',
        '边界与公平',
        '不同居住和照护条件下，怎样保留选择？',
        [2, 4],
      ],
    ],
    stances: [
      [
        'remote',
        '支持有条件的远程',
        '明确交付和响应边界后，远程能带来更自主的安排。',
        [0, 2],
      ],
      [
        'hybrid',
        '支持按任务混合',
        '依据任务选择协作方式，并为新人提供支持。',
        [1, 3],
      ],
      [
        'cautious',
        '质疑一刀切推行',
        '居住条件与等待成本不同，不宜默认全员适用。',
        [4, 5],
      ],
    ],
    common: '材料都提示：工作方式需要配套安排，单靠改变办公地点并不充分。',
    disagreement: '是优先扩大远程自主权，还是先解决协作与条件差异后再推广？',
    exchange: [
      '新人支持确实不能省略。远程方案应同时约定答疑时段和交付要求，专注收益才不必以求助困难为代价。',
      '这仍需要任务层面的安排。可以把集中讨论放在共同到岗日，独立工作保留弹性，再观察新人是否真正获得支持。',
      '即使有混合安排，也要给没有安静空间的人其他选择。政策是否有效，需要同时看居住条件和协作等待，而不仅是少去几天办公室。',
    ],
  },
  {
    id: 'ai-homework',
    title: '大学课程应该允许使用 AI 完成作业吗？',
    subtitle: '工具能帮到哪一步，又如何确认学习真正发生？',
    section: '校园与学习',
    tags: ['AI 与教育', '课程作业'],
    entries: [
      [
        '小夏',
        '讲解思路让我更敢提问',
        '我会让 AI 换一种方式解释概念，再自己完成练习。允许这种辅助能降低求助门槛，但我需要核对它的说法，不能直接把答案交上去。',
      ],
      [
        '陈同学',
        '完成作业不代表掌握知识',
        '如果学生只提交生成的答案，教师很难知道他是否理解。对考查基础的作业，我倾向于要求独立完成，并能现场解释关键步骤。',
      ],
      [
        '苏老师',
        '不同任务需要不同规则',
        '练习基础概念和完成开放项目的目标不同。我倾向于按任务说明允许的辅助范围，并要求学生记录使用方式，而不是整门课统一禁止或放开。',
      ],
      [
        '阿岚',
        '过程记录比结果更能说明问题',
        '小组项目中，我们记录提示、修改理由和最终核验过程。这样的记录能帮助讨论自己做了哪些判断，但也会增加整理和评价的时间。',
      ],
      [
        '林同学',
        '工具差异影响机会',
        '付费工具、网络条件和已有基础都会影响使用效果。如果课程允许 AI，应提供可获得的替代方案，评分不应只比较最终作品的精美程度。',
      ],
      [
        '顾同学',
        '允许使用也要保留独立练习',
        '我支持在项目里使用工具，但也需要不依赖工具的练习，检验自己是否理解。最担心的是作业看起来更完整，基础上的问题却没有暴露出来。',
      ],
    ],
    comments: [
      [2, '希望每次作业都明确写出哪些辅助可以用。'],
      [4, '能否同时提供不用付费工具也能完成的路径？'],
    ],
    dimensions: [
      ['learning', '理解与学习', '怎样区分获得帮助和跳过思考？', [0, 1, 5]],
      [
        'assessment',
        '评价与规则',
        '过程记录和现场解释如何纳入评价？',
        [1, 2, 3],
      ],
      [
        'access',
        '可获得性与公平',
        '工具不同的学生如何得到可比较的评价？',
        [2, 4],
      ],
    ],
    stances: [
      [
        'assist',
        '支持透明的辅助使用',
        '允许解释、反馈与项目辅助，同时记录和核对使用过程。',
        [0, 3],
      ],
      [
        'by-task',
        '支持按任务划定边界',
        '依据教学目标规定范围，并提供平等可用的路径。',
        [2, 4],
      ],
      [
        'independent',
        '强调保留独立练习',
        '基础作业应检验个人理解，避免完整成品遮蔽学习缺口。',
        [1, 5],
      ],
    ],
    common: '这些材料都把学生是否理解、是否承担核验责任作为重要条件。',
    disagreement: '透明记录是否足以证明学习，还是必须增加独立练习和现场解释？',
    exchange: [
      '保留独立练习有价值，但辅助解释不必等于代写答案。可以让学生说明得到帮助后如何独立推导，再检查关键步骤。',
      '所以我赞成按任务区分。开放项目记录工具使用，基础练习要求独立解释，两类任务不使用同一个完成标准。',
      '区分任务后仍需验证个人理解。即使过程记录很完整，也应有学生不依赖工具完成的环节，暴露尚未掌握的部分。',
    ],
  },
];
function makeAnalysis(scenario: Scenario): Analysis {
  const collectedAt = '2026-09-09T00:00:00.000Z';
  const sources: Source[] = scenario.entries.map(
    ([authorName, title, text], i) => ({
      id: scenario.id + ':s' + (i + 1),
      kind: 'answer',
      title,
      text,
      authorName,
      url: null,
      relation: 'unknown',
      collectedAt,
    }),
  );
  scenario.comments.forEach(([parent, text], i) =>
    sources.push({
      id: scenario.id + ':c' + (i + 1),
      kind: 'comment',
      parentSourceId: sources[parent].id,
      title: '精选评论',
      text,
      authorName: null,
      url: null,
      relation: 'unknown',
      collectedAt,
    }),
  );
  const evidence = (i: number): Evidence => ({
    sourceId: sources[i].id,
    excerpt: sources[i].text.split('。')[0] + '。',
  });
  const categories: Category[] = [
    ...scenario.dimensions.map(([id, name, question, refs]) => ({
      id,
      type: 'dimension' as const,
      name,
      description: question,
      discussionQuestion: question,
      sourceIds: refs.map((i) => sources[i].id),
      evidenceRefs: refs.map(evidence),
      sampleCount: refs.length,
      sampleRatio: refs.length / scenario.entries.length,
    })),
    ...scenario.stances.map(([id, name, description, refs]) => ({
      id,
      type: 'stance' as const,
      name,
      description,
      discussionQuestion: '在什么条件下，你会支持“' + name + '”？',
      sourceIds: refs.map((i) => sources[i].id),
      evidenceRefs: refs.map(evidence),
      sampleCount: refs.length,
      sampleRatio: refs.length / scenario.entries.length,
    })),
  ];
  return {
    id: 'demo-' + scenario.id + '-v1',
    topicId: scenario.id,
    title: scenario.title,
    sourceMode: 'mock',
    generationMode: 'scripted',
    collectedAt,
    sampleCount: scenario.entries.length,
    commentCount: scenario.comments.length,
    sources,
    categories,
    commonGround: [
      {
        id: 'common',
        text: scenario.common,
        evidenceRefs: [evidence(0), evidence(2), evidence(5)],
      },
    ],
    disagreements: [
      {
        id: 'difference',
        text: scenario.disagreement,
        evidenceRefs: [evidence(0), evidence(1), evidence(4)],
      },
    ],
    openQuestions: scenario.dimensions.map((d) => d[2]),
  };
}
export const topics: Topic[] = [
  {
    id: 'ai-coding',
    title: demoAnalysis.title,
    subtitle: '当工具越来越聪明，我们还需要学到什么程度？',
    section: '科技与学习',
    tags: ['AI 编程', '学习与成长'],
    preset: demoAnalysis,
  },
  ...scenarios.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    section: s.section,
    tags: s.tags,
    preset: makeAnalysis(s),
  })),
];
export const findTopic = (id: string) => topics.find((t) => t.id === id);
export function makePresetRound(
  analysis: Analysis,
  id: string,
  visitorId: string,
): Roundtable {
  if (analysis.id === demoAnalysis.id) return makeDemoRound(id, visitorId);
  const scenario = scenarios.find((s) => s.id === analysis.topicId);
  if (!scenario) throw new Error('UNKNOWN_PRESET');
  const stances = analysis.categories.filter((c) => c.type === 'stance');
  const dimensions = analysis.categories.filter((c) => c.type === 'dimension');
  return {
    id,
    analysisId: analysis.id,
    visitorId,
    status: 'ready',
    generationMode: 'scripted',
    model: null,
    promptVersion: 'roundtable-script-v2',
    followupUsed: false,
    createdAt: new Date().toISOString(),
    roles: [
      {
        id: 'host',
        name: '主持人',
        categoryId: null,
        description: '梳理议题与证据',
        color: 'host',
        sourceIds: analysis.sources.map((source) => source.id),
      },
      ...stances.map((c, i) => ({
        id: 'view-' + i,
        name: c.name,
        categoryId: c.id,
        description: c.description,
        color: ['blue', 'green', 'amber'][i],
        sourceIds: c.sourceIds,
      })),
    ],
    messages: [
      {
        id: 'm1',
        roundtableId: id,
        speakerRoleId: 'host',
        phase: 'opening',
        content:
          '今天讨论“' +
          analysis.title +
          '”。以下是团队预置脚本，请关注各个主张的适用条件。',
        evidenceRefs: [],
        order: 0,
      },
      ...stances.map((c, i) => ({
        id: 'm' + (i + 2),
        roundtableId: id,
        speakerRoleId: 'view-' + i,
        phase: 'statement' as const,
        content: c.description,
        evidenceRefs: c.evidenceRefs,
        order: i + 1,
      })),
      ...scenario.exchange.map((content, i) => ({
        id: 'm' + (i + 5),
        roundtableId: id,
        speakerRoleId: 'view-' + i,
        phase: 'exchange' as const,
        replyToMessageId: ['m4', 'm5', 'm6'][i],
        content,
        evidenceRefs: stances[i].evidenceRefs,
        order: stances.length + i + 1,
      })),
      {
        id: 'm8',
        roundtableId: id,
        speakerRoleId: 'host',
        phase: 'summary',
        content:
          scenario.common +
          scenario.disagreement +
          '欢迎在对应讨论区补充自己的经历和条件。',
        evidenceRefs: analysis.commonGround[0].evidenceRefs,
        order: stances.length + scenario.exchange.length + 1,
      },
    ],
    commonGround: analysis.commonGround,
    disagreements: analysis.disagreements,
    gaps: dimensions.slice(0, 2).map((c, i) => ({
      id: id + '~' + i,
      roundtableId: id,
      question: c.discussionQuestion,
      categoryId: c.id,
      contextEvidenceRefs: c.evidenceRefs,
      supplementCount: 0,
    })),
  };
}
export function seedTopicPosts(analysis: Analysis): Post[] {
  if (analysis.id === demoAnalysis.id) return seedPosts(analysis);
  return analysis.categories.map((c) => ({
    id: 'seed-' + analysis.id + '-' + c.id,
    analysisId: analysis.id,
    categoryId: c.id,
    authorId: null,
    authorName: '讨论引导员',
    content:
      '预置讨论引导：' +
      c.discussionQuestion +
      ' 请说说你的经历，以及这个判断适用的条件。',
    contributionType: 'opinion',
    parentPostId: null,
    gapId: null,
    sourceIds: c.sourceIds.slice(0, 1),
    externalEvidenceUrl: null,
    origin: 'seed',
    voteCount: 0,
    likedByMe: false,
    createdAt: analysis.collectedAt,
  }));
}
