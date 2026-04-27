package com.biomech.app.inferredmotion;

import com.biomech.app.common.ValidationStatus;
import com.biomech.app.session.Session;
import com.biomech.app.session.SessionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.UUID;

/**
 * Service for retrieving inferred (synthetic) motion series.
 *
 * <p>All outputs from this domain are SYNTHETIC model-based renderings
 * inferred from Wi-Fi CSI features. They are NOT true camera or optical
 * motion capture views.
 */
@Service
public class InferredMotionService {

    private final InferredMotionSeriesRepository repository;
    private final SessionRepository sessionRepository;
    private final ObjectMapper objectMapper;

    public InferredMotionService(
            InferredMotionSeriesRepository repository,
            SessionRepository sessionRepository,
            ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<InferredMotionSeries> bySession(UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }

    @Transactional
    public InferredMotionSeries save(UUID sessionId, InferredMotionPayload payload) {
        UUID safeSessionId = Objects.requireNonNull(sessionId, "sessionId is required");
        Session session = sessionRepository.findById(safeSessionId)
            .orElseThrow(() -> new NoSuchElementException("Session not found: " + safeSessionId));

        List<java.util.Map<String, Object>> frames =
                payload.frames() == null ? List.of() : payload.frames();

        InferredMotionSeries series = new InferredMotionSeries();
        series.setSession(session);
        series.setModelVersion(defaultString(payload.modelVersion(), "unknown"));
        series.setInferenceMode(defaultString(payload.inferenceMode(), "wifi_csi_inferred_motion"));
        series.setExperimental(true);
        series.setKeypointSchemaVersion(defaultString(payload.keypointSchemaVersion(), "biomech-keypoints-v1"));
        series.setFrameCount(frames.size());
        series.setMeanConfidence(
                payload.meanConfidence() != null ? payload.meanConfidence() : mean(frames, "confidence"));
        series.setSignalQualitySummary(
                payload.signalQualitySummary() != null
                        ? payload.signalQualitySummary()
                        : mean(frames, "signalQualityScore"));
        series.setValidationStatus(
                payload.validationStatus() == null
                        ? ValidationStatus.EXPERIMENTAL
                        : ValidationStatus.fromWireValue(payload.validationStatus()));

        try {
            series.setFramesJson(objectMapper.writeValueAsString(frames));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Invalid inferred motion frame payload", e);
        }

        return repository.save(series);
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static Double mean(List<java.util.Map<String, Object>> frames, String fieldName) {
        return frames.stream()
                .map(frame -> frame.get(fieldName))
                .filter(Number.class::isInstance)
                .map(Number.class::cast)
                .mapToDouble(Number::doubleValue)
                .average()
                .orElse(0.0);
    }
}
