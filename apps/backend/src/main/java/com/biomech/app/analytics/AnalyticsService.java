package com.biomech.app.analytics;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class AnalyticsService {

    private final DerivedMetricSeriesRepository repository;

    public AnalyticsService(DerivedMetricSeriesRepository repository) {
        this.repository = repository;
    }

    public List<DerivedMetricSeries> bySession(UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }

    public List<DerivedMetricSeries> bySessionAndMetric(UUID sessionId, String metricName) {
        return repository.findBySessionIdAndMetricName(sessionId, metricName);
    }
}
