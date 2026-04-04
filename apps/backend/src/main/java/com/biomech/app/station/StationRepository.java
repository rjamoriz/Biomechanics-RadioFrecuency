package com.biomech.app.station;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface StationRepository extends JpaRepository<Station, UUID> {
    List<Station> findByActiveTrue();
}
