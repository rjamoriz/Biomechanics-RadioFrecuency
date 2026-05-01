package com.biomech.app.injuryrisk;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/injury-risk")
public class InjuryRiskController {

    private final InjuryRiskSummaryService service;

    public InjuryRiskController(InjuryRiskSummaryService service) {
        this.service = service;
    }

    /**
     * Called by the gateway at recording stop to persist the aggregated risk summary.
     */
    @PostMapping("/session/{sessionId}")
    @ResponseStatus(HttpStatus.CREATED)
    public InjuryRiskSummary createForSession(
            @PathVariable UUID sessionId,
            @Valid @RequestBody InjuryRiskSummaryRequest request) {
        return service.saveForSession(sessionId, request);
    }

    /**
     * List all risk summaries for a session (typically one per recording).
     */
    @GetMapping("/session/{sessionId}")
    public List<InjuryRiskSummary> getBySession(@PathVariable UUID sessionId) {
        return service.findBySession(sessionId);
    }

    /**
     * Latest risk summary for a session — used by the web UI injury-risk detail page.
     */
    @GetMapping("/session/{sessionId}/latest")
    public InjuryRiskSummary getLatestBySession(@PathVariable UUID sessionId) {
        return service.findLatestBySession(sessionId);
    }

    /**
     * Risk history across all sessions for an athlete — supports longitudinal trend view.
     */
    @GetMapping("/athlete/{athleteId}")
    public List<InjuryRiskSummary> getByAthlete(@PathVariable UUID athleteId) {
        return service.findByAthlete(athleteId);
    }
}
