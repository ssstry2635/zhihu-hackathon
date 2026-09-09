import { loadEnv } from 'vite';
const local = loadEnv('development', process.cwd(), 'ZHIHU_');
const secret =
  process.env.ZHIHU_ACCESS_SECRET ?? local.ZHIHU_ACCESS_SECRET ?? '';
const model =
  (process.env.ZHIHU_MODEL ?? local.ZHIHU_MODEL)?.trim() || 'zhida-fast-1p5';
const supported = ['zhida-fast-1p5', 'zhida-thinking-1p5'].includes(model);
console.log('本地配置检查（不发起知乎请求）');
console.log('Node.js：' + process.version);
console.log(
  'Access Secret：' +
    (secret.trim() ? '已配置，实际权限待联调' : '未配置，可运行预置演示'),
);
console.log('模型：' + (supported ? model : '不受支持，请检查 ZHIHU_MODEL'));
console.log('下一步：pnpm db:migrate，然后 pnpm dev');
if (!supported) process.exitCode = 1;

const limits = [
  ['ZHIHU_DAILY_CALL_LIMIT', 120, 10000],
  ['ZHIHU_VISITOR_DAILY_CALL_LIMIT', 20, 1000],
  ['ZHIHU_VISITOR_MINUTE_CALL_LIMIT', 6, 60],
  ['ZHIHU_MAX_CONCURRENT_CALLS', 2, 8],
];
for (const [key, fallback, max] of limits) {
  const raw = (process.env[key] ?? local[key] ?? '').trim() || String(fallback);
  const valid = /^\d+$/.test(raw) && Number(raw) <= max;
  console.log(
    key + '：' + (valid ? Number(raw) : '无效，必须是 0 至 ' + max + ' 的整数'),
  );
  if (!valid) process.exitCode = 1;
}
console.log(
  '以上为本应用请求次数上限，不是知乎官方剩余额度；0 会阻止对应实时请求。',
);
