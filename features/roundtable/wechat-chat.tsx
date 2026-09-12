'use client';
import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { SourceDialog } from '@/components/source-dialog';
import type { Analysis, Roundtable as Round } from '@/shared/types';

const phaseDividers: Record<string, string> = {
  opening: '圆桌开场',
  statement: '观点陈述',
  exchange: '观点交锋',
  summary: '主持人总结',
  followup: '继续追问',
  user: '访客加入讨论',
};
export function WeChatChat({
  round,
  analysis,
  sending,
  error,
  onSend,
}: {
  round: Round;
  analysis: Analysis;
  sending: boolean;
  error: string;
  onSend: (content: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [round.messages.length, sending]);
  const submit = () => {
    const content = draft.trim();
    if (!content || sending) return;
    onSend(content);
    setDraft('');
  };
  const speakerName = (speakerRoleId: string) =>
    speakerRoleId === 'user'
      ? '我'
      : (round.roles.find((role) => role.id === speakerRoleId)?.name ?? '现场访客');
  return (
    <div className="wechat-phone">
      <header className="wechat-header">
        <span className="wechat-header-title">
          圆桌讨论（{round.roles.length}）
        </span>
        <span className="wechat-header-sub">
          {round.messages.length} 条发言 · 实时生成 · 每条引用可溯源
        </span>
      </header>
      <div className="wechat-body" ref={listRef}>
        {round.messages.map((m, i) => {
          const prev = round.messages[i - 1];
          const divider =
            !prev || prev.phase !== m.phase
              ? (phaseDividers[m.phase] ?? '')
              : null;
          const isUser = m.speakerRoleId === 'user';
          const role = round.roles.find((r) => r.id === m.speakerRoleId);
          const parent = m.replyToMessageId
            ? round.messages.find((x) => x.id === m.replyToMessageId)
            : null;
          return (
            <div key={m.id}>
              {divider && <div className="wechat-divider">{divider}</div>}
              <div className={'wechat-row' + (isUser ? ' mine' : '')}>
                <div
                  className={
                    'wechat-avatar ' + (isUser ? 'me' : (role?.color ?? 'host'))
                  }
                >
                  {isUser ? (
                    '我'
                  ) : role?.id === 'host' ? (
                    <Sparkles size={15} />
                  ) : (
                    (role?.name ?? '友').slice(0, 1)
                  )}
                </div>
                <div className="wechat-col">
                  {!isUser && <div className="wechat-name">{role?.name}</div>}
                  <div className="wechat-bubble">
                    {parent && (
                      <blockquote className="wechat-quote">
                        <b>{speakerName(parent.speakerRoleId)}：</b>
                        {parent.content.length > 48
                          ? parent.content.slice(0, 48) + '…'
                          : parent.content}
                      </blockquote>
                    )}
                    <p>{m.content}</p>
                    {m.evidenceRefs.length > 0 && (
                      <SourceDialog
                        analysis={analysis}
                        sourceIds={m.evidenceRefs.map(
                          (evidence) => evidence.sourceId,
                        )}
                        label={'引用 ' + m.evidenceRefs.length + ' 条来源'}
                        compact
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {sending && <div className="wechat-typing">对方正在输入…</div>}
      </div>
      {error && (
        <p className="wechat-error" role="alert">
          {error}
        </p>
      )}
      <footer className="wechat-input">
        <input
          value={draft}
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={sending ? 'Agent 正在回应…' : '发言加入讨论…'}
          disabled={sending}
          aria-label="圆桌发言"
        />
        <button
          type="button"
          className="wechat-send"
          onClick={submit}
          disabled={sending || !draft.trim()}
          aria-label="发送"
        >
          <Send size={15} />
        </button>
      </footer>
      <p className="wechat-footnote">
        你的发言会即时加入圆桌，由最相关的 Agent 回应；每次发言消耗一次直答额度
      </p>
    </div>
  );
}
