'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, post, ensureVisitor } from '@/lib/api';
import type { AnalysisJob, AnalysisStart } from '@/shared/jobs';
const LEGACY_KEY = 'jianshan:analysis-job:v1';
const readStored = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const saveStored = (key: string, id: string | null) => {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {}
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : '未能完成操作。';
export function useEntryJob(
  topicId = 'ai-coding',
  requestedJobId: string | null = null,
) {
  const storageKey = 'jianshan:analysis-job:v2:' + topicId;
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [notice, setNotice] = useState('');
  const [lookupFailed, setLookupFailed] = useState(false);
  const gate = useRef(false);
  const activeId = useRef<string | null>(null);
  const autoOpen = useRef(false);
  const navigating = useRef(false);
  const openResult = useCallback(
    (id: string) => {
      if (navigating.current) return;
      navigating.current = true;
      saveStored(storageKey, null);
      window.location.assign('/overview?analysis=' + encodeURIComponent(id));
    },
    [storageKey],
  );
  const receive = useCallback(
    (next: AnalysisJob) => {
      if (activeId.current !== next.id) return;
      if (next.topicId !== topicId) {
        setNotice('该任务属于另一个议题，请从最近分析进入。');
        setLookupFailed(true);
        return;
      }
      setJob((previous) =>
        previous &&
        previous.id === next.id &&
        previous.updatedAt > next.updatedAt
          ? previous
          : next,
      );
      setLookupFailed(false);
      setNotice('');
      if (next.status === 'succeeded' && next.resultId && autoOpen.current)
        openResult(next.resultId);
    },
    [openResult, topicId],
  );
  const watch = useCallback(
    (id: string) => {
      activeId.current = id;
      saveStored(storageKey, id);
      setJobId(id);
    },
    [storageKey],
  );
  const refresh = useCallback(
    async (id = activeId.current) => {
      if (!id) return;
      try {
        await ensureVisitor();
        receive(
          await api<AnalysisJob>('/jobs/' + encodeURIComponent(id), {
            signal: AbortSignal.timeout(15000),
          }),
        );
      } catch (e) {
        if (activeId.current !== id) return;
        setNotice(message(e));
        setLookupFailed(true);
        // An unknown ID was never executed by this page; allow the user to start again.
        if (e instanceof ApiError && e.status === 404) {
          activeId.current = null;
          saveStored(storageKey, null);
          setJobId(null);
          setJob(null);
        }
      } finally {
        setRestoring(false);
      }
    },
    [receive, storageKey],
  );
  // Hydrate the external sessionStorage value after SSR so server/client markup agrees.
  /* eslint-disable react/react-compiler */
  useEffect(() => {
    const id =
      requestedJobId ||
      readStored(storageKey) ||
      (topicId === 'ai-coding' ? readStored(LEGACY_KEY) : null);
    if (topicId === 'ai-coding') saveStored(LEGACY_KEY, null);
    if (id && /^[a-f0-9-]{36}$/i.test(id)) watch(id);
    else {
      saveStored(storageKey, null);
      setRestoring(false);
    }
  }, [watch, requestedJobId, storageKey, topicId]);
  /* eslint-enable react/react-compiler */
  useEffect(() => {
    if (
      !jobId ||
      lookupFailed ||
      job?.status === 'succeeded' ||
      job?.status === 'failed'
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh(jobId);
      if (!cancelled) timer = setTimeout(poll, 1800);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, lookupFailed, job?.status, refresh]);
  async function execute(id: string) {
    autoOpen.current = true;
    try {
      receive(
        await post<AnalysisJob>(
          '/jobs/' + encodeURIComponent(id) + '/run',
          {},
          { signal: AbortSignal.timeout(110000) },
        ),
      );
    } catch {
      if (activeId.current !== id) return;
      setNotice(
        '执行连接已中断，正在查询已保存的任务状态；不会自动重新调用模型。',
      );
      await refresh(id);
    }
  }
  async function startLive() {
    if (
      gate.current ||
      restoring ||
      job?.status === 'queued' ||
      job?.status === 'running'
    )
      return;
    gate.current = true;
    setSubmitting(true);
    setNotice('');
    setJob(null);
    setLookupFailed(false);
    activeId.current = null;
    setJobId(null);
    saveStored(storageKey, null);
    autoOpen.current = true;
    try {
      // Establish the cookie before create/run/status requests can overlap.
      await ensureVisitor();
      const requestId = crypto.randomUUID();
      saveStored(storageKey, requestId);
      const result = await post<AnalysisStart>(
        '/topics/' + encodeURIComponent(topicId) + '/analyses',
        { mode: 'live', requestId },
        { signal: AbortSignal.timeout(15000) },
      );
      if ('resultId' in result) {
        openResult(result.resultId);
        return;
      }
      watch(result.jobId);
      receive(result.job);
      if (result.job.status === 'queued') void execute(result.jobId);
    } catch (e) {
      setRestoring(false);
      setNotice(message(e));
      const id = readStored(storageKey);
      if (
        id &&
        e instanceof ApiError &&
        ['NETWORK_ERROR', 'RESPONSE_INVALID'].includes(e.code)
      )
        watch(id);
      else saveStored(storageKey, null);
    } finally {
      gate.current = false;
      setSubmitting(false);
    }
  }
  async function openPreset() {
    if (gate.current) return;
    gate.current = true;
    setSubmitting(true);
    autoOpen.current = false;
    try {
      await ensureVisitor();
      const result = await post<{ resultId: string }>(
        '/topics/' + encodeURIComponent(topicId) + '/analyses',
        { mode: 'mock' },
        { signal: AbortSignal.timeout(15000) },
      );
      // Preserve an unfinished live job so returning to the entry can query it.
      if (!navigating.current) {
        navigating.current = true;
        window.location.assign(
          '/overview?analysis=' + encodeURIComponent(result.resultId),
        );
      }
    } catch (e) {
      setNotice(message(e));
    } finally {
      gate.current = false;
      setSubmitting(false);
    }
  }
  return {
    job,
    hasJobId: Boolean(jobId),
    submitting,
    restoring,
    notice,
    lookupFailed,
    startLive,
    openPreset,
    openResult,
    refresh: () => {
      setLookupFailed(false);
      void refresh();
    },
    resume: () => {
      if (job?.status === 'queued') void execute(job.id);
    },
  };
}
