package com.biomech.app.injuryrisk;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InjuryRiskRepository extends JpaRepository<InjuryRiskAssessment, UUID> {

    List<InjuryRiskAssessment> findBySessionIdOrderByCreatedAtDesc(UUID sessionId);

    Optional<InjuryRiskAssessment> findTopBySessionIdOrderByPeakRiskScoreDesc(UUID sessionId);
}
