package com.biomech.app.injuryrisk;

import com.biomech.app.session.Session;
import com.biomech.app.session.SessionRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * Manages persisted injury risk assessments.
 *
 * The gateway computes realtime risk snapshots; this service persists
 * session-level aggregated summaries received from the gateway via
 * the ingestion endpoint.
 */
@Service
public class InjuryRiskService {

    private final InjuryRiskRepository repository;
    private final SessionRepository sessionRepository;

    public InjuryRiskService(InjuryRiskRepository repository,
                              SessionRepository sessionRepository) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
    }

    public List<InjuryRiskAssessment> findBySession(UUID sessionId) {
        return repository.findBySessionIdOrderByCreatedAtDesc(sessionId);
    }

    public InjuryRiskAssessment findWorstBySession(UUID sessionId) {
        return repository.findTopBySessionIdOrderByPeakRiskScoreDesc(sessionId)
                .orElse(null);
    }

    @Transactional
    public InjuryRiskAssessment save(UUID sessionId, InjuryRiskPayload payload) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));

        InjuryRiskAssessment assessment = new InjuryRiskAssessment();
        assessment.setSession(session);
        assessment.setPeakRiskScore(payload.peakRiskScore());
        assessment.setPeakRiskLevel(payload.peakRiskLevel());
        assessment.setMeanRiskScore(payload.meanRiskScore());
        assessment.setPeakRiskTimestamp(payload.peakRiskTimestamp());
        assessment.setArticulationPeaksJson(payload.articulationPeaksJson());
        assessment.setDominantRiskFactors(payload.dominantRiskFactors());
        assessment.setSnapshotCount(payload.snapshotCount());
        assessment.setModelConfidence(payload.modelConfidence());
        assessment.setSignalQualityScore(payload.signalQualityScore());
        assessment.setValidationStatus("experimental");
        assessment.setExperimental(true);

        return repository.save(assessment);
    }
}
