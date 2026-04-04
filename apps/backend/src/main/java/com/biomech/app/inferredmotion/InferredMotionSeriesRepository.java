package com.biomech.app.inferredmotion;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface InferredMotionSeriesRepository extends JpaRepository<InferredMotionSeries, UUID> {
    List<InferredMotionSeries> findBySessionId(UUID sessionId);
}
