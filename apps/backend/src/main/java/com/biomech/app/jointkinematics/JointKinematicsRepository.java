package com.biomech.app.jointkinematics;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface JointKinematicsRepository extends JpaRepository<JointKinematicsRecord, UUID> {

    Page<JointKinematicsRecord> findByAthleteIdOrderByRecordedAtDesc(UUID athleteId, Pageable pageable);

    List<JointKinematicsRecord> findBySessionIdOrderByRecordedAtAsc(UUID sessionId);

    @Query("SELECT r FROM JointKinematicsRecord r " +
           "WHERE r.athleteId = :athleteId AND r.recordedAt >= :since " +
           "ORDER BY r.recordedAt ASC")
    List<JointKinematicsRecord> findByAthleteIdSince(
            @Param("athleteId") UUID athleteId,
            @Param("since") Instant since);
}
