package com.biomech.app.ingestion;

import java.time.Instant;

public record IngestionPayload(
        String sessionId,
        Instant timestamp,
        String metricName,
        double value,
        double confidence,
        double signalQuality,
        String modelVersion
) {}
