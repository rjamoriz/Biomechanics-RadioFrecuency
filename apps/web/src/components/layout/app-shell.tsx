'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  Activity,
  Users,
  Radio,
  Timer,
  BarChart3,
  Settings,
  FileText,
  Crosshair,
  ListChecks,
  Atom,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Activity },
  { href: '/quantum', label: 'Quantum Observatory', icon: Atom },
  { href: '/athletes', label: 'Athletes', icon: Users },
  { href: '/stations', label: 'Stations', icon: Radio },
  { href: '/sessions', label: 'Sessions', icon: Timer },
  { href: '/protocols', label: 'Protocols', icon: ListChecks },
  { href: '/calibration', label: 'Calibration', icon: Crosshair },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-700/50 bg-slate-900 md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-slate-700/50 px-6">
          <Activity className="h-6 w-6 text-brand-600" />
          <span className="text-lg font-semibold text-brand-100">Biomech</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-600/20 text-brand-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-700/50 p-4">
          <p className="text-xs text-slate-500">
            Biomech Platform v0.1.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
