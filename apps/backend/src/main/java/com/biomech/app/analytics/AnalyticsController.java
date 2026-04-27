package com.biomech.app.analytics;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    @GetMapping("/session/{sessionId}")
    public List<DerivedMetricSeries> bySession(@PathVariable UUID sessionId) {
        return service.bySession(sessionId);
    }

    @GetMapping("/session/{sessionId}/metric/{metricName}")
    public List<DerivedMetricSeries> byMetric(@PathVariable UUID sessionId,
                                               @PathVariable String metricName) {
        return service.bySessionAndMetric(sessionId, metricName);
    }
}
