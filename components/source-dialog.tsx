'use client';
import { useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Analysis, Evidence, Source } from '@/shared/types';
export function SourceDialog({
  analysis,
  sourceIds,
  label = '查看依据',
}: {
  analysis: Analysis;
  sourceIds: string[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = sourceIds
    .map((id) => analysis.sources.find((s) => s.id === id))
    .filter(Boolean) as Source[];
  return (
    <>
      <Button
        variant="ghost"
        className="source-link"
        onClick={() => setOpen(true)}
      >
        <FileText size={14} />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="source-modal">
          <DialogHeader>
            <DialogTitle>这段讨论的来源</DialogTitle>
            <DialogDescription>
              {analysis.sourceMode === 'mock'
                ? '团队编写的模拟样本，用于体验产品；没有对应的真实知乎作者或原文。'
                : '当前检索到的摘要与精选评论，归属未确认的内容不能视为本问题下的完整回答。'}
            </DialogDescription>
          </DialogHeader>
          <div className="source-scroll">
            {selected.map((s) => {
              const parent = s.parentSourceId
                ? analysis.sources.find((p) => p.id === s.parentSourceId)
                : null;
              const url = s.url || parent?.url;
              return (
                <article className="source-item" key={s.id}>
                  <div className="tag-row">
                    <span className="tag">
                      {s.kind === 'comment'
                        ? '精选评论'
                        : s.kind === 'article'
                          ? '文章摘要'
                          : '回答摘要'}
                    </span>
                    <span className="subtle">
                      {s.authorName || '作者信息未提供'}
                    </span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  {s.truncated && (
                    <p className="subtle">
                      本条材料已按长度限制截取，请打开原文查看完整内容。
                    </p>
                  )}
                  {parent && <p className="subtle">所属来源：{parent.title}</p>}
                  {url && (
                    <a
                      className="source-external"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={url}
                    >
                      查看知乎原文 <ExternalLink size={14} />
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function EvidenceLinks({
  analysis,
  evidenceRefs,
}: {
  analysis: Analysis;
  evidenceRefs: Evidence[];
}) {
  if (!evidenceRefs.length) return null;
  return (
    <div className="evidence-row">
      {evidenceRefs.slice(0, 3).map((e, i) => (
        <SourceDialog
          key={e.sourceId + i}
          analysis={analysis}
          sourceIds={[e.sourceId]}
          label={'依据 ' + (i + 1)}
        />
      ))}
    </div>
  );
}
