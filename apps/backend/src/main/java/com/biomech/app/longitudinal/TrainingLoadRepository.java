package com.biomech.app.longitudinal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface TrainingLoadRepository extends JpaRepository<TrainingLoad, UUID> {

    List<TrainingLoad> findByAthleteIdOrderBySessionDateDesc(UUID athleteId);

    List<TrainingLoad> findByAthleteIdAndSessionDateBetweenOrderBySessionDateAsc(
            UUID athleteId, LocalDate from, LocalDate to);

    @Query("SELECT tl FROM TrainingLoad tl WHERE tl.athleteId = :athleteId " +
           "AND tl.sessionDate >= :from ORDER BY tl.sessionDate ASC")
    List<TrainingLoad> findRecentByAthlete(UUID athleteId, LocalDate from);
}
