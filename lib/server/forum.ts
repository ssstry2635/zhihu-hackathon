import { getDb } from '@/db';
import { getAnalysis, getCategory } from './analysis';
import { assert, publicUrl, stringField } from './http';
import type { Post, Visitor } from '@/shared/types';
async function sessionHash(token: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export async function visitorFor(
  request: Request,
): Promise<{ visitor: Visitor; cookie?: string }> {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('jianshan_visitor='))
    ?.slice(17);
  if (token && /^[a-f0-9-]{72}$/.test(token)) {
    const row = await getDb()
      .prepare(
        'SELECT id,display_name AS displayName FROM visitors WHERE session_hash=?',
      )
      .bind(await sessionHash(token))
      .first<Visitor>();
    if (row) return { visitor: row };
  }
  const visitor = { id: crypto.randomUUID(), displayName: '访客' },
    secret = crypto.randomUUID() + crypto.randomUUID();
  await getDb()
    .prepare(
      'INSERT INTO visitors (id,display_name,created_at,session_hash) VALUES (?,?,?,?)',
    )
    .bind(
      visitor.id,
      visitor.displayName,
      new Date().toISOString(),
      await sessionHash(secret),
    )
    .run();
  return {
    visitor,
    cookie:
      'jianshan_visitor=' +
      secret +
      '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' +
      (new URL(request.url).protocol === 'https:' ? '; Secure' : ''),
  };
}
export async function renameVisitor(id: string, name: unknown) {
  const displayName = stringField(name, '昵称', 20);
  await getDb()
    .prepare('UPDATE visitors SET display_name=? WHERE id=?')
    .bind(displayName, id)
    .run();
  return { id, displayName };
}
type Row = {
  id: string;
  analysis_id: string;
  category_id: string;
  author_id: string | null;
  author_name: string;
  content: string;
  contribution_type: Post['contributionType'];
  parent_id: string | null;
  gap_id: string | null;
  source_ids: string;
  external_url: string | null;
  origin: Post['origin'];
  created_at: string;
  vote_count: number;
  liked_by_me: number;
};
export const postQuery =
  'SELECT p.*, (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) AS vote_count, (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id AND l.visitor_id=?) AS liked_by_me FROM posts p ';
