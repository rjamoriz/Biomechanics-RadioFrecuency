package com.biomech.app.longitudinal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface PainReportRepository extends JpaRepository<PainReport, UUID> {

    List<PainReport> findByAthleteIdOrderByReportedAtDesc(UUID athleteId);

    List<PainReport> findByAthleteIdAndReportedAtAfterOrderByReportedAtDesc(
            UUID athleteId, Instant since);

    List<PainReport> findBySessionId(UUID sessionId);
}
