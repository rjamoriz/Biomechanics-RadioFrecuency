package com.biomech.app.athlete;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface AthleteRepository extends JpaRepository<Athlete, UUID> {
    List<Athlete> findByActiveTrue();
}
