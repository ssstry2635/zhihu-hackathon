'use client';
import Link from '@/components/page-link';
import {
  ArrowRight,
  Compass,
  Clock3,
  BriefcaseBusiness,
  MessagesSquare,
  Check,
  Split,
  Quote,
  Sparkles,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AppShell } from '@/components/app-shell';
import { Loading, ErrorState } from '@/components/states';
import { EvidenceLinks, SourceDialog } from '@/components/source-dialog';
import { useAnalysis } from '@/features/use-analysis';
import type { Category } from '@/shared/types';
export default function Overview() {
  const { id, analysis: a, error } = useAnalysis();
  const icons = [Compass, Clock3, BriefcaseBusiness];
  return (
    <AppShell
      page="overview"
      analysisId={id}
      topicId={a?.topicId}
      live={a?.sourceMode === 'live'}
    >
      <main className="container">
        {error ? (
          <ErrorState message={error} />
        ) : !a ? (
          <Loading />
        ) : (
          <>
            <div className="eyebrow">
              问题现场 <span>/</span> 观点总览
            </div>
            <div className="overview-heading">
              <div>
                <div className="tag-row">
                  <span className="tag">共同议题</span>
                  <span className="subtle">
                    {a.sourceMode === 'mock'
                      ? '模拟样本 · 预置整理'
                      : '知乎检索样本 · AI 整理'}
                  </span>
                </div>
                <h1>{a.title}</h1>
                <p className="muted">找到你关心的角度，听听不同的人怎么说。</p>
              </div>
              <div className="sample-count">
                <b>{a.sampleCount}</b>
                <span>条主来源</span>
                <small>另有 {a.commentCount} 条精选评论</small>
              </div>
            </div>
            <div className="sample-strip">
              <span>
                仅代表当前采集样本；分类可重叠，比例不一定合计为 100%。
              </span>
              <SourceDialog
                analysis={a}
                sourceIds={a.sources.map((s) => s.id)}
                label="查看全部材料"
              />
            </div>
            <Tabs defaultValue="dimension" className="classification">
              <div className="section-title">
                <TabsList className="category-tabs">
                  <TabsTrigger value="dimension">按讨论角度</TabsTrigger>
                  <TabsTrigger value="stance">按观点立场</TabsTrigger>
                </TabsList>
                <span className="subtle">选择一个入口，让讨论深入一点</span>
              </div>
              {(['dimension', 'stance'] as const).map((type) => (
                <TabsContent value={type} key={type}>
                  <div className="category-grid">
                    {a.categories
                      .filter((c) => c.type === type)
                      .map((c: Category, i) => {
                        const Icon = icons[i % 3],
                          s = a.sources.find((s) => s.id === c.sourceIds[0]);
                        return (
                          <article
                            className={'category-card tone-' + (i % 3)}
                            key={c.id}
                          >
                            <div className="card-top">
                              <span className="category-icon">
                                <Icon size={23} />
                              </span>
                              <span className="subtle">0{i + 1}</span>
                            </div>
                            <h2>{c.name}</h2>
                            <p className="category-description">
                              {c.description}
                            </p>
                            <div className="count-line">
                              <b>
                                {c.sampleCount} / {a.sampleCount} 条来源
                              </b>
                              <span>{Math.round(c.sampleRatio * 100)}%</span>
                            </div>
                            <div
                              className="ratio-track"
                              aria-label={c.sampleCount + '条来源涉及这一分类'}
                            >
                              <span
                                style={{
                                  width:
                                    Math.min(100, c.sampleRatio * 100) + '%',
                                }}
                              />
                            </div>
                            {s && (
                              <blockquote>
                                <Quote size={16} />
                                <p>
                                  {s.text.slice(0, 68)}
                                  {s.text.length > 68 ? '…' : ''}
                                </p>
                                <SourceDialog
                                  analysis={a}
                                  sourceIds={c.sourceIds.slice(0, 2)}
                                  label="代表材料"
                                />
                              </blockquote>
                            )}
                            <Link
                              className="enter-room"
                              href={
                                '/discussion/' +
                                encodeURIComponent(c.id) +
                                '?analysis=' +
                                encodeURIComponent(id)
                              }
                            >
                              进入讨论区
                              <ArrowRight size={18} />
                            </Link>
                          </article>
                        );
                      })}
                  </div>
                  {!a.categories.some((c) => c.type === type) && (
                    <p className="muted">当前材料尚不足以整理出这一类观点。</p>
                  )}
                </TabsContent>
              ))}
            </Tabs>
            <div className="insight-grid">
              <section className="insight-card">
                <div className="insight-title">
                  <Check size={19} />
                  <h2>当前材料中的共同点</h2>
                </div>
                {a.commonGround.length ? (
                  a.commonGround.map((f) => (
                    <div key={f.id}>
                      <p>{f.text}</p>
                      <EvidenceLinks
                        analysis={a}
                        evidenceRefs={f.evidenceRefs}
                      />
                    </div>
                  ))
                ) : (
                  <p className="muted">尚未发现有足够材料支持的共同点。</p>
                )}
                <small>重合表述，不代表所有作者已达成共识。</small>
              </section>
              <section className="insight-card">
                <div className="insight-title">
                  <Split size={19} />
                  <h2>真正值得讨论的分歧</h2>
                </div>
                {a.disagreements.length ? (
                  a.disagreements.map((f) => (
                    <div key={f.id}>
                      <p>{f.text}</p>
                      <EvidenceLinks
                        analysis={a}
                        evidenceRefs={f.evidenceRefs}
                      />
                    </div>
                  ))
                ) : (
                  <p className="muted">当前样本没有呈现出明确分歧。</p>
                )}
              </section>
            </div>
            <section className="round-banner">
              <div>
                <span className="eyebrow">
                  <MessagesSquare size={17} /> Agent 圆桌
                </span>
                <h2>让不同观点，坐下来谈一谈。</h2>
                <p>从主张到回应，再到仍然缺少的证据。</p>
              </div>
              <Link
                className="button primary"
                href={'/roundtable?analysis=' + encodeURIComponent(id)}
              >
                进入圆桌 <Sparkles size={17} />
              </Link>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
