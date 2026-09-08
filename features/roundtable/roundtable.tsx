'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  ArrowRight,
  ArrowUpRight,
  MessagesSquare,
  Bookmark,
  Sparkles,
  Send,
  RefreshCw,
  Check,
  Split,
  MessageCircle,
} from 'lucide-react';
import { AppShell, BackLink } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Loading, ErrorState } from '@/components/states';
import { EvidenceLinks } from '@/components/source-dialog';
import { useAnalysis } from '@/features/use-analysis';
import { api, post } from '@/lib/api';
import type { Roundtable as Round } from '@/shared/types';
const phases = {
  opening: '开场',
  statement: '观点陈述',
  exchange: '观点交锋',
  summary: '主持人总结',
  followup: '继续追问',
};
export default function Roundtable() {
  const { id, analysis: a, error: analysisError } = useAnalysis();
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!a) return;
    let active = true;
    setRound(null);
    setError('');
    setPlaying(false);
    post<Round>('/analyses/' + encodeURIComponent(id) + '/roundtables', {})
      .then((r) => {
        if (active) {
          setRound(r);
          setVisible(r.followupUsed ? r.messages.length : 1);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [a, id]);
  useEffect(() => {
    if (!round || !playing) return;
    const timer = setInterval(
      () =>
        setVisible((v) => {
          if (v >= round.messages.length) {
            setPlaying(false);
            return v;
          }
          return v + 1;
        }),
      2600,
    );
    return () => clearInterval(timer);
  }, [playing, round]);
  async function ask() {
    if (!round || busy || !question.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await post<Round>('/roundtables/' + round.id + '/followups', {
        question,
      });
      setRound(r);
      setVisible(r.messages.length);
      setQuestion('');
      setPlaying(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '追问未完成。');
      try {
        setRound(await api<Round>('/roundtables/' + round.id));
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!round) return;
    try {
      setRound(await api<Round>('/roundtables/' + round.id));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新失败。');
    }
  }
  const finished = round
    ? visible >= round.messages.filter((m) => m.phase !== 'followup').length
    : false;
  return (
    <AppShell page="roundtable" analysisId={id} live={a?.sourceMode === 'live'}>
      <main className="container">
        {analysisError ? (
          <ErrorState message={analysisError} />
        ) : !a ? (
          <Loading />
        ) : !round ? (
          error ? (
            <ErrorState message={error} />
          ) : (
            <Loading
              label={
                a.sourceMode === 'mock'
                  ? '正在准备预置圆桌…'
                  : '正在根据来源组织圆桌，可能需要一些时间…'
              }
            />
          )
        ) : (
          <>
            <BackLink analysisId={id} />
            <div className="round-heading">
              <div>
                <div className="eyebrow">
                  <MessagesSquare size={16} /> Agent 圆桌 <span>/</span>{' '}
                  {round.generationMode === 'scripted'
                    ? '预置演示脚本'
                    : '基于当前来源的 AI 讨论'}
                </div>
                <h1>不同观点，在这里相遇。</h1>
                <p className="muted">{a.title}</p>
              </div>
              <span className="round-orbit">
                <MessagesSquare size={42} />
              </span>
            </div>
            <div className="round-toolbar">
              <div className="phase-steps">
                {['opening', 'statement', 'exchange', 'summary'].map(
                  (phase, i) => (
                    <span
                      key={phase}
                      className={
                        round.messages
                          .slice(0, visible)
                          .some((m) => m.phase === phase)
                          ? 'reached'
                          : ''
                      }
                    >
                      <b>{i + 1}</b>
                      {phases[phase as keyof typeof phases]}
                    </span>
                  ),
                )}
              </div>
              <div className="play-controls">
                <Button
                  variant="outline"
                  className="button"
                  onClick={() => {
                    if (visible >= round.messages.length) setVisible(1);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}{' '}
                  {playing ? '暂停' : '播放讨论'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setVisible(round.messages.length);
                    setPlaying(false);
                  }}
                >
                  查看完整讨论
                </Button>
              </div>
            </div>
            <div className="page-grid round-grid">
              <section>
                <div className="transcript" aria-live="polite">
                  {round.messages.slice(0, visible).map((m) => {
                    const role = round.roles.find(
                      (r) => r.id === m.speakerRoleId,
                    )!;
                    const parent = m.replyToMessageId
                      ? round.messages.find((p) => p.id === m.replyToMessageId)
                      : null;
                    const parentRole = round.roles.find(
                      (r) => r.id === parent?.speakerRoleId,
                    );
                    return (
                      <article
                        className={
                          'round-message ' +
                          (role.id === 'host' ? 'moderator' : '')
                        }
                        key={m.id}
                      >
                        <div className={'role-avatar ' + role.color}>
                          {role.id === 'host' ? (
                            <Sparkles size={20} />
                          ) : (
                            role.name.slice(0, 1)
                          )}
                        </div>
                        <div className="message-body">
                          <div className="message-author">
                            <b>{role.name}</b>
                            <span className="ai-label">AI</span>
                            <span className="subtle">{phases[m.phase]}</span>
                          </div>
                          {parent && (
                            <div className="responding">
                              <MessageCircle size={13} />
                              回应 {parentRole?.name} ·{' '}
                              {parent.content.slice(0, 32)}…
                            </div>
                          )}
                          <p>{m.content}</p>
                          <EvidenceLinks
                            analysis={a}
                            evidenceRefs={m.evidenceRefs}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!finished && (
                  <div className="continue-discussion">
                    <span>观点之间的回应，也值得认真听。</span>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setVisible((v) =>
                          Math.min(v + 1, round.messages.length),
                        )
                      }
                    >
                      下一条发言
                      <ArrowRight size={15} />
                    </Button>
                  </div>
                )}
                {finished && (
                  <>
                    <div className="round-summary">
                      <div>
                        <h3>
                          <Check size={17} />
                          材料中的共同点
                        </h3>
                        {round.commonGround.length ? (
                          round.commonGround.map((f) => (
                            <p key={f.id}>{f.text}</p>
                          ))
                        ) : (
                          <p>尚未发现足够明确的共同点。</p>
                        )}
                      </div>
                      <div>
                        <h3>
                          <Split size={17} />
                          仍然存在的分歧
                        </h3>
                        {round.disagreements.map((f) => (
                          <p key={f.id}>{f.text}</p>
                        ))}
                      </div>
                    </div>
                    <section className="followup">
                      <div className="section-title">
                        <h2>还有一个问题，想继续问</h2>
                        <span className="subtle">本场可追问一次</span>
                      </div>
                      {round.followupUsed ? (
                        <p className="inline-success">
                          你的追问已加入本场讨论。更多经历与依据，可以带到真人讨论区。
                        </p>
                      ) : round.followupState ? (
                        <p className="inline-error">
                          追问
                          {round.followupState === 'pending'
                            ? '仍在处理，刷新可查看结果'
                            : '未成功完成，未自动重复调用'}
                          。可以继续到讨论区交流。
                        </p>
                      ) : (
                        <>
                          <div className="suggested-questions">
                            {[
                              '如果每周只有三小时呢？',
                              '哪些基础知识不能省略？',
                            ].map((q) => (
                              <Button
                                key={q}
                                variant="outline"
                                onClick={() => setQuestion(q)}
                              >
                                {q}
                              </Button>
                            ))}
                          </div>
                          <label
                            className="field-label"
                            htmlFor="followup-question"
                          >
                            你的追问
                          </label>
                          <div className="followup-input">
                            <input
                              id="followup-question"
                              className="text-input"
                              value={question}
                              maxLength={300}
                              onChange={(e) => setQuestion(e.target.value)}
                              placeholder="加入一个更具体的条件…"
                              disabled={busy}
                            />
                            <Button
                              className="button primary"
                              disabled={busy || !question.trim()}
                              onClick={ask}
                            >
                              <Send size={15} />
                              {busy ? '正在回应…' : '追问'}
                            </Button>
                          </div>
                          {round.generationMode === 'scripted' && (
                            <p className="small-note">
                              预置模式使用固定回应示范流程，自由追问不会触发实时模型。
                            </p>
                          )}
                        </>
                      )}
                      {error && (
                        <p className="inline-error" role="alert">
                          {error}
                        </p>
                      )}
                    </section>
                  </>
                )}
              </section>
              <aside>
                <section className="round-roles">
                  <span className="overline">本轮讨论角色</span>
                  {round.roles
                    .filter((r) => r.id !== 'host')
                    .map((r) => (
                      <div className="role-row" key={r.id}>
                        <span className={'role-avatar ' + r.color}>
                          {r.name.slice(0, 1)}
                        </span>
                        <div>
                          <b>{r.name}</b>
                          <p>{r.description}</p>
                        </div>
                      </div>
                    ))}
                  <p className="small-note">
                    角色代表材料中的观点，不代表原作者本人参与。
                  </p>
                </section>
                <section className="gap-panel">
                  <div className="section-title">
                    <h3>
                      <Bookmark size={17} />
                      把问题交回给人
                    </h3>
                    <Button
                      variant="ghost"
                      aria-label="刷新补充数量"
                      onClick={refresh}
                    >
                      <RefreshCw size={14} />
                    </Button>
                  </div>
                  <p>有些答案，需要真实经历来补充。</p>
                  {round.gaps.map((g) => (
                    <div className="gap-item" key={g.id}>
                      <h4>{g.question}</h4>
                      <span>{g.supplementCount} 条用户补充</span>
                      <Link
                        href={
                          '/discussion/' +
                          encodeURIComponent(g.categoryId) +
                          '?analysis=' +
                          encodeURIComponent(id) +
                          '&gap=' +
                          encodeURIComponent(g.id)
                        }
                      >
                        补充这个问题
                        <ArrowUpRight size={16} />
                      </Link>
                    </div>
                  ))}
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
