'use client';
import { useEffect, useState } from 'react';
import Link from '@/components/page-link';
import { Button } from '@/components/ui/button';
import { api, ensureVisitor } from '@/lib/api';
import { findTopic } from '@/shared/topics';
import type { AnalysisHistory } from '@/shared/jobs';
import { jobStageLabels } from '@/shared/jobs';
export function RecentAnalyses() {
  const [history, setHistory] = useState<AnalysisHistory | null>(null);
  const [error, setError] = useState('');
  function load() {
    return ensureVisitor()
      .then(() =>
        api<AnalysisHistory>('/history', {
          signal: AbortSignal.timeout(15000),
        }),
      )
      .then(
        (value) => {
          setHistory(value);
          setError('');
        },
        () => setError('暂时无法读取历史记录，请稍后再试。'),
      );
  }
  useEffect(() => {
    void load();
  }, []);
  const pending = history?.jobs.filter((j) => j.status !== 'succeeded') ?? [];
  return (
    <section
      id="recent"
      className="recent-analyses"
      aria-labelledby="recent-heading"
    >
      <div className="section-title">
        <h2 id="recent-heading">最近分析</h2>
        <Button variant="ghost" onClick={load}>
          刷新记录
        </Button>
      </div>
      <p className="muted">
        保存在当前浏览器访客身份下。关闭标签页后仍可回来查看；清除网站 Cookie
        或更换浏览器后无法自动找回。
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {!history && !error && <output>正在读取历史记录…</output>}
      {history && !history.results.length && !pending.length && (
        <p className="empty-history">还没有分析记录，先选一个议题开始吧。</p>
      )}
      {history && history.results.length > 0 && (
        <ul className="history-list" aria-label="最近的分析结果">
          {history.results.map((result) => (
            <li key={result.id}>
              <div>
                <span className="tag">
                  {result.sourceMode === 'mock' ? '预置演示' : '真实检索快照'}
                </span>
                <Link
                  href={'/overview?analysis=' + encodeURIComponent(result.id)}
                >
                  {result.title}
                </Link>
                <p className="subtle">
                  最近使用{' '}
                  {new Date(result.lastSeenAt).toLocaleString('zh-CN', {
                    hour12: false,
                  })}{' '}
                  · 材料时间{' '}
                  {new Date(result.collectedAt).toLocaleDateString('zh-CN')}
                </p>
              </div>
              <Link
                className="history-action"
                href={'/overview?analysis=' + encodeURIComponent(result.id)}
              >
                查看结果
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <>
          <h3>进行中与未完成的任务</h3>
          <ul className="history-list" aria-label="最近的采集任务">
            {pending.map((job) => (
              <li key={job.id}>
                <div>
                  <b>{findTopic(job.topicId)?.title ?? '历史议题'}</b>
                  <p className="subtle">
                    {job.status === 'failed'
                      ? (job.error?.message ?? '任务未完成')
                      : jobStageLabels[job.stage]}
                  </p>
                </div>
                <Link
                  className="history-action"
                  href={
                    '/?topic=' +
                    encodeURIComponent(job.topicId) +
                    '&job=' +
                    encodeURIComponent(job.id)
                  }
                >
                  查看任务
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
