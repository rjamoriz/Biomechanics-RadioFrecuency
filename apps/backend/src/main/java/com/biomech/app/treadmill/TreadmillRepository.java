package com.biomech.app.treadmill;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface TreadmillRepository extends JpaRepository<Treadmill, UUID> {
}
