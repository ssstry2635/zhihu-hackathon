import assert from 'node:assert/strict';

// Supply an isolated Playwright page. This checks the demo's real UI without
// publishing posts or invoking Zhihu. Run against a built production server.
export async function checkNavigation(page, origin) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /TypeError|RSC prefetch|Invalid hook|Error:/.test(message.text())) errors.push(message.text());
  });
  const checkpoints = [];
  async function readyRound() {
    await page.getByRole('heading', {name:'不同观点，在这里相遇。',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname, '/roundtable');
  }
  await page.goto(origin, {waitUntil:'networkidle'});
  await page.getByRole('link',{name:'Agent 圆桌',exact:true}).click();
  await readyRound(); checkpoints.push('首页导航 → 圆桌');
  await page.getByRole('button',{name:'下一条发言',exact:true}).click();
  assert.equal(await page.locator('.round-message').count(),2);
  await page.getByRole('button',{name:'播放讨论',exact:true}).click();
  await page.locator('.round-message').nth(2).waitFor();
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await page.getByRole('button',{name:'查看完整讨论',exact:true}).click();
  assert.equal(await page.locator('.round-message').count(),8);
  checkpoints.push('下一条、播放/暂停、完整讨论');
  await page.getByRole('button',{name:'依据 1',exact:true}).first().click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  checkpoints.push('查看并关闭来源');
  await page.getByRole('link',{name:'补充这个问题',exact:true}).first().click();
  await page.getByRole('button',{name:'提交补充',exact:true}).waitFor();
  assert.ok(new URL(page.url()).pathname.startsWith('/discussion/'));
  assert.ok(new URL(page.url()).searchParams.get('gap'));
  checkpoints.push('圆桌问题 → 对应讨论区');
  await page.getByRole('link',{name:'返回观点总览',exact:true}).click();
  await page.getByRole('link',{name:'进入讨论区',exact:true}).first().click();
  await page.getByRole('button',{name:'发布观点',exact:true}).waitFor();
  checkpoints.push('总览 → 分类讨论区');
  await page.getByRole('link',{name:'返回观点总览',exact:true}).click();
  await page.getByRole('link',{name:'进入圆桌',exact:true}).click();
  await readyRound(); checkpoints.push('总览圆桌入口');
  await page.getByRole('link',{name:'问题现场',exact:true}).click();
  await page.getByRole('button',{name:'见山另一面',exact:true}).click();
  await page.getByRole('link',{name:'进入讨论区',exact:true}).first().waitFor();
  assert.equal(new URL(page.url()).pathname,'/overview');
  checkpoints.push('主按钮 → 观点总览');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  return {checkpoints, browserErrors: errors.length};
}
