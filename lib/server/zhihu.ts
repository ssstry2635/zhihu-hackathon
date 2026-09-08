// 官方依据：zhihu skill 0.5.3-beta.20260904115023 / references/http-api.md
// 开发接入使用官方 HTTP 协议；Access Secret 只在服务端读取。
import { env } from '@/db';
import { AppError } from './http';
import type { Source } from '@/shared/types';
export const SKILL_VERSION = '0.5.3-beta.20260904115023';
export const hasZhihuSecret = () => Boolean(env.ZHIHU_ACCESS_SECRET?.trim());
function headers() {
  if (!hasZhihuSecret())
    throw new AppError(
      'LIVE_NOT_CONFIGURED',
      '实时采集暂未启用，请先体验预置演示。',
      503,
    );
  return {
    Authorization: 'Bearer ' + env.ZHIHU_ACCESS_SECRET,
    'X-Request-Timestamp': Math.floor(Date.now() / 1000).toString(),
    'Content-Type': 'application/json',
  };
}
async function officialFetch(url: string, init: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: headers(),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok)
      throw new AppError(
        'ZHIHU_UNAVAILABLE',
        '知乎接口暂不可用（HTTP ' + res.status + '）。可返回预置演示。',
        502,
      );
    return (await res.json()) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'ZHIHU_UNAVAILABLE',
      '知乎接口响应超时或连接失败。未自动重复调用。',
      502,
    );
  }
}
export function normalizeSearch(payload: unknown): Source[] {
  const value = payload as {
    Code?: number;
    Data?: { Items?: Record<string, unknown>[] };
  };
  if (!value || value.Code !== 0 || !Array.isArray(value.Data?.Items))
    throw new AppError(
      'ZHIHU_UNAVAILABLE',
      '知乎搜索未成功，请检查接口授权或额度。',
      502,
    );
  const result: Source[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  for (const item of (value.Data?.Items ?? []).slice(0, 10)) {
    const type = String(item.ContentType).toLowerCase();
    if (!['answer', 'article'].includes(type)) continue;
    const externalId = String(item.ContentID ?? '');
    const text = String(item.ContentText ?? '')
      .trim()
      .slice(0, 8000);
    if (!externalId || !text) continue;
    const id = type + ':' + externalId;
    if (seen.has(id)) continue;
    seen.add(id);
    let url: string | null = null;
    try {
      const u = new URL(String(item.Url));
      if (
        u.protocol === 'https:' &&
        (u.hostname === 'zhihu.com' || u.hostname.endsWith('.zhihu.com'))
      )
        url = u.href;
    } catch {}
    result.push({
      id,
      kind: type as 'answer' | 'article',
      externalId,
      title: String(item.Title ?? '知乎内容'),
      text,
      authorName: typeof item.AuthorName === 'string' ? item.AuthorName : null,
      url,
      relation: 'unknown',
      collectedAt: now,
    });
    const comments = Array.isArray(item.CommentInfoList)
      ? item.CommentInfoList
      : [];
    const commentTexts = new Set<string>();
    for (const c of comments.slice(0, 5)) {
      const t =
        c && typeof c.Content === 'string'
          ? c.Content.trim().slice(0, 2000)
          : '';
      if (!t || commentTexts.has(t)) continue;
      commentTexts.add(t);
      result.push({
        id: id + ':comment:' + commentTexts.size,
        kind: 'comment',
        parentSourceId: id,
        title: '精选评论',
        text: t,
        authorName: null,
        url: null,
        relation: 'unknown',
        collectedAt: now,
      });
    }
  }
  return result;
}
export async function searchZhihu(query: string) {
  const u = new URL('https://developer.zhihu.com/api/v1/content/zhihu_search');
  u.searchParams.set('Query', query);
  u.searchParams.set('Count', '10');
  return normalizeSearch(await officialFetch(u.href, { method: 'GET' }));
}
export async function generateJson(
  system: string,
  input: unknown,
): Promise<unknown> {
  const configured = env.ZHIHU_MODEL || 'zhida-fast-1p5';
  if (!['zhida-fast-1p5', 'zhida-thinking-1p5'].includes(configured))
    throw new AppError(
      'MODEL_NOT_SUPPORTED',
      '当前模型尚未通过本应用的上下文能力验证。',
      503,
    );
  const value = await officialFetch(
    'https://developer.zhihu.com/v1/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({
        model: configured,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(input) },
        ],
        stream: false,
      }),
    },
  );
  const content = (value as { choices?: { message?: { content?: string } }[] })
    .choices?.[0]?.message?.content;
  if (typeof content !== 'string')
    throw new AppError(
      'MODEL_OUTPUT_INVALID',
      'AI 未返回可用的整理结果。',
      502,
    );
  try {
    return JSON.parse(
      content
        .trim()
        .replace(/^\x60\x60\x60(?:json)?\s*/i, '')
        .replace(/\s*\x60\x60\x60$/, ''),
    );
  } catch {
    throw new AppError(
      'MODEL_OUTPUT_INVALID',
      'AI 整理格式未通过检查，可使用预置演示。',
      502,
    );
  }
}
