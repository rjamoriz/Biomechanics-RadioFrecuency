package com.biomech.app.report;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportArtifactRepository repository;

    public ReportController(ReportArtifactRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/session/{sessionId}")
    public List<ReportArtifact> bySession(@PathVariable UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }
}