function mapPost(r: Row): Post {
  return {
    id: r.id,
    analysisId: r.analysis_id,
    categoryId: r.category_id,
    authorId: r.author_id,
    authorName: r.author_name,
    content: r.content,
    contributionType: r.contribution_type,
    parentPostId: r.parent_id,
    gapId: r.gap_id,
    sourceIds: JSON.parse(r.source_ids),
    externalEvidenceUrl: r.external_url,
    origin: r.origin,
    createdAt: r.created_at,
    voteCount: r.vote_count,
    likedByMe: Boolean(r.liked_by_me),
  };
}
export async function getPost(id: string, visitorId: string) {
  const row = await getDb()
    .prepare(postQuery + 'WHERE p.id=?')
    .bind(visitorId, id)
    .first<Row>();
  assert(row, 'NOT_FOUND', '这条讨论不存在。', 404);
  return mapPost(row);
}
export async function listPosts(
  analysisId: string,
  categoryId: string,
  visitorId: string,
  cursor: string | null,
  gapId: string | null,
) {
  const analysis = await getAnalysis(analysisId);
  getCategory(analysis, categoryId);
  if (gapId) {
    const rows = await getDb()
      .prepare(
        postQuery +
          'WHERE p.analysis_id=? AND p.category_id=? AND p.gap_id=? ORDER BY p.created_at,p.id LIMIT 100',
      )
      .bind(visitorId, analysisId, categoryId, gapId)
      .all<Row>();
    return { posts: rows.results.map(mapPost), nextCursor: null };
  }
  let after = '';
  let afterId = '';
  if (cursor) {
    const p = await getPost(cursor, visitorId);
    assert(
      p.analysisId === analysisId &&
        p.categoryId === categoryId &&
        !p.parentPostId,
      'INVALID_CURSOR',
      '分页位置不属于当前讨论区。',
    );
    after = p.createdAt;
    afterId = p.id;
  }
  const roots = await getDb()
    .prepare(
      postQuery +
        'WHERE p.analysis_id=? AND p.category_id=? AND p.parent_id IS NULL AND (p.created_at>? OR (p.created_at=? AND p.id>?)) ORDER BY p.created_at,p.id LIMIT 51',
    )
    .bind(visitorId, analysisId, categoryId, after, after, afterId)
    .all<Row>();
  const page = roots.results.slice(0, 50);
  let replies: Row[] = [];
  if (page.length) {
    const marks = page.map(() => '?').join(',');
    const r = await getDb()
      .prepare(
        postQuery +
          'WHERE p.analysis_id=? AND p.category_id=? AND p.parent_id IN (' +
          marks +
          ') ORDER BY p.created_at,p.id LIMIT 500',
      )
      .bind(visitorId, analysisId, categoryId, ...page.map((p) => p.id))
      .all<Row>();
    replies = r.results;
  }
  return {
    posts: [...page, ...replies].map(mapPost),
    nextCursor: roots.results.length > 50 ? page.at(-1)!.id : null,
  };
}
export async function createPost(
  analysisId: string,
  categoryId: string,
  visitor: Visitor,
  input: Record<string, unknown>,
) {
  const analysis = await getAnalysis(analysisId);
  getCategory(analysis, categoryId);
  const content = stringField(input.content, '发言', 2000),
    requestId = stringField(input.requestId, '请求标识', 100);
  const existing = await getDb()
    .prepare('SELECT id FROM posts WHERE author_id=? AND request_id=?')
    .bind(visitor.id, requestId)
    .first<{ id: string }>();
  if (existing) {
    const p = await getPost(existing.id, visitor.id);
    assert(
      p.analysisId === analysisId &&
        p.categoryId === categoryId &&
        p.content === content,
      'REQUEST_CONFLICT',
      '该请求标识已经用于另一条发言。',
      409,
    );
    return p;
  }
  const type = input.contributionType || 'opinion';
  assert(
    ['opinion', 'experience', 'condition', 'evidence'].includes(String(type)),
    'INVALID_TYPE',
    '请选择有效的发言类型。',
  );
  let parentId: string | null = null;
  if (input.parentPostId) {
    parentId = stringField(input.parentPostId, '回复对象', 150);
    const parent = await getPost(parentId, visitor.id);
    assert(
      parent.analysisId === analysisId &&
        parent.categoryId === categoryId &&
        !parent.parentPostId,
      'INVALID_PARENT',
      '只能回复当前讨论区的一级帖子。',
    );
  }
  let gapId: string | null = null;
  if (input.gapId) {
    gapId = stringField(input.gapId, '待解问题', 150);
    const roundId = gapId.split('~')[0];
    const r = await getDb()
      .prepare('SELECT payload FROM rounds WHERE id=? AND analysis_id=?')
      .bind(roundId, analysisId)
      .first<{ payload: string }>();
    assert(r, 'INVALID_GAP', '该圆桌问题不存在。');
    const gap = JSON.parse(r.payload).gaps.find(
      (g: { id: string; categoryId: string }) =>
        g.id === gapId && g.categoryId === categoryId,
    );
    assert(gap && !parentId, 'INVALID_GAP', '请在对应讨论区直接补充这个问题。');
  }
  const sourceIds = Array.isArray(input.sourceIds)
    ? [...new Set(input.sourceIds)]
    : [];
  assert(
    sourceIds.length <= 5 &&
      sourceIds.every(
        (id) =>
          typeof id === 'string' && analysis.sources.some((s) => s.id === id),
      ),
    'INVALID_SOURCE',
    '引用来源不属于当前材料。',
  );
  const externalUrl = publicUrl(input.externalEvidenceUrl);
  const count = await getDb()
    .prepare(
      'SELECT COUNT(*) AS n FROM posts WHERE author_id=? AND created_at>?',
    )
    .bind(visitor.id, new Date(Date.now() - 60000).toISOString())
    .first<{ n: number }>();
  assert((count?.n ?? 0) < 10, 'RATE_LIMIT', '发言太快了，请稍后再试。', 429);
  const id = 'post-' + crypto.randomUUID();
  await getDb()
    .prepare(
      'INSERT OR IGNORE INTO posts (id,analysis_id,category_id,author_id,author_name,content,contribution_type,parent_id,gap_id,source_ids,external_url,origin,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      id,
      analysisId,
      categoryId,
      visitor.id,
      visitor.displayName,
      content,
      type,
      parentId,
      gapId,
      JSON.stringify(sourceIds),
      externalUrl,
      'user',
      requestId,
      new Date().toISOString(),
    )
    .run();
  const inserted = await getDb()
    .prepare('SELECT id FROM posts WHERE author_id=? AND request_id=?')
    .bind(visitor.id, requestId)
    .first<{ id: string }>();
  return getPost(inserted!.id, visitor.id);
}
export async function setLike(
  postId: string,
  visitorId: string,
  liked: unknown,
) {
  assert(typeof liked === 'boolean', 'INVALID_LIKE', '点赞状态无效。');
  await getPost(postId, visitorId);
  if (liked)
    await getDb()
      .prepare('INSERT OR IGNORE INTO likes (post_id,visitor_id) VALUES (?,?)')
      .bind(postId, visitorId)
      .run();
  else
    await getDb()
      .prepare('DELETE FROM likes WHERE post_id=? AND visitor_id=?')
      .bind(postId, visitorId)
      .run();
  return getPost(postId, visitorId);
}
