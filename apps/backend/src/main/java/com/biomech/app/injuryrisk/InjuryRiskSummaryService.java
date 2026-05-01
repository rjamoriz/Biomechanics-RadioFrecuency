package com.biomech.app.injuryrisk;

import com.biomech.app.common.ResourceNotFoundException;
import com.biomech.app.session.SessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class InjuryRiskSummaryService {

    private final InjuryRiskSummaryRepository repository;
    private final SessionRepository sessionRepository;

    public InjuryRiskSummaryService(InjuryRiskSummaryRepository repository,
                                     SessionRepository sessionRepository) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
    }

    @Transactional
    public InjuryRiskSummary saveForSession(UUID sessionId, InjuryRiskSummaryRequest request) {
        final UUID sid = Objects.requireNonNull(sessionId, "sessionId must not be null");
        sessionRepository.findById(sid)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sid));

        var summary = new InjuryRiskSummary();
        summary.setSessionId(sid);
        summary.setPeakRiskScore(request.getPeakRiskScore());
        summary.setPeakRiskLevel(request.getPeakRiskLevel());
        summary.setMeanRiskScore(request.getMeanRiskScore());
        summary.setPeakRiskTimestamp(request.getPeakRiskTimestamp());
        summary.setArticulationPeaksJson(request.getArticulationPeaksJson());
        summary.setDominantRiskFactors(request.getDominantRiskFactors());
        summary.setSnapshotCount(request.getSnapshotCount() != null ? request.getSnapshotCount() : 0);
        summary.setModelConfidence(request.getModelConfidence());
        summary.setSignalQualityScore(request.getSignalQualityScore());
        summary.setValidationStatus(request.getValidationStatus() != null ? request.getValidationStatus() : "unvalidated");
        summary.setExperimental(request.getExperimental() != null ? request.getExperimental() : true);
        summary.setNotes(request.getNotes());

        return repository.save(summary);
    }

    @Transactional(readOnly = true)
    public List<InjuryRiskSummary> findBySession(UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }

    @Transactional(readOnly = true)
    public InjuryRiskSummary findLatestBySession(UUID sessionId) {
        return repository.findFirstBySessionIdOrderByCreatedAtDesc(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("No injury-risk summary for session: " + sessionId));
    }

    @Transactional(readOnly = true)
    public List<InjuryRiskSummary> findByAthlete(UUID athleteId) {
        return repository.findByAthleteIdOrderByCreatedAtDesc(athleteId);
    }
}
