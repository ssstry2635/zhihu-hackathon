export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const value = (await res.json()) as { data: T; error?: { message?: string } };
  if (!res.ok)
    throw new Error(value.error?.message || '操作未完成，请稍后重试。');
  return value.data;
}
export const post = <T>(path: string, data: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(data) });
