import axios from 'axios';
import {
  BackendClientService,
  normalizeBackendApiUrl,
} from '../src/backend-client/backend-client.service';

jest.mock('axios');

describe('BackendClientService', () => {
  const axiosCreate = axios.create as jest.Mock;
  let post: jest.Mock;
  let get: jest.Mock;

  beforeEach(() => {
    post = jest.fn().mockResolvedValue({ data: {} });
    get = jest.fn().mockResolvedValue({ data: true });
    axiosCreate.mockReturnValue({ post, get });
    delete process.env.BACKEND_URL;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes backend URLs to the /api base path', () => {
    expect(normalizeBackendApiUrl()).toBe('http://localhost:8080/api');
    expect(normalizeBackendApiUrl('http://backend:8080')).toBe('http://backend:8080/api');
    expect(normalizeBackendApiUrl('http://backend:8080/api')).toBe('http://backend:8080/api');
    expect(normalizeBackendApiUrl('http://backend:8080/api/')).toBe('http://backend:8080/api');
  });

  it('posts a single metric as a batch payload', async () => {
    process.env.BACKEND_URL = 'http://backend:8080';
    const service = new BackendClientService();
    service.onModuleInit();

    await service.postMetric({
      sessionId: 'session-1',
      timestamp: 1_700_000_000_000,
      metricName: 'estimatedCadence',
      value: 172,
      confidence: 0.82,
      signalQuality: 0.76,
      modelVersion: 'gateway-v0',
    });

    expect(axiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://backend:8080/api' }),
    );
    expect(post).toHaveBeenCalledWith('/ingestion/metrics', [
      expect.objectContaining({
        sessionId: 'session-1',
        timestamp: new Date(1_700_000_000_000).toISOString(),
        metricName: 'estimatedCadence',
      }),
    ]);
  });

  it('posts session injury-risk summary to backend endpoint', async () => {
    process.env.BACKEND_URL = 'http://backend:8080/api';
    const service = new BackendClientService();
    service.onModuleInit();

    await service.postInjuryRiskSummary('session-123', {
      peakRiskScore: 0.74,
      peakRiskLevel: 'high',
      meanRiskScore: 0.52,
      peakRiskTimestamp: 1_700_000_111_000,
      articulationPeaksJson: JSON.stringify({ knee_left: 0.68, lumbar: 0.57 }),
      dominantRiskFactors: JSON.stringify(['contact_time', 'fatigue_drift']),
      snapshotCount: 88,
      modelConfidence: 0.71,
      signalQualityScore: 0.79,
    });

    expect(post).toHaveBeenCalledWith(
      '/injury-risk/session/session-123',
      expect.objectContaining({
        peakRiskScore: 0.74,
        peakRiskLevel: 'high',
        snapshotCount: 88,
      }),
    );
  });
});
