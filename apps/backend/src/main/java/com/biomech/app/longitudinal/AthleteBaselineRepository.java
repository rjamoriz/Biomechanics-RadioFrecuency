package com.biomech.app.longitudinal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AthleteBaselineRepository extends JpaRepository<AthleteBaseline, UUID> {

    List<AthleteBaseline> findByAthleteId(UUID athleteId);

    Optional<AthleteBaseline> findByAthleteIdAndMetricNameAndWindowDays(
            UUID athleteId, String metricName, int windowDays);
}
