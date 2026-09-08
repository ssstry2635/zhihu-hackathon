'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Analysis } from '@/shared/types';
export function useAnalysis() {
  const params = useSearchParams();
  const id = params.get('analysis') || 'demo-v1';
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setAnalysis(null);
    setError('');
    api<Analysis>('/analyses/' + encodeURIComponent(id))
      .then((a) => {
        if (active) setAnalysis(a);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return { id, analysis, error };
}
