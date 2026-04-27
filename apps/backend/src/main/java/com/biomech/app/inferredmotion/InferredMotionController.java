package com.biomech.app.inferredmotion;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/inferred-motion")
public class InferredMotionController {

    private final InferredMotionService service;

    public InferredMotionController(InferredMotionService service) {
        this.service = service;
    }

    @GetMapping("/session/{sessionId}")
    public List<InferredMotionSeries> bySession(@PathVariable UUID sessionId) {
        return service.bySession(sessionId);
    }

    @PostMapping("/session/{sessionId}")
    @ResponseStatus(HttpStatus.CREATED)
    public InferredMotionSeries create(
            @PathVariable UUID sessionId,
            @RequestBody InferredMotionPayload payload
    ) {
        return service.save(sessionId, payload);
    }
}
