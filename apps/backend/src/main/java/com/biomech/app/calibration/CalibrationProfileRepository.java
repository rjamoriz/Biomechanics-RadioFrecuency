package com.biomech.app.calibration;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CalibrationProfileRepository extends JpaRepository<CalibrationProfile, UUID> {
    List<CalibrationProfile> findByStationIdOrderByCreatedAtDesc(UUID stationId);
    Optional<CalibrationProfile> findFirstByStationIdOrderByCreatedAtDesc(UUID stationId);
}
