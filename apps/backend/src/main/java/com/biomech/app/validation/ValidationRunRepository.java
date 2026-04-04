package com.biomech.app.validation;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ValidationRunRepository extends JpaRepository<ValidationRun, UUID> {
    List<ValidationRun> findBySessionId(UUID sessionId);
}
