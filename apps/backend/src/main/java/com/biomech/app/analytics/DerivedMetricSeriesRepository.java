package com.biomech.app.analytics;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface DerivedMetricSeriesRepository extends JpaRepository<DerivedMetricSeries, UUID> {
    List<DerivedMetricSeries> findBySessionId(UUID sessionId);
    List<DerivedMetricSeries> findBySessionIdAndMetricName(UUID sessionId, String metricName);
}
