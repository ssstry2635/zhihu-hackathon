'use client';
import Link from '@/components/page-link';
import { useEffect, useState } from 'react';
import { RoomStage } from './room-stage';
import { WeChatChat } from './wechat-chat';
import {
  Play,
  Pause,
  ArrowUpRight,
  MessagesSquare,
  Bookmark,
  Sparkles,
  Send,
  RefreshCw,
  Check,
  Split,
} from 'lucide-react';
import { AppShell, BackLink } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Loading, ErrorState } from '@/components/states';
import { SourceDialog } from '@/components/source-dialog';
import { useAnalysis } from '@/features/use-analysis';
import { api, post } from '@/lib/api';
import type { Roundtable as Round } from '@/shared/types';
const phases = {
  opening: '开场',
  statement: '观点陈述',
  exchange: '观点交锋',
  summary: '主持人总结',
  followup: '继续追问',
  user: '访客发言',
};
const scenes = [
  {
    id: 'morning',
    name: '晨光共创室',
    caption: '把议题与主张先摆上桌面',
  },
  {
    id: 'strategy',
    name: '蓝图作战室',
    caption: '追问理由，观察观点如何交锋',
  },
  {
    id: 'night',
    name: '夜间研究室',
    caption: '整理共识、分歧和待解问题',
  },
] as const;
const sceneForPhase = {
  opening: 'morning',
  statement: 'morning',
  exchange: 'strategy',
  summary: 'night',
  followup: 'night',
  user: 'strategy',
} as const;
export default function Roundtable() {
  const { id, analysis: a, error: analysisError } = useAnalysis();
  const [roundResult, setRoundResult] = useState<Round | null>(null);
  const [errorResult, setErrorResult] = useState<{
    analysisId: string;
    message: string;
  } | null>(null);
  const [visible, setVisible] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const [manualScene, setManualScene] = useState<string | null>(null);
  const round = roundResult?.analysisId === id ? roundResult : null;
  const error = errorResult?.analysisId === id ? errorResult.message : '';
  function setCurrentError(message: string) {
    setErrorResult(message ? { analysisId: id, message } : null);
  }
  useEffect(() => {
    if (!a) return;
    let active = true;
    post<Round>('/analyses/' + encodeURIComponent(id) + '/roundtables', {})
      .then((r) => {
        if (active) {
          setRoundResult(r);
          setVisible(
            r.scheduler?.mode === 'autonomous' || r.followupUsed
              ? r.messages.length
              : 1,
          );
          setManualScene(null);
          setErrorResult(null);
          setPlaying(
            r.scheduler?.mode === 'autonomous'
              ? r.scheduler.state === 'running'
              : !r.followupUsed,
          );
        }
      })
      .catch((e) => {
        if (active) setErrorResult({ analysisId: id, message: e.message });
      });
    return () => {
      active = false;
    };
  }, [a, id]);
  async function ask() {
    if (!round || busy || !question.trim()) return;
    setBusy(true);
    setCurrentError('');
    try {
      const r = await post<Round>('/roundtables/' + round.id + '/followups', {
        question,
      });
      setRoundResult(r);
      setVisible(r.messages.length);
      setQuestion('');
      setPlaying(false);
    } catch (e) {
      setCurrentError(e instanceof Error ? e.message : '追问未完成。');
      try {
        setRoundResult(await api<Round>('/roundtables/' + round.id));
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  async function sendUserMessage(content: string) {
    if (!round || chatBusy) return;
    setChatBusy(true);
    setChatError('');
    try {
      const r = await post<Round>(
        '/roundtables/' + encodeURIComponent(round.id) + '/messages',
        { content },
      );
      setRoundResult(r);
      setVisible(r.messages.length);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : '发言未完成。');
      try {
        setRoundResult(await api<Round>('/roundtables/' + round.id));
      } catch {}
    } finally {
      setChatBusy(false);
    }
  }
  async function refresh() {
    if (!round) return;
    try {
      setRoundResult(await api<Round>('/roundtables/' + round.id));
      setCurrentError('');
    } catch (e) {
      setCurrentError(e instanceof Error ? e.message : '刷新失败。');
    }
  }
  async function advance() {
    if (
      !round ||
      scheduling ||
      round.scheduler?.mode !== 'autonomous' ||
      round.scheduler.state !== 'running'
    )
      return;
    setScheduling(true);
    setCurrentError('');
    try {
      const next = await post<Round>(
        '/roundtables/' + encodeURIComponent(round.id) + '/advance',
        {},
      );
      setRoundResult(next);
      setVisible(next.messages.length);
    } catch (e) {
      setPlaying(false);
      setCurrentError(
        e instanceof Error ? e.message : '主持人暂时无法安排下一位 Agent。',
      );
    } finally {
      setScheduling(false);
    }
  }
  const finished = round
    ? round.scheduler?.mode === 'autonomous'
      ? round.scheduler.state === 'complete'
      : visible >= round.messages.filter((m) => m.phase !== 'followup').length
    : false;
  const activeMessage = round
    ? round.messages[Math.max(0, Math.min(visible, round.messages.length) - 1)]
    : null;
  const automaticSceneId = activeMessage
    ? sceneForPhase[activeMessage.phase]
    : 'morning';
  const activeScene =
    scenes.find((scene) => scene.id === (manualScene ?? automaticSceneId)) ??
    scenes[0];
  const heading = round && a ? (
    <div className="round-heading">
      <div>
        <div className="eyebrow">
          <MessagesSquare size={16} /> Agent 圆桌 <span>/</span>{' '}
          {round.generationMode === 'scripted'
            ? '预置演示脚本'
            : '真实来源 · 自主 Agent 调度'}
        </div>
        <h1>不同观点，在这里相遇。</h1>
        <p className="muted">{a.title}</p>
      </div>
      <span className="round-orbit">
        <MessagesSquare size={42} />
      </span>
    </div>
  ) : null;
  const stage = round ? (
    <RoomStage
      round={round}
      visible={visible}
      playing={playing}
      scene={activeScene.id}
      onScene={setManualScene}
      onTurnEnd={() => {
        if (round.scheduler?.mode === 'autonomous') {
          if (round.scheduler.state === 'complete') setPlaying(false);
          else void advance();
        } else if (visible >= round.messages.length) setPlaying(false);
        else setVisible((v) => v + 1);
      }}
    />
  ) : null;
  const liveToolbar = round && (
    <div className="round-toolbar">
      <div className="phase-steps">
        {['opening', 'statement', 'exchange', 'summary'].map((phase, i) => (
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
        ))}
      </div>
      <div className="play-controls">
        <span className="scheduler-state">
          {scheduling
            ? '主持人正在审核发言申请'
            : finished
              ? '本场圆桌已完成总结，你仍可继续发言'
              : playing
                ? '主持人持续调度 · Agent 自主申请中'
                : '调度暂时中断，可恢复'}
        </span>
        {!playing && !finished && (
          <Button
            variant="outline"
            className="button"
            disabled={scheduling}
            onClick={() => setPlaying(true)}
          >
            <Play size={15} /> 恢复调度
          </Button>
        )}
      </div>
    </div>
  );
  const toolbar = round && (
    <div className="round-toolbar">
      <div className="phase-steps">
        {['opening', 'statement', 'exchange', 'summary'].map((phase, i) => (
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
        ))}
      </div>
      <div className="play-controls">
        <span className="scheduler-state">
          {scheduling
            ? '主持人正在审核发言申请'
            : finished
              ? '本轮自主调度已完成'
              : playing
                ? '主持人调度 · Agent 自主申请中'
                : '主持人调度已暂停'}
        </span>
        <Button
          variant="outline"
          className="button"
          disabled={
            scheduling ||
            (round.scheduler?.mode === 'autonomous' && finished)
          }
          onClick={() => {
            if (
              round.scheduler?.mode !== 'autonomous' &&
              visible >= round.messages.length
            )
              setVisible(1);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}{' '}
          {playing ? '暂停调度' : '继续调度'}
        </Button>
      </div>
    </div>
  );
  const errorBanner = error && (
    <p className="inline-error round-scheduler-error" role="alert">
      {error}
    </p>
  );
  const summaryBlock = round && finished && (
    <div className="round-summary">
      <div>
        <h3>
          <Check size={17} />
          材料中的共同点
        </h3>
        {round.commonGround.length ? (
          round.commonGround.map((f) => <p key={f.id}>{f.text}</p>)
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
  );
  const gapsBlock = round && (
    <section className="gap-panel">
      <div className="section-title">
        <h3>
          <Bookmark size={17} />
          在知乎里问问真人
        </h3>
        <Button variant="ghost" aria-label="刷新补充数量" onClick={refresh}>
          <RefreshCw size={14} />
        </Button>
      </div>
      {round.gaps.map((g) => (
        <div className="gap-item" key={g.id}>
          <h4>{g.question}</h4>
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
  );
  return (
    <AppShell
      page="roundtable"
      analysisId={id}
      topicId={a?.topicId}
      live={a?.sourceMode === 'live'}
    >
      <main className="container round-game-page">
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
        ) : round.scheduler?.mode === 'autonomous' ? (
          <div className="round-live-layout">
            <div className="round-live-stage">
              <BackLink analysisId={id} />
              {heading}
              {stage}
              {liveToolbar}
              {errorBanner}
              {summaryBlock}
              <div className="round-live-gaps">{gapsBlock}</div>
            </div>
            <aside className="round-live-chat" aria-label="圆桌聊天">
              <WeChatChat
                round={round}
                analysis={a}
                sending={chatBusy}
                error={chatError}
                onSend={sendUserMessage}
              />
            </aside>
          </div>
        ) : (
          <>
            <BackLink analysisId={id} />
            {heading}
            {stage}
            {toolbar}
            {errorBanner}
            <div className="page-grid round-grid">
              <section>
                <div className="transcript" aria-live="polite">
                  {round.messages.slice(0, visible).map((m) => {
                    const role = round.roles.find(
                      (r) => r.id === m.speakerRoleId,
                    )!;
                    const roleIndex = round.roles.findIndex(
                      (candidate) => candidate.id === role.id,
                    );
                    const parent = m.replyToMessageId
                      ? round.messages.find(
                          (message) => message.id === m.replyToMessageId,
                        )
                      : null;
                    const parentRole = parent
                      ? round.roles.find(
                          (candidate) => candidate.id === parent.speakerRoleId,
                        )
                      : null;
                    return (
                      <article
                        className={
                          'round-message ' +
                          (role.id === 'host' ? 'moderator ' : '') +
                          (roleIndex % 2 === 1 ? 'from-right' : 'from-left')
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
                          </div>
                          <div className="message-bubble">
                            <p>{m.content}</p>
                            {parent && (
                              <blockquote className="message-quote">
                                <b>{parentRole?.name ?? '上一位 Agent'}：</b>
                                {parent.content.length > 72
                                  ? parent.content.slice(0, 72) + '…'
                                  : parent.content}
                              </blockquote>
                            )}
                            {m.evidenceRefs.length > 0 && (
                              <SourceDialog
                                analysis={a}
                                sourceIds={m.evidenceRefs.map(
                                  (evidence) => evidence.sourceId,
                                )}
                                label={String(m.evidenceRefs.length)}
                                compact
                              />
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {finished && (
                  <>
                    {summaryBlock}
                    <section className="followup">
                      <div className="section-title">
                        <h2>还有一个问题，想继续问</h2>
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
                        </>
                      )}
                    </section>
                  </>
                )}
              </section>
              <aside>{gapsBlock}</aside>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
