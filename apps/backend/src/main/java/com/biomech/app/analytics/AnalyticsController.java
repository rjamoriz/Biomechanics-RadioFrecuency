package com.biomech.app.analytics;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final DerivedMetricSeriesRepository repository;

    public AnalyticsController(DerivedMetricSeriesRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/session/{sessionId}")
    public List<DerivedMetricSeries> bySession(@PathVariable UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }

    @GetMapping("/session/{sessionId}/metric/{metricName}")
    public List<DerivedMetricSeries> byMetric(@PathVariable UUID sessionId,
                                               @PathVariable String metricName) {
        return repository.findBySessionIdAndMetricName(sessionId, metricName);
    }
}
