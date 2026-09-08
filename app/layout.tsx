import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '见山另一面 · 让讨论更进一步',
  description: '围绕真实问题，从不同角度参与讨论，理解观点之间的分歧。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
