export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(code, message, status);
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    assert(text.length <= 12000, 'TOO_LARGE', '提交内容过长。', 413);
    const value = JSON.parse(text);
    assert(
      value && typeof value === 'object' && !Array.isArray(value),
      'INVALID_BODY',
      '请求格式不正确。',
    );
    return value;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('INVALID_BODY', '请求内容不是有效 JSON。');
  }
}
export function stringField(
  value: unknown,
  name: string,
  max: number,
  min = 1,
) {
  assert(
    typeof value === 'string' &&
      value.trim().length >= min &&
      value.trim().length <= max,
    'INVALID_FIELD',
    name + '长度不正确。',
  );
  return value.trim();
}
export function publicUrl(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const raw = stringField(value, '链接', 2000);
  try {
    const u = new URL(raw);
    assert(
      ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password,
      'INVALID_URL',
      '请使用有效的公开网页链接。',
    );
    return u.href;
  } catch {
    throw new AppError('INVALID_URL', '请使用有效的公开网页链接。');
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(
    { data },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
export function errorInfo(error: unknown) {
  if (error instanceof AppError)
    return {
      code: error.code,
      message: error.message,
      canUsePreset:
        error.code.startsWith('ZHIHU_') ||
        [
          'MODEL_OUTPUT_INVALID',
          'MODEL_NOT_SUPPORTED',
          'EMPTY_SOURCES',
          'LIVE_NOT_CONFIGURED',
          'JOB_EXPIRED',
        ].includes(error.code),
    };
  return {
    code: 'INTERNAL_ERROR',
    message: '暂时无法完成操作，请稍后再试。',
    canUsePreset: false,
  };
}
export function fail(error: unknown) {
  if (!(error instanceof AppError))
    console.error(
      'Request failed:',
      error instanceof Error ? error.name : 'unknown',
    );
  return Response.json(
    { error: errorInfo(error) },
    {
      status: error instanceof AppError ? error.status : 500,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin)
    assert(
      origin === new URL(request.url).origin,
      'ORIGIN_REJECTED',
      '请在当前应用中完成操作。',
      403,
    );
}
