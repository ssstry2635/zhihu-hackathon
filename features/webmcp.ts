'use client';
import { useEffect, useRef } from 'react';
import type {
  Analysis,
  Category,
  ContributionType,
  Post,
} from '@/shared/types';
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function useDiscussionTools(state: {
  analysis: Analysis | null;
  category: Category | undefined;
  posts: Post[];
  stageDraft: (content: string, type: ContributionType) => void;
}) {
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'read_discussion_context',
        title: '读取当前讨论',
        description: '读取当前议题、分类及最多十条已载入发言。不会修改内容。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('不接受参数。');
          const s = current.current;
          if (!s.analysis || !s.category) throw new Error('讨论尚未载入。');
          return {
            topic: s.analysis.title,
            category: s.category.name,
            question: s.category.discussionQuestion,
            posts: s.posts
              .slice(-10)
              .map((p) => ({
                id: p.id,
                content: p.content,
                author: p.authorName,
                origin: p.origin,
              })),
          };
        },
      },
      {
        name: 'stage_discussion_draft',
        title: '准备讨论草稿',
        description:
          '在当前可见编辑框中准备一条发言草稿，供用户检查。不会发布内容。',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', minLength: 1, maxLength: 2000 },
            contributionType: {
              type: 'string',
              enum: ['opinion', 'experience', 'condition', 'evidence'],
            },
          },
          required: ['content', 'contributionType'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const v = input as { content?: unknown; contributionType?: unknown };
          if (
            !v ||
            Object.keys(v).some(
              (k) => !['content', 'contributionType'].includes(k),
            ) ||
            typeof v.content !== 'string' ||
            !v.content.trim() ||
            v.content.length > 2000 ||
            !['opinion', 'experience', 'condition', 'evidence'].includes(
              String(v.contributionType),
            )
          )
            throw new Error('草稿内容或类型无效。');
          if (!current.current.category) throw new Error('讨论尚未载入。');
          current.current.stageDraft(
            v.content,
            v.contributionType as ContributionType,
          );
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return { staged: true, published: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
}
