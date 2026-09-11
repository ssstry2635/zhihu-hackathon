import {
  hasSufficientRoundtableViews,
  type Analysis,
  type Category,
} from '@/shared/types';

export function analysisModeLabel(
  analysis: Pick<Analysis, 'sourceMode' | 'generationMode'>,
) {
  const source = {
    mock: '模拟样本',
    live: '知乎实时检索',
    snapshot: '知乎检索快照',
  }[analysis.sourceMode];
  const generation = {
    scripted: '预置整理',
    live: 'AI 实时整理',
    cached: '缓存整理',
  }[analysis.generationMode];
  return `${source} · ${generation}`;
}

export function analysisScopeLabel(analysis: Pick<Analysis, 'scope'>) {
  return analysis.scope === 'same_question_only'
    ? '同一问题范围'
    : '相关议题检索范围';
}

export function representativeSourceIds(category: Category) {
  return [
    ...new Set([
      ...category.evidenceRefs.map((evidence) => evidence.sourceId),
      ...category.sourceIds,
    ]),
  ].slice(0, 2);
}

export function canStartRoundtable(categories: Category[]) {
  return hasSufficientRoundtableViews(categories);
}
