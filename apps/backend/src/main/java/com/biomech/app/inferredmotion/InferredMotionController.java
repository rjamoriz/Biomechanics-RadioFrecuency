package com.biomech.app.inferredmotion;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/inferred-motion")
public class InferredMotionController {

    private final InferredMotionSeriesRepository repository;

    public InferredMotionController(InferredMotionSeriesRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/session/{sessionId}")
    public List<InferredMotionSeries> bySession(@PathVariable UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }
}
