const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api';
const SESSION_TOKEN_KEY = 'biomech-token';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

function getStoredToken(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? undefined;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, token } = options;
  const resolvedToken = token ?? getStoredToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (resolvedToken) {
    headers['Authorization'] = `Bearer ${resolvedToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
