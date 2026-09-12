import type { ComponentProps } from 'react';

// Use document navigation for this four-page demo. The current Vinext build's
// next/link runtime throws before navigating; native anchors also work before
// hydration and preserve keyboard, new-tab, back and forward behavior.
export default function PageLink({ children, ...props }: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}
