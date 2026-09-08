'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { api, post } from '@/lib/api';
import { demoAnalysis, TOPIC_TITLE } from '@/shared/demo';
import { SourceDialog } from '@/components/source-dialog';
import type { AppConfig } from '@/shared/types';
export default function Question() {
  const router = useRouter();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  useEffect(() => {
    api<AppConfig>('/config')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  async function start(mode: 'mock' | 'live') {
    setBusy(true);
    setError('');
    setStage(
      mode === 'live' ? '正在检索知乎材料并整理观点…' : '正在载入预置样本…',
    );
    try {
      const result = await post<{ resultId: string }>(
        '/topics/ai-coding/analyses',
        { mode, requestId: crypto.randomUUID() },
      );
      router.push('/overview?analysis=' + encodeURIComponent(result.resultId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '未能完成分析。');
      setBusy(false);
      setStage('');
    }
  }
  return (
    <AppShell page="question">
      <main className="container">
        <div className="eyebrow">
          问题现场 <span>/</span> 科技与学习{' '}
          <span className="mini-label">模拟知乎问题页</span>
        </div>
        <div className="question-head">
          <div>
            <div className="tag-row">
              <span className="tag">AI 编程</span>
              <span className="tag">学习与成长</span>
            </div>
            <h1>{TOPIC_TITLE}</h1>
            <p className="muted">当工具越来越聪明，我们还需要学到什么程度？</p>
          </div>
          <div className="question-number">
            01<span>本期议题</span>
          </div>
        </div>
        <div className="page-grid">
          <section>
            <div className="section-title">
              <h2>不同经历，不同答案</h2>
              <span className="subtle">12 条主来源 · 4 条精选评论</span>
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
                disabled={busy}
                onClick={() => start('mock')}
              >
                {busy ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <>
                    见山另一面
                    <ArrowUpRight size={18} />
                  </>
                )}
              </Button>
              {stage && (
                <p role="status" className="small-note">
                  {stage}
                </p>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <div className="small-note">
                当前展示团队预置的模拟样本。
                <br />
                进入后可实际发帖、回复和补充材料。
              </div>
              <div className="live-entry">
                <Button
                  variant="ghost"
                  disabled={busy || !config?.liveAvailable}
                  onClick={() => start('live')}
                >
                  <Radio size={15} /> 使用知乎实时采集 <ArrowRight size={15} />
                </Button>
                {!config?.liveAvailable && (
                  <span>实时采集暂未启用，先从预置演示开始。</span>
                )}
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
      </main>
    </AppShell>
  );
}
