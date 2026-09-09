'use client';
import { useEffect, useState } from 'react';

import {
  ArrowUpRight,
  ArrowRight,
  MessageCircle,
  Sparkles,
  LoaderCircle,
  Radio,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { topics, findTopic, type Topic } from '@/shared/topics';
import { useSearchParams } from 'next/navigation';
import Link from '@/components/page-link';
import { RecentAnalyses } from './recent-analyses';
import { SourceDialog } from '@/components/source-dialog';
import type { AppConfig } from '@/shared/types';
import { jobStageLabels } from '@/shared/jobs';
import { useEntryJob } from './use-entry-job';
export default function Question() {
  const params = useSearchParams();
  const topicId = params.get('topic') || 'ai-coding';
  const topic = findTopic(topicId);
  if (!topic)
    return (
      <AppShell page="question">
        <main className="container">
          <h1>这个议题尚未开放</h1>
          <p>请选择一个已开放的议题。</p>
          {topics.map((t) => (
            <p key={t.id}>
              <Link href={'/?topic=' + t.id}>{t.title}</Link>
            </p>
          ))}
        </main>
      </AppShell>
    );
  return (
    <QuestionContent
      key={topic.id + ':' + (params.get('job') || '')}
      topic={topic}
      requestedJobId={params.get('job')}
    />
  );
}
function QuestionContent({
  topic,
  requestedJobId,
}: {
  topic: Topic;
  requestedJobId: string | null;
}) {
  const demoAnalysis = topic.preset;
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const entry = useEntryJob(topic.id, requestedJobId);
  const busy = entry.submitting;
  const active =
    entry.job?.status === 'running' || entry.job?.status === 'queued';
  function loadConfig() {
    return api<AppConfig>('/config', {
      signal: AbortSignal.timeout(15000),
    }).then(
      (value) => {
        setConfig(value);
        setConfigError(false);
      },
      () => setConfigError(true),
    );
  }
  useEffect(() => {
    void loadConfig();
  }, []);
  return (
    <AppShell page="question" topicId={topic.id} analysisId={demoAnalysis.id}>
      <main className="container">
        <div className="eyebrow">
          问题现场 <span>/</span> {topic.section}{' '}
          <span className="mini-label">模拟知乎问题页</span>
        </div>
        <nav className="topic-picker" aria-label="选择议题">
          {topics.map((t) => (
            <Link
              key={t.id}
              href={'/?topic=' + t.id}
              aria-current={t.id === topic.id ? 'page' : undefined}
              className={t.id === topic.id ? 'selected' : ''}
            >
              <span>{t.tags[0]}</span>
              <b>{t.title}</b>
            </Link>
          ))}
        </nav>
        <div className="question-head">
          <div>
            <div className="tag-row">
              {topic.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
            <h1>{topic.title}</h1>
            <p className="muted">{topic.subtitle}</p>
          </div>
          <div className="question-number">
            {String(topics.indexOf(topic) + 1).padStart(2, '0')}
            <span>本期议题</span>
          </div>
        </div>
        <div className="page-grid">
          <section>
            <div className="section-title">
              <h2>不同经历，不同答案</h2>
              <span className="subtle">
                {demoAnalysis.sampleCount} 条主来源 ·{' '}
                {demoAnalysis.commentCount} 条精选评论
              </span>
            </div>
            {demoAnalysis.sources.slice(0, 3).map((s, i) => (
              <article className="answer-card" key={s.id}>
                <div className="author">
                  <span className={'avatar color-' + i}>
                    {s.authorName?.slice(0, 1)}
                  </span>
                  <b>{s.authorName}</b>
                  <span className="subtle">预置角色</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <div className="answer-bottom">
                  <span className="subtle">
                    <MessageCircle size={15} />
                    一段经历，一个看问题的角度
                  </span>
                  <SourceDialog
                    analysis={demoAnalysis}
                    sourceIds={[s.id]}
                    label="查看样本"
                  />
                </div>
              </article>
            ))}
          </section>
          <aside>
            <div className="start-card">
              <Sparkles size={27} />
              <h2>这里，还有另一面。</h2>
              <p>把混在一起的观点整理清楚，找到你关心的讨论。</p>
              <Button
                className="button primary"
                disabled={busy || entry.restoring}
                onClick={entry.openPreset}
              >
                {busy ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <>
                    {active ? '先看预置演示' : '见山另一面'}
                    <ArrowUpRight size={18} />
                  </>
                )}
              </Button>
              {entry.restoring && (
                <output className="small-note">正在查找上次的采集任务…</output>
              )}
              {entry.job && (
                <section
                  className="entry-task"
                  aria-label="采集任务状态"
                  data-stage={entry.job.stage}
                  data-status={entry.job.status}
                >
                  <output>
                    <b>
                      {entry.job.status === 'failed'
                        ? '本次采集未完成'
                        : jobStageLabels[entry.job.stage]}
                    </b>
                  </output>
                  <ol className="entry-steps" aria-label="分析步骤">
                    {(['collecting', 'classifying', 'saving'] as const).map(
                      (stage) => (
                        <li
                          key={stage}
                          aria-current={
                            entry.job?.stage === stage ? 'step' : undefined
                          }
                        >
                          {jobStageLabels[stage]}
                        </li>
                      ),
                    )}
                  </ol>
                  {active && (
                    <p className="small-note">
                      进度来自本次任务。保持页面打开有助于完成采集；刷新后可查询已保存状态。
                    </p>
                  )}
                  {entry.job.status === 'queued' && (
                    <Button variant="outline" onClick={entry.resume}>
                      继续这次采集
                    </Button>
                  )}
                  {entry.job.status === 'succeeded' && entry.job.resultId && (
                    <Button
                      onClick={() => entry.openResult(entry.job!.resultId!)}
                    >
                      打开上次分析结果
                    </Button>
                  )}
                  {entry.job.error && (
                    <p className="inline-error" role="alert">
                      {entry.job.error.message}
                    </p>
                  )}
                </section>
              )}
              {entry.notice && (
                <p className="inline-error" role="alert">
                  {entry.notice}
                </p>
              )}
              {entry.lookupFailed && entry.hasJobId && (
                <Button variant="outline" onClick={entry.refresh}>
                  重新查询任务状态
                </Button>
              )}
              <div className="small-note">
                当前展示团队预置的模拟样本。
                <br />
                进入后可实际发帖、回复和补充材料。
              </div>
              <div className="live-entry">
                <Button
                  variant="ghost"
                  disabled={
                    busy || entry.restoring || active || !config?.liveAvailable
                  }
                  onClick={entry.startLive}
                >
                  <Radio size={15} /> 使用知乎实时采集 <ArrowRight size={15} />
                </Button>
                {configError ? (
                  <>
                    <span>暂时无法确认实时采集是否可用。</span>
                    <Button variant="ghost" onClick={loadConfig}>
                      重新检查
                    </Button>
                  </>
                ) : !config ? (
                  <span>正在检查实时采集是否可用…</span>
                ) : config.readiness === 'missing-secret' ? (
                  <span>实时采集暂未启用，先从预置演示开始。</span>
                ) : config.readiness === 'unsupported-model' ? (
                  <span>实时采集的模型配置需要调整，先体验预置演示。</span>
                ) : (
                  <span>服务端已配置凭证，首次采集将检验实际可用性。</span>
                )}
                <span>
                  实时模式检索最多 10
                  条相关结果及精选评论，不代表本问题全部回答。同一议题 1
                  小时内复用已保存快照。
                </span>
              </div>
            </div>
            <div className="note-card">
              <h3>两种空间，让讨论继续</h3>
              <p>
                <b>分类讨论区</b>
                <br />
                围绕同一角度，补充你的经历与依据。
              </p>
              <p>
                <b>Agent 圆桌</b>
                <br />
                看看不同观点如何回应彼此。
              </p>
            </div>
          </aside>
        </div>
        <RecentAnalyses />
      </main>
    </AppShell>
  );
}
