package com.biomech.app.ingestion;

import com.biomech.app.analytics.DerivedMetricSeries;
import com.biomech.app.analytics.DerivedMetricSeriesRepository;
import com.biomech.app.common.ValidationStatus;
import com.biomech.app.session.Session;
import com.biomech.app.session.SessionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Persists gateway metric ingestion batches into {@link DerivedMetricSeries}.
 *
 * <p>Each batch is grouped by (sessionId, metricName). Per group a new
 * {@code DerivedMetricSeries} row is created with the data points serialized
 * as a JSONB array and aggregate confidence / signal-quality scores.
 */
@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);

    private final DerivedMetricSeriesRepository seriesRepository;
    private final SessionRepository sessionRepository;
    private final ObjectMapper objectMapper;

    public IngestionService(
            DerivedMetricSeriesRepository seriesRepository,
            SessionRepository sessionRepository,
            ObjectMapper objectMapper
    ) {
        this.seriesRepository = seriesRepository;
        this.sessionRepository = sessionRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Processes a batch of ingestion payloads.
     *
     * <p>Payloads are grouped by (sessionId, metricName). Each group becomes one
     * {@link DerivedMetricSeries} row. Unresolvable session IDs are skipped with
     * a warning so a bad gateway batch never causes a 500.
     */
    @Transactional
    public void persist(List<IngestionPayload> payloads) {
        if (payloads == null || payloads.isEmpty()) {
            return;
        }

        Map<String, Map<String, List<IngestionPayload>>> grouped = payloads.stream()
                .collect(Collectors.groupingBy(
                        IngestionPayload::sessionId,
                        Collectors.groupingBy(IngestionPayload::metricName)
                ));

        grouped.forEach((rawSessionId, byMetric) -> {
            UUID sessionId;
            try {
                sessionId = UUID.fromString(rawSessionId);
            } catch (IllegalArgumentException e) {
                log.warn("Ingestion skipped: invalid sessionId format '{}'", rawSessionId);
                return;
            }

            Optional<Session> sessionOpt = sessionRepository.findById(sessionId);
            if (sessionOpt.isEmpty()) {
                log.warn("Ingestion skipped: session {} not found", sessionId);
                return;
            }

            Session session = sessionOpt.get();

            byMetric.forEach((metricName, points) -> {
                try {
                    seriesRepository.save(buildSeries(session, metricName, points));
                } catch (JsonProcessingException e) {
                    log.error("Failed to serialize data points for metric {} / session {}",
                            metricName, sessionId, e);
                }
            });
        });
    }

    private DerivedMetricSeries buildSeries(
            Session session,
            String metricName,
            List<IngestionPayload> points
    ) throws JsonProcessingException {

        List<DataPoint> dataPoints = points.stream()
                .map(p -> new DataPoint(p.timestamp(), p.value(), p.confidence(), p.signalQuality()))
                .toList();

        double meanConfidence = points.stream()
                .mapToDouble(IngestionPayload::confidence)
                .average()
                .orElse(0.0);

        double meanSignalQuality = points.stream()
                .mapToDouble(IngestionPayload::signalQuality)
                .average()
                .orElse(0.0);

        String modelVersion = points.stream()
                .map(IngestionPayload::modelVersion)
                .filter(v -> v != null && !v.isBlank())
                .findFirst()
                .orElse(null);

        DerivedMetricSeries series = new DerivedMetricSeries();
        series.setSession(session);
        series.setMetricName(metricName);
        series.setDataPointsJson(objectMapper.writeValueAsString(dataPoints));
        series.setMeanConfidence(meanConfidence);
        series.setSignalQualityMean(meanSignalQuality);
        series.setModelVersion(modelVersion);
        series.setValidationStatus(ValidationStatus.UNVALIDATED);

        return series;
    }

    private record DataPoint(
            Instant timestamp,
            double value,
            double confidence,
            double signalQuality
    ) {}
}
