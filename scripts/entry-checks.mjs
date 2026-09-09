import assert from 'node:assert/strict';
/** Isolated Playwright page; artificial API fixtures, never calls Zhihu. */
export async function checkEntry(page, origin) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let configFails = true,
    configured = false,
    created = 0,
    executed = 0;
  let current = null;
  const config = {
    liveAvailable: true,
    credentialConfigured: true,
    readiness: 'configured-unverified',
    skillVersion: 'fixture',
    model: 'zhida-fast-1p5',
    searchLimit: 10,
    cacheMinutes: 60,
  };
  const reply = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  await page.route(origin + '/api/config', (route) =>
    configFails
      ? route.abort()
      : reply(route, {
          ...config,
          liveAvailable: configured,
          credentialConfigured: configured,
          readiness: configured ? 'configured-unverified' : 'missing-secret',
        }),
  );
  await page.route(origin + '/api/topics/ai-coding/analyses', async (route) => {
    const data = route.request().postDataJSON();
    if (data.mode === 'mock')
      return reply(route, { resultId: 'demo-v1', cached: true });
    created++;
    const now = new Date().toISOString();
    current = {
      id: data.requestId,
      topicId: 'ai-coding',
      status: 'queued',
      stage: 'queued',
      resultId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
    return reply(route, { jobId: current.id, job: current }, 202);
  });
  await page.route(origin + '/api/jobs/**', (route) => {
    if (route.request().method() === 'POST') {
      executed++;
      current = {
        ...current,
        status: 'running',
        stage: 'collecting',
        updatedAt: new Date().toISOString(),
      };
    }
    return reply(
      route,
      current,
      route.request().method() === 'POST' ? 202 : 200,
    );
  });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.getByText('暂时无法确认实时采集是否可用。').waitFor();
  configFails = false;
  await page.getByRole('button', { name: '重新检查', exact: true }).click();
  await page.getByText('实时采集暂未启用，先从预置演示开始。').waitFor();
  assert(
    await page.getByRole('button', { name: /使用知乎实时采集/ }).isDisabled(),
  );
  configured = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /使用知乎实时采集/ }).click();
  await page.locator('[data-stage="collecting"]').waitFor();
  assert(
    await page.getByRole('button', { name: /使用知乎实时采集/ }).isDisabled(),
  );
  assert.equal(created, 1);
  assert.equal(executed, 1);
  current = {
    ...current,
    stage: 'classifying',
    updatedAt: new Date(Date.now() + 5).toISOString(),
  };
  await page.locator('[data-stage="classifying"]').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-stage="classifying"]').waitFor();
  assert.equal(created, 1);
  assert.equal(
    executed,
    1,
    'Reload must only query, never resubmit model work',
  );
  current = {
    ...current,
    status: 'failed',
    updatedAt: new Date(Date.now() + 10).toISOString(),
    error: {
      code: 'ZHIHU_RATE_LIMITED',
      message: '测试响应：本次调用已限流。',
      canUsePreset: true,
    },
  };
  await page.getByText('测试响应：本次调用已限流。').waitFor();
  await page.getByRole('button', { name: '见山另一面', exact: true }).click();
  await page.waitForURL('**/overview?analysis=demo-v1');
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.unroute(origin + '/api/config');
  await page.unroute(origin + '/api/topics/ai-coding/analyses');
  await page.unroute(origin + '/api/jobs/**');
  await page.evaluate(() => {
    sessionStorage.removeItem('jianshan:analysis-job:v1');
    sessionStorage.removeItem('jianshan:analysis-job:v2:ai-coding');
  });
  return {
    status: 'passed',
    scope: 'artificial API fixtures',
    checks: [
      '配置失败与重新检查',
      '缺少凭证禁用实时入口',
      '真实阶段字段驱动界面',
      '重复按钮禁用',
      '刷新只查询原任务',
      '失败后明确进入预置快照',
    ],
    created,
    executed,
    browserErrors: errors.length,
  };
}
