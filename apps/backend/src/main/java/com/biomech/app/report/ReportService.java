package com.biomech.app.report;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ReportService {

    private final ReportArtifactRepository repository;

    public ReportService(ReportArtifactRepository repository) {
        this.repository = repository;
    }

    public List<ReportArtifact> bySession(UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }
}
