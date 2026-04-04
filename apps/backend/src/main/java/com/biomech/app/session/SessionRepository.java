package com.biomech.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, UUID> {
    List<Session> findByAthleteIdOrderByCreatedAtDesc(UUID athleteId);
    List<Session> findByStationIdOrderByCreatedAtDesc(UUID stationId);
}
