import { apiFetch } from '@/lib/api';

describe('apiFetch', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    sessionStorage.clear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('attaches the stored session token when no explicit token is provided', async () => {
    sessionStorage.setItem('biomech-token', 'stored-token');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'athlete-1' }),
    } as Response);

    await apiFetch('/athletes', {
      method: 'POST',
      body: { firstName: 'Ada' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/athletes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer stored-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });
});
