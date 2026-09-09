'use client';
import Link from '@/components/page-link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  MessageCircle,
  ThumbsUp,
  Send,
  RefreshCw,
  X,
  Bookmark,
  ExternalLink,
  MessagesSquare,
} from 'lucide-react';
import { AppShell, BackLink } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loading, ErrorState, EmptyDiscussion } from '@/components/states';
import { SourceDialog } from '@/components/source-dialog';
import { useAnalysis } from '@/features/use-analysis';
import { api, post, ensureVisitor } from '@/lib/api';
import {
  contributionLabels,
  type ContributionType,
  type Gap,
  type Post,
} from '@/shared/types';
import { useDiscussionTools } from '@/features/webmcp';
type PostPage = { posts: Post[]; nextCursor: string | null };
export default function Discussion() {
  const { id, analysis: a, error: analysisError } = useAnalysis();
  const params = useParams();
  const categoryId = String(params.categoryId);
  const query = useSearchParams(),
    gapId = query.get('gap');
  const category = a?.categories.find((c) => c.id === categoryId);
  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nickname, setNickname] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<ContributionType>('opinion');
  const [externalUrl, setExternalUrl] = useState('');
  const [reply, setReply] = useState<Post | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);
  const [busy, setBusy] = useState(false);
  const [liking, setLiking] = useState<string | null>(null);
  const requestId = useRef<string | null>(null),
    composer = useRef<HTMLDivElement>(null);
  const room =
    '/analyses/' +
    encodeURIComponent(id) +
    '/categories/' +
    encodeURIComponent(categoryId) +
    '/posts';
  const draftKey =
    'jianshan-draft:' + id + ':' + categoryId + ':' + (gapId || '');
  const load = useCallback(
    async (more = false) => {
      const data = await api<PostPage>(
        room + (more && cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
      );
      setItems((prev) =>
        more
          ? [
              ...prev,
              ...data.posts.filter((p) => !prev.some((v) => v.id === p.id)),
            ]
          : data.posts,
      );
      setCursor(data.nextCursor);
      setLoaded(true);
    },
    [room, cursor],
  );
  useEffect(() => {
    if (!a || !category) return;
    let active = true;
    setLoaded(false);
    setItems([]);
    setError('');
    setGap(null);
    setReply(null);
    setContent(sessionStorage.getItem(draftKey) || '');
    ensureVisitor()
      .then((v) => {
        if (active) setNickname(v.displayName === '访客' ? '' : v.displayName);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    api<PostPage>(room)
      .then((data) => {
        if (active) {
          setItems(data.posts);
          setCursor(data.nextCursor);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoaded(true);
        }
      });
    if (gapId)
      api<Gap & { analysisId: string }>('/gaps/' + encodeURIComponent(gapId))
        .then((g) => {
          if (active) {
            if (g.analysisId !== id || g.categoryId !== categoryId)
              throw new Error('这个待解问题不属于当前讨论区。');
            setGap(g);
            setType('experience');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [a, category, room, draftKey, gapId, id, categoryId]);
  function editContent(value: string) {
    setContent(value);
    sessionStorage.setItem(draftKey, value);
    requestId.current = null;
  }
  function stageDraft(value: string, kind: ContributionType) {
    editContent(value);
    setType(kind);
    composer.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  useDiscussionTools({ analysis: a, category, posts: items, stageDraft });
  async function submit() {
    if (!content.trim() || busy || !nickname.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post('/visitors/session', { displayName: nickname });
      requestId.current ??= crypto.randomUUID();
      const p = await post<Post>(room, {
        content,
        contributionType: type,
        parentPostId: reply?.id || null,
        gapId: reply ? null : gap?.id || null,
        sourceIds: [],
        externalEvidenceUrl: type === 'evidence' ? externalUrl : null,
        requestId: requestId.current,
      });
      setItems((prev) =>
        prev.some((x) => x.id === p.id) ? prev : [...prev, p],
      );
      if (gap && !reply)
        setGap({ ...gap, supplementCount: gap.supplementCount + 1 });
      setContent('');
      sessionStorage.removeItem(draftKey);
      setReply(null);
      setExternalUrl('');
      requestId.current = null;
      setNotice(
        gap && !reply ? '补充已保存，并已关联圆桌问题。' : '你的发言已发布。',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '发布未完成。');
    } finally {
      setBusy(false);
    }
  }
  async function like(p: Post) {
    setLiking(p.id);
    setError('');
    try {
      const updated = await api<Post>(
        '/posts/' + encodeURIComponent(p.id) + '/like',
        { method: 'PUT', body: JSON.stringify({ liked: !p.likedByMe }) },
      );
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '点赞未完成。');
    } finally {
      setLiking(null);
    }
  }
  function chooseReply(p: Post) {
    setReply(p);
    composer.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const renderPost = (p: Post, isReply = false) => (
    <article
      className={'post-card ' + (isReply ? 'reply-card' : '')}
      key={p.id}
    >
      <div className="author">
        <span
          className={'avatar ' + (p.origin === 'user' ? 'user-avatar' : '')}
        >
          {p.authorName.slice(0, 1)}
        </span>
        <b>{p.authorName}</b>
        <span className="post-type">
          {contributionLabels[p.contributionType]}
        </span>
        <span className="subtle post-origin">
          {p.origin === 'seed' ? '预置发言' : '访客发言'}
        </span>
      </div>
      <p className="post-content">{p.content}</p>
      {p.gapId && (
        <span className="gap-linked">
          <Bookmark size={13} />
          关联圆桌待解问题
        </span>
      )}
      {p.sourceIds.length > 0 && a && (
        <SourceDialog analysis={a} sourceIds={p.sourceIds} label="引用材料" />
      )}
      {p.externalEvidenceUrl && (
        <a
          className="source-external"
          href={p.externalEvidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          补充链接
          <ExternalLink size={13} />
        </a>
      )}
      <div className="post-actions">
        <Button
          variant="ghost"
          className={p.likedByMe ? 'liked' : ''}
          aria-pressed={p.likedByMe}
          disabled={liking === p.id}
          onClick={() => like(p)}
        >
          <ThumbsUp size={15} />
          {p.voteCount || '赞同'}
        </Button>
        {!isReply && (
          <Button variant="ghost" onClick={() => chooseReply(p)}>
            <MessageCircle size={15} />
            回复
          </Button>
        )}
        <time>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</time>
      </div>
    </article>
  );
  return (
    <AppShell
      page="discussion"
      analysisId={id}
      topicId={a?.topicId}
      live={a?.sourceMode === 'live'}
    >
      <main className="container">
        {analysisError ? (
          <ErrorState message={analysisError} />
        ) : !a ? (
          <Loading />
        ) : !category ? (
          <ErrorState message="这个分类不存在，请返回总览。" />
        ) : (
          <>
            <BackLink analysisId={id} />
            <div className="discussion-heading">
              <div>
                <div className="eyebrow">
                  分类讨论区 <span>/</span>{' '}
                  {category.type === 'dimension' ? '讨论角度' : '观点立场'}
                </div>
                <h1>{category.name}</h1>
                <p className="muted">{category.description}</p>
              </div>
              <span className="room-symbol">
                <MessagesSquare size={43} />
              </span>
            </div>
            <div className="page-grid">
              <section>
                <div className="room-question">
                  <span className="overline">围绕这个问题，聊深一点</span>
                  <h2>{category.discussionQuestion}</h2>
                  <p>同一个角度，可以有不同立场。欢迎补充背景、经历和依据。</p>
                </div>
                {gap && (
                  <div className="gap-callout">
                    <span>
                      <Bookmark size={15} />
                      来自 Agent 圆桌的待解问题
                    </span>
                    <h3>{gap.question}</h3>
                    <p>
                      已有 {gap.supplementCount}{' '}
                      条补充。你的发言将与这个问题关联。
                    </p>
                  </div>
                )}
                <div className="section-title discussion-list-title">
                  <h2>
                    讨论中的声音{' '}
                    <span className="count-bubble">
                      {items.filter((p) => !p.parentPostId).length}
                    </span>
                  </h2>
                  <Button
                    variant="ghost"
                    onClick={() => load().catch((e) => setError(e.message))}
                  >
                    <RefreshCw size={15} />
                    刷新
                  </Button>
                </div>
                {!loaded ? (
                  <Loading label="正在载入讨论…" />
                ) : !items.length ? (
                  <EmptyDiscussion />
                ) : (
                  items
                    .filter((p) => !p.parentPostId)
                    .map((p) => (
                      <div className="thread" key={p.id}>
                        {renderPost(p)}
                        {items
                          .filter((r) => r.parentPostId === p.id)
                          .map((r) => renderPost(r, true))}
                      </div>
                    ))
                )}
                {cursor && (
                  <Button
                    className="button"
                    variant="outline"
                    onClick={() => load(true).catch((e) => setError(e.message))}
                  >
                    加载更多讨论
                  </Button>
                )}
                <div className="composer" ref={composer}>
                  <div className="section-title">
                    <h2>{reply ? '回应这条讨论' : '补充你的另一面'}</h2>
                    <span className="subtle">发言保存在共享讨论区</span>
                  </div>
                  {reply && (
                    <div className="reply-context">
                      回复 {reply.authorName}：{reply.content.slice(0, 45)}…
                      <Button
                        variant="ghost"
                        aria-label="取消回复"
                        onClick={() => setReply(null)}
                      >
                        <X size={15} />
                      </Button>
                    </div>
                  )}
                  <label className="field-label" htmlFor="display-name">
                    你的显示昵称
                  </label>
                  <input
                    id="display-name"
                    className="text-input nickname-input"
                    value={nickname}
                    maxLength={20}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="给讨论留一个名字"
                    disabled={busy}
                  />
                  <fieldset disabled={busy}>
                    <legend className="field-label">这次想补充什么？</legend>
                    <RadioGroup
                      value={type}
                      onValueChange={(v) => setType(v as ContributionType)}
                      className="contribution-options"
                    >
                      {Object.entries(contributionLabels).map(
                        ([value, label]) => (
                          <label key={value}>
                            <RadioGroupItem value={value} />
                            {label}
                          </label>
                        ),
                      )}
                    </RadioGroup>
                  </fieldset>
                  <label className="sr-only" htmlFor="post-content">
                    发言内容
                  </label>
                  <textarea
                    id="post-content"
                    value={content}
                    maxLength={2000}
                    onChange={(e) => editContent(e.target.value)}
                    rows={5}
                    disabled={busy}
                    placeholder={
                      type === 'experience'
                        ? '说说你的起点、尝试的任务，以及结果。'
                        : type === 'condition'
                          ? '这个建议在什么条件下成立？'
                          : type === 'evidence'
                            ? '你有什么资料可以支持或补充讨论？'
                            : '从一个具体的观察开始，分享你的看法。'
                    }
                  />
                  {type === 'evidence' && (
                    <>
                      <label className="field-label" htmlFor="evidence-url">
                        公开资料链接（可选）
                      </label>
                      <input
                        id="evidence-url"
                        className="text-input"
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                        placeholder="https://"
                        disabled={busy}
                      />
                    </>
                  )}
                  <div className="composer-bottom">
                    <span className="subtle">
                      {content.length}/2000 · 尊重不同经历
                    </span>
                    <Button
                      className="button primary"
                      disabled={
                        busy ||
                        !content.trim() ||
                        !nickname.trim() ||
                        Boolean(gapId && !gap)
                      }
                      onClick={submit}
                    >
                      <Send size={16} />
                      {busy
                        ? '正在发布…'
                        : reply
                          ? '发布回复'
                          : gap
                            ? '提交补充'
                            : '发布观点'}
                    </Button>
                  </div>
                  {error && (
                    <p className="inline-error" role="alert">
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="inline-success" role="status">
                      {notice}
                    </p>
                  )}
                </div>
              </section>
              <aside>
                <div className="room-sidebar">
                  <h3>讨论从这些材料开始</h3>
                  {category.sourceIds.slice(0, 3).map((sid) => {
                    const s = a.sources.find((s) => s.id === sid);
                    return (
                      s && (
                        <div className="related-source" key={sid}>
                          <span className="subtle">
                            {a.sourceMode === 'mock'
                              ? '模拟样本'
                              : s.kind === 'comment'
                                ? '精选评论'
                                : '来源摘要'}
                          </span>
                          <h4>{s.title}</h4>
                          <SourceDialog
                            analysis={a}
                            sourceIds={[sid]}
                            label="查看材料"
                          />
                        </div>
                      )
                    );
                  })}
                  <SourceDialog
                    analysis={a}
                    sourceIds={category.sourceIds}
                    label="查看本分类全部材料"
                  />
                </div>
                <div className="room-sidebar supplemental">
                  <Bookmark size={20} />
                  <h3>已补充材料</h3>
                  {items.some((p) => p.gapId) ? (
                    items
                      .filter((p) => p.gapId)
                      .map((p) => (
                        <p key={p.id}>
                          <b>{p.authorName}</b>
                          <br />
                          {p.content.slice(0, 85)}
                          {p.content.length > 85 ? '…' : ''}
                        </p>
                      ))
                  ) : (
                    <p>圆桌带来的问题，会在这里积累用户的经历与依据。</p>
                  )}
                </div>
                <Link
                  className="round-side-link"
                  href={'/roundtable?analysis=' + encodeURIComponent(id)}
                >
                  <MessagesSquare size={22} />
                  <div>
                    <b>听听另一边怎么说</b>
                    <span>进入 Agent 圆桌</span>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              </aside>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
