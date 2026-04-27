package com.biomech.app.calibration;

import com.biomech.app.common.CalibrationStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class CalibrationService {

    /** Calibration profiles expire after 30 days by default. */
    private static final int EXPIRY_DAYS = 30;

    private final CalibrationProfileRepository repository;

    public CalibrationService(CalibrationProfileRepository repository) {
        this.repository = repository;
    }

    public List<CalibrationProfile> byStation(UUID stationId) {
        return repository.findByStationIdOrderByCreatedAtDesc(stationId);
    }

    public CalibrationProfile latestForStation(UUID stationId) {
        return repository.findFirstByStationIdOrderByCreatedAtDesc(stationId)
                .orElseThrow(() -> new NoSuchElementException(
                        "No calibration profile found for station: " + stationId));
    }

    /**
     * Returns {@code true} when the latest profile for a station has status
     * {@link CalibrationStatus#CALIBRATED} and has not expired.
     *
     * <p>Used by the gateway's metric pipeline to decide whether to apply
     * calibration corrections to realtime estimates.
     */
    public boolean isActiveForStation(UUID stationId) {
        return repository.findFirstByStationIdOrderByCreatedAtDesc(stationId)
                .filter(p -> p.getStatus() == CalibrationStatus.CALIBRATED)
                .filter(p -> p.getExpiresAt() == null || p.getExpiresAt().isAfter(Instant.now()))
                .isPresent();
    }

    @Transactional
    public CalibrationProfile create(CalibrationProfile profile) {
        profile.setId(null); // guard: never accept a client-supplied ID

        if (profile.getStatus() == null) {
            profile.setStatus(CalibrationStatus.IN_PROGRESS);
        }

        if (profile.getStatus() == CalibrationStatus.CALIBRATED
                && profile.getExpiresAt() == null) {
            profile.setExpiresAt(Instant.now().plus(EXPIRY_DAYS, ChronoUnit.DAYS));
        }

        return repository.save(profile);
    }
}
