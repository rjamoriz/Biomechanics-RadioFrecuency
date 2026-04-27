package com.biomech.app.injuryrisk;

/**
 * Inbound payload for persisting a session injury risk summary.
 * Sent by the gateway after session completion.
 */
public record InjuryRiskPayload(
        double peakRiskScore,
        String peakRiskLevel,
        double meanRiskScore,
        Long   peakRiskTimestamp,
        String articulationPeaksJson,
        String dominantRiskFactors,
        int    snapshotCount,
        double modelConfidence,
        double signalQualityScore
) {}
