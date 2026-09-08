import type { JobError } from '@/shared/jobs';
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public canUsePreset = false,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      ...options,
      headers,
      signal: options?.signal ?? AbortSignal.timeout(100000),
    });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      '连接中断或等待超时，请检查网络后再试。请求未自动重发。',
    );
  }
  let value: { data: T; error?: JobError };
  try {
    value = await res.json();
  } catch {
    throw new ApiError(
      'RESPONSE_INVALID',
      '服务响应异常，请稍后再试。',
      res.status,
    );
  }
  if (!res.ok)
    throw new ApiError(
      value.error?.code || 'REQUEST_FAILED',
      value.error?.message || '操作未完成，请稍后重试。',
      res.status,
      value.error?.canUsePreset,
    );
  return value.data;
}
export const post = <T>(path: string, data: unknown, options?: RequestInit) =>
  api<T>(path, { ...options, method: 'POST', body: JSON.stringify(data) });
