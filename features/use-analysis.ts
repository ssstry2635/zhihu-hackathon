'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ensureVisitor } from '@/lib/api';
import type { Analysis } from '@/shared/types';
export function useAnalysis() {
  const params = useSearchParams();
  const id = params.get('analysis') || 'demo-v1';
  const [result, setResult] = useState<{
    id: string;
    analysis: Analysis | null;
    error: string;
  }>({ id: '', analysis: null, error: '' });
  useEffect(() => {
    let active = true;
    ensureVisitor()
      .then(() => api<Analysis>('/analyses/' + encodeURIComponent(id)))
      .then((a) => {
        if (active) setResult({ id, analysis: a, error: '' });
      })
      .catch((e) => {
        if (active) setResult({ id, analysis: null, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [id]);
  return {
    id,
    analysis: result.id === id ? result.analysis : null,
    error: result.id === id ? result.error : '',
  };
}
