import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: 'Biomech Platform — Treadmill Running Analytics',
  description:
    'Professional treadmill running biomechanics platform powered by Wi-Fi CSI sensing',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-secondary">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
