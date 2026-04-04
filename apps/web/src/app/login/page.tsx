'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch<{ token: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      // Store token — in production use HTTP-only cookies or a proper auth lib
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('biomech-token', res.token);
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In — Biomech Platform</CardTitle>
        </CardHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </Card>
    </div>
  );
}
