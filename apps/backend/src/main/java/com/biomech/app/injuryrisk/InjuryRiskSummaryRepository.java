package com.biomech.app.injuryrisk;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InjuryRiskSummaryRepository extends JpaRepository<InjuryRiskSummary, UUID> {

    List<InjuryRiskSummary> findBySessionId(UUID sessionId);

    Optional<InjuryRiskSummary> findFirstBySessionIdOrderByCreatedAtDesc(UUID sessionId);

    @Query("SELECT s FROM InjuryRiskSummary s WHERE s.sessionId IN " +
           "(SELECT sess.id FROM Session sess WHERE sess.athlete.id = :athleteId) " +
           "ORDER BY s.createdAt DESC")
    List<InjuryRiskSummary> findByAthleteIdOrderByCreatedAtDesc(UUID athleteId);
}
