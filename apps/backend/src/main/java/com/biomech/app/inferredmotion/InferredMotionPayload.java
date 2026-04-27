package com.biomech.app.inferredmotion;

import java.util.List;
import java.util.Map;

/**
 * Inbound payload for persisting inferred motion frames generated from Wi-Fi CSI.
 *
 * <p>Frames are model-based inferred motion outputs, not camera footage.
 */
public record InferredMotionPayload(
        String modelVersion,
        String inferenceMode,
        String keypointSchemaVersion,
        List<Map<String, Object>> frames,
        Double meanConfidence,
        Double signalQualitySummary,
        String validationStatus
) {}
