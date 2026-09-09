// 官方依据：zhihu skill 0.5.3-beta.20260904115023 / references/http-api.md
// 开发接入使用官方 HTTP 协议；Access Secret 只在服务端读取。
import { env } from '@/db';
import { AppError } from './http';
import { withCallPermit } from './budget';
import type { AppConfig, Source } from '@/shared/types';
export const SKILL_VERSION = '0.5.3-beta.20260904115023';
export const hasZhihuSecret = () => Boolean(env.ZHIHU_ACCESS_SECRET?.trim());
export function getZhihuConfig(): AppConfig {
  const model = env.ZHIHU_MODEL?.trim() || 'zhida-fast-1p5';
  const modelSupported = ['zhida-fast-1p5', 'zhida-thinking-1p5'].includes(
    model,
  );
  return {
    liveAvailable: hasZhihuSecret() && modelSupported,
    credentialConfigured: hasZhihuSecret(),
    readiness: !hasZhihuSecret()
      ? 'missing-secret'
      : !modelSupported
        ? 'unsupported-model'
        : 'configured-unverified',
    skillVersion: SKILL_VERSION,
    model: modelSupported ? model : null,
    searchLimit: 10,
    cacheMinutes: 60,
  };
}
export function assertLiveReady() {
  if (!hasZhihuSecret())
    throw new AppError(
      'LIVE_NOT_CONFIGURED',
      '实时采集暂未启用，请先体验预置演示。',
      503,
    );
  if (!getZhihuConfig().liveAvailable)
    throw new AppError(
      'MODEL_NOT_SUPPORTED',
      '服务端模型配置不受支持，请使用预置演示。',
      503,
    );
}
function headers() {
  if (!hasZhihuSecret())
    throw new AppError(
      'LIVE_NOT_CONFIGURED',
      '实时采集暂未启用，请先体验预置演示。',
      503,
    );
  return {
    Authorization: 'Bearer ' + env.ZHIHU_ACCESS_SECRET!.trim(),
    'X-Request-Timestamp': Math.floor(Date.now() / 1000).toString(),
    'Content-Type': 'application/json',
  };
}
function upstreamError(status?: number, code?: number): AppError {
  if (status === 401 || status === 403 || code === 20001)
    return new AppError(
      'ZHIHU_AUTH_FAILED',
      '知乎接口鉴权失败，请由团队检查 Access Secret、接口权限和服务器时间。',
      502,
    );
  if (status === 429 || code === 30001)
    return new AppError(
      'ZHIHU_RATE_LIMITED',
      '知乎接口已限制本次调用，请稍后再试，并由团队检查频率和可用额度。',
      429,
    );
  if (code === 10001)
    return new AppError(
      'ZHIHU_REQUEST_INVALID',
      '知乎接口未接受请求参数，请由团队检查接入配置。',
      502,
    );
  return new AppError(
    'ZHIHU_UNAVAILABLE',
    '知乎接口暂不可用。未自动重复调用，可使用预置演示。',
    502,
  );
}
async function officialFetch(
  url: string,
  init: RequestInit,
  visitorId: string,
  operationKey: string | null = null,
) {
  const authHeaders = headers();
  return withCallPermit(
    visitorId,
    async () => {
      try {
        const res = await fetch(url, {
          ...init,
          headers: authHeaders,
          redirect: 'error',
          signal: AbortSignal.timeout(40000),
        });
        if (!res.ok) throw upstreamError(res.status);
        let value: unknown;
        try {
          value = await res.json();
        } catch {
          throw new AppError(
            'ZHIHU_RESPONSE_INVALID',
            '知乎接口返回了无法解析的响应，可使用预置演示。',
            502,
          );
        }
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new AppError(
            'ZHIHU_RESPONSE_INVALID',
            '知乎接口响应结构不完整，可使用预置演示。',
            502,
          );
        const result = value as Record<string, unknown>;
        if (typeof result.Code === 'number' && result.Code !== 0)
          throw upstreamError(undefined, result.Code);
        if (result.error) throw upstreamError();
        return result;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (
          error instanceof Error &&
          ['AbortError', 'TimeoutError'].includes(error.name)
        )
          throw new AppError(
            'ZHIHU_TIMEOUT',
            '知乎接口响应超时。结果可能尚未返回，未自动重复调用。',
            504,
          );
        throw new AppError(
          'ZHIHU_UNAVAILABLE',
          '知乎接口连接失败。未自动重复调用，可使用预置演示。',
          502,
        );
      }
    },
    operationKey,
  );
}
export function normalizeSearch(payload: unknown): Source[] {
  const value = payload as {
    Code?: number;
    Data?: { Items?: Record<string, unknown>[] };
  };
  if (value && typeof value.Code === 'number' && value.Code !== 0)
    throw upstreamError(undefined, value.Code);
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
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const type = String(item.ContentType).toLowerCase();
    if (!['answer', 'article'].includes(type)) continue;
    const externalId =
      typeof item.ContentID === 'string' ? item.ContentID.trim() : '';
    const text = (typeof item.ContentText === 'string' ? item.ContentText : '')
      .trim()
      .slice(0, 2000);
    if (!externalId || !text) continue;
    const id = type + ':' + externalId;
    if (seen.has(id)) continue;
    seen.add(id);
    let url: string | null = null;
    try {
      const u = new URL(String(item.Url));
      if (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        (u.hostname === 'zhihu.com' || u.hostname.endsWith('.zhihu.com'))
      )
        url = u.href;
    } catch {}
    result.push({
      id,
      kind: type as 'answer' | 'article',
      externalId,
      title:
        typeof item.Title === 'string' ? item.Title.slice(0, 500) : '知乎内容',
      text,
      authorName: typeof item.AuthorName === 'string' ? item.AuthorName : null,
      url,
      relation: 'unknown',
      collectedAt: now,
      truncated:
        typeof item.ContentText === 'string' &&
        item.ContentText.trim().length > text.length,
    });
    const comments = Array.isArray(item.CommentInfoList)
      ? item.CommentInfoList
      : [];
    const commentTexts = new Set<string>();
    for (const c of comments.slice(0, 2)) {
      const t =
        c && typeof c.Content === 'string'
          ? c.Content.trim().slice(0, 400)
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
        truncated: c.Content.trim().length > t.length,
      });
    }
  }
  // Preserve main sources first, then add comments within the remaining budget.
  let remaining = 24000;
  const budgeted: Source[] = [];
  for (const source of [
    ...result.filter((s) => s.kind !== 'comment'),
    ...result.filter((s) => s.kind === 'comment'),
  ]) {
    if (remaining <= 0) break;
    if (
      source.parentSourceId &&
      !budgeted.some((s) => s.id === source.parentSourceId)
    )
      continue;
    const text = source.text.slice(0, remaining);
    budgeted.push({
      ...source,
      text,
      truncated: source.truncated || text.length < source.text.length,
    });
    remaining -= text.length;
  }
  return budgeted;
}
export async function searchZhihu(query: string, visitorId = 'system') {
  if (!query.trim() || query.length > 200)
    throw new AppError('ZHIHU_REQUEST_INVALID', '搜索关键词须为 1 至 200 字。');
  const u = new URL('https://developer.zhihu.com/api/v1/content/zhihu_search');
  u.searchParams.set('Query', query.trim());
  u.searchParams.set('Count', '10');
  return normalizeSearch(
    await officialFetch(u.href, { method: 'GET' }, visitorId),
  );
}
export async function generateJson(
  system: string,
  input: unknown,
  visitorId = 'system',
  operationKey: string | null = null,
): Promise<unknown> {
  const configured = env.ZHIHU_MODEL?.trim() || 'zhida-fast-1p5';
  if (!['zhida-fast-1p5', 'zhida-thinking-1p5'].includes(configured))
    throw new AppError(
      'MODEL_NOT_SUPPORTED',
      '当前模型尚未通过本应用的上下文能力验证。',
      503,
    );
  const contentInput = JSON.stringify(input);
  if (contentInput.length + system.length > 60000)
    throw new AppError(
      'MODEL_INPUT_TOO_LARGE',
      '本次材料较长，请减少输入材料后再生成。未调用模型。',
      413,
    );
  const value = await officialFetch(
    'https://developer.zhihu.com/v1/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({
        model: configured,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: contentInput },
        ],
        stream: false,
      }),
    },
    visitorId,
    operationKey,
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
