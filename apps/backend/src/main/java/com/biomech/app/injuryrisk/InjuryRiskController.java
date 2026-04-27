package com.biomech.app.injuryrisk;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST API for injury risk assessments.
 *
 * All responses are experimental proxy estimates.
 * Not for clinical or medical use.
 */
@RestController
@RequestMapping("/api/injury-risk")
public class InjuryRiskController {

    private final InjuryRiskService service;

    public InjuryRiskController(InjuryRiskService service) {
        this.service = service;
    }

    /** Get all injury risk assessments for a session (newest first). */
    @GetMapping("/session/{sessionId}")
    public List<InjuryRiskAssessment> bySession(@PathVariable UUID sessionId) {
        return service.findBySession(sessionId);
    }

    /** Get the single worst (peak risk) assessment for a session. */
    @GetMapping("/session/{sessionId}/worst")
    public InjuryRiskAssessment worstBySession(@PathVariable UUID sessionId) {
        return service.findWorstBySession(sessionId);
    }

    /** Persist a session-level injury risk summary (called by gateway). */
    @PostMapping("/session/{sessionId}")
    @ResponseStatus(HttpStatus.CREATED)
    public InjuryRiskAssessment create(
            @PathVariable UUID sessionId,
            @RequestBody @Valid InjuryRiskPayload payload
    ) {
        return service.save(sessionId, payload);
    }
}
