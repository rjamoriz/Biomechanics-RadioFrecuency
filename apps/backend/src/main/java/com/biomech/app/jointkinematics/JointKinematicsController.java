package com.biomech.app.jointkinematics;

import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST API for joint kinematics proxy data.
 *
 * Endpoints:
 *   POST  /api/joint-kinematics                              — save one snapshot
 *   GET   /api/athletes/{id}/joint-kinematics                — paginated history
 *   GET   /api/sessions/{id}/joint-kinematics                — records per session
 *   GET   /api/athletes/{id}/joint-kinematics/drift          — displacement drift trend
 */
@RestController
public class JointKinematicsController {

    private final JointKinematicsService service;

    public JointKinematicsController(JointKinematicsService service) {
        this.service = service;
    }

    @PostMapping("/api/joint-kinematics")
    @ResponseStatus(HttpStatus.CREATED)
    public JointKinematicsRecord save(@Valid @RequestBody JointKinematicsRequest request) {
        return service.save(request);
    }

    @GetMapping("/api/athletes/{athleteId}/joint-kinematics")
    public Page<JointKinematicsRecord> getHistory(
            @PathVariable UUID athleteId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return service.getHistory(athleteId, page, Math.min(size, 200));
    }

    @GetMapping("/api/sessions/{sessionId}/joint-kinematics")
    public List<JointKinematicsRecord> getSessionRecords(@PathVariable UUID sessionId) {
        return service.getSessionRecords(sessionId);
    }

    /**
     * Returns per-joint displacement drift analysis over the last N days.
     * Decision-support only — not a clinical assessment.
     */
    @GetMapping("/api/athletes/{athleteId}/joint-kinematics/drift")
    public Map<String, Map<String, Object>> getDrift(
            @PathVariable UUID athleteId,
            @RequestParam(defaultValue = "90") int daysBack) {
        return service.computeDrift(athleteId, Math.min(daysBack, 365));
    }
}
