package com.biomech.app.calibration;

import com.biomech.app.common.CalibrationStatus;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Request DTO for creating a calibration profile.
 *
 * <p>Using a DTO avoids exposing JPA entity internals and prevents
 * lazy-loading issues when serializing the response.
 */
public record CalibrationRequest(
        @NotNull UUID stationId,
        CalibrationStatus status,
        Double signalQualityScore,
        String notes
) {}
