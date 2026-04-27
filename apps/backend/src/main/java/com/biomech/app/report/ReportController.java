package com.biomech.app.report;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService service;

    public ReportController(ReportService service) {
        this.service = service;
    }

    @GetMapping("/session/{sessionId}")
    public List<ReportArtifact> bySession(@PathVariable UUID sessionId) {
        return service.bySession(sessionId);
    }
}
