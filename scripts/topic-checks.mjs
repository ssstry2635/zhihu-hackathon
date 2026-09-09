import assert from 'node:assert/strict';
export async function checkTopics(page, origin) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cases = [
    ['ai-coding', '普通人现在还有必要学习 AI 编程吗？', 'demo-v1'],
    ['remote-work', '远程办公能成为长期工作方式吗？', 'demo-remote-work-v1'],
    [
      'ai-homework',
      '大学课程应该允许使用 AI 完成作业吗？',
      'demo-ai-homework-v1',
    ],
  ];
  for (const [topic, title, id] of cases) {
    await page.goto(origin + '/?topic=' + topic, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await page.locator('.topic-picker a').count(), 3);
    await page.getByRole('button', { name: '见山另一面', exact: true }).click();
    await page.waitForURL('**/overview?analysis=' + id);
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    const data = await page.evaluate(
      async (id) => (await (await fetch('/api/analyses/' + id)).json()).data,
      id,
    );
    assert.equal(data.topicId, topic);
    assert.equal(data.title, title);
    await page
      .getByRole('link', { name: '进入讨论区', exact: true })
      .first()
      .click();
    await page.getByRole('button', { name: '发布观点', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('analysis'), id);
    await page.getByRole('link', { name: 'Agent 圆桌', exact: true }).click();
    await page
      .getByRole('button', { name: '查看完整讨论', exact: true })
      .click();
    assert.equal(await page.locator('.round-message').count(), 8);
    assert(
      (await page.locator('.round-message').allTextContents())
        .join(' ')
        .includes(topic === 'ai-coding' ? 'AI' : title),
    );
    await page
      .getByRole('link', { name: '补充这个问题', exact: true })
      .first()
      .click();
    await page.getByRole('button', { name: '提交补充', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('analysis'), id);
    await page.getByRole('link', { name: '问题现场', exact: true }).click();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('topic'), topic);
  }
  const context = page.context();
  await page.close();
  const restored = await context.newPage();
  await restored.goto(origin + '/#recent', { waitUntil: 'networkidle' });
  const history = restored.getByRole('list', { name: '最近的分析结果' });
  for (const [, title] of cases)
    await history.getByRole('link', { name: title, exact: true }).waitFor();
  assert.equal(
    await restored.evaluate(() => sessionStorage.length),
    0,
    'History survives a new tab without session storage',
  );
  await history.getByRole('link', { name: cases[1][1], exact: true }).click();
  await restored
    .getByRole('heading', { name: cases[1][1], exact: true })
    .waitFor();
  await restored.setViewportSize({ width: 390, height: 844 });
  await restored.getByRole('link', { name: '最近分析', exact: true }).click();
  await restored
    .getByRole('heading', { name: '最近分析', exact: true })
    .waitFor();
  assert(
    await restored.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    'Mobile page must not overflow',
  );
  await restored.getByRole('list', { name: '最近的分析结果' }).waitFor();
  assert(
    await restored
      .locator('.topic-picker')
      .evaluate((el) => el.getBoundingClientRect().height > 180),
    'All three mobile topic cards must be visible',
  );
  await restored.screenshot({
    path: 'work/a-expansion-mobile.png',
    fullPage: true,
  });
  await restored.setViewportSize({ width: 1440, height: 1000 });
  await restored.screenshot({
    path: 'work/a-expansion-desktop.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await restored.close();
  return {
    topics: cases.map((c) => c[0]),
    newTabHistory: 'passed',
    mobileOverflow: false,
    browserErrors: errors.length,
  };
}
