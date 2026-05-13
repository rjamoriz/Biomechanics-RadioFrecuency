package com.biomech.app.jointkinematics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Persists and queries per-joint kinematics snapshots.
 * Provides longitudinal drift analysis for injury-risk support.
 */
@Service
@Transactional(readOnly = true)
public class JointKinematicsService {

    private static final Logger log = LoggerFactory.getLogger(JointKinematicsService.class);

    private static final List<String> TRACKED_JOINTS = List.of(
            "leftKnee", "rightKnee", "leftHip", "rightHip",
            "leftAnkle", "rightAnkle", "lowerBack"
    );

    private final JointKinematicsRepository repository;

    public JointKinematicsService(JointKinematicsRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public JointKinematicsRecord save(JointKinematicsRequest req) {
        var record = new JointKinematicsRecord();
        record.setAthleteId(req.getAthleteId());
        record.setSessionId(req.getSessionId());
        record.setRecordedAt(req.getRecordedAt() != null ? req.getRecordedAt() : Instant.now());
        record.setSpeedKmh(req.getSpeedKmh());
        record.setInclinePercent(req.getInclinePercent());

        record.setLeftKneeAngleProxyDeg(req.getLeftKneeAngleProxyDeg());
        record.setLeftKneeForceProxyN(req.getLeftKneeForceProxyN());
        record.setLeftKneeDisplacementDeg(req.getLeftKneeDisplacementDeg());
        record.setLeftKneeRiskLevel(req.getLeftKneeRiskLevel());

        record.setRightKneeAngleProxyDeg(req.getRightKneeAngleProxyDeg());
        record.setRightKneeForceProxyN(req.getRightKneeForceProxyN());
        record.setRightKneeDisplacementDeg(req.getRightKneeDisplacementDeg());
        record.setRightKneeRiskLevel(req.getRightKneeRiskLevel());

        record.setLeftHipAngleProxyDeg(req.getLeftHipAngleProxyDeg());
        record.setLeftHipForceProxyN(req.getLeftHipForceProxyN());
        record.setLeftHipDisplacementDeg(req.getLeftHipDisplacementDeg());
        record.setLeftHipRiskLevel(req.getLeftHipRiskLevel());

        record.setRightHipAngleProxyDeg(req.getRightHipAngleProxyDeg());
        record.setRightHipForceProxyN(req.getRightHipForceProxyN());
        record.setRightHipDisplacementDeg(req.getRightHipDisplacementDeg());
        record.setRightHipRiskLevel(req.getRightHipRiskLevel());

        record.setLeftAnkleAngleProxyDeg(req.getLeftAnkleAngleProxyDeg());
        record.setLeftAnkleForceProxyN(req.getLeftAnkleForceProxyN());
        record.setLeftAnkleDisplacementDeg(req.getLeftAnkleDisplacementDeg());
        record.setLeftAnkleRiskLevel(req.getLeftAnkleRiskLevel());

        record.setRightAnkleAngleProxyDeg(req.getRightAnkleAngleProxyDeg());
        record.setRightAnkleForceProxyN(req.getRightAnkleForceProxyN());
        record.setRightAnkleDisplacementDeg(req.getRightAnkleDisplacementDeg());
        record.setRightAnkleRiskLevel(req.getRightAnkleRiskLevel());

        record.setLowerBackAngleProxyDeg(req.getLowerBackAngleProxyDeg());
        record.setLowerBackDisplacementDeg(req.getLowerBackDisplacementDeg());
        record.setLowerBackRiskLevel(req.getLowerBackRiskLevel());

        record.setBilateralSymmetryScore(req.getBilateralSymmetryScore());
        record.setHighestRiskJoint(req.getHighestRiskJoint());
        record.setConfidence(req.getConfidence());

        JointKinematicsRecord saved = repository.save(record);
        log.info("Saved joint kinematics record {} for athlete {} session {}",
                saved.getId(), saved.getAthleteId(), saved.getSessionId());
        return saved;
    }

    public Page<JointKinematicsRecord> getHistory(UUID athleteId, int page, int size) {
        return repository.findByAthleteIdOrderByRecordedAtDesc(athleteId, PageRequest.of(page, size));
    }

    public List<JointKinematicsRecord> getSessionRecords(UUID sessionId) {
        return repository.findBySessionIdOrderByRecordedAtAsc(sessionId);
    }

    /**
     * Computes per-joint displacement drift trend over the last {@code daysBack} days.
     *
     * Returns a map keyed by joint name, with:
     *   - "meanDisplacement": average displacement from baseline (°)
     *   - "driftSlope": trend slope in °/session (positive = worsening)
     *   - "riskSignal": "normal" | "watch" | "elevated"
     *   - "sampleCount": number of records included
     *
     * This is decision-support data for the RL layer and coaches.
     * Not a clinical diagnosis.
     */
    public Map<String, Map<String, Object>> computeDrift(UUID athleteId, int daysBack) {
        Instant since = Instant.now().minus(daysBack, ChronoUnit.DAYS);
        List<JointKinematicsRecord> records = repository.findByAthleteIdSince(athleteId, since);

        if (records.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<String, List<Double>> displacements = new LinkedHashMap<>();
        for (String joint : TRACKED_JOINTS) {
            displacements.put(joint, new ArrayList<>());
        }

        for (JointKinematicsRecord r : records) {
            addIfNotNull(displacements, "leftKnee",   r.getLeftKneeDisplacementDeg());
            addIfNotNull(displacements, "rightKnee",  r.getRightKneeDisplacementDeg());
            addIfNotNull(displacements, "leftHip",    r.getLeftHipDisplacementDeg());
            addIfNotNull(displacements, "rightHip",   r.getRightHipDisplacementDeg());
            addIfNotNull(displacements, "leftAnkle",  r.getLeftAnkleDisplacementDeg());
            addIfNotNull(displacements, "rightAnkle", r.getRightAnkleDisplacementDeg());
            addIfNotNull(displacements, "lowerBack",  r.getLowerBackDisplacementDeg());
        }

        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        for (Map.Entry<String, List<Double>> entry : displacements.entrySet()) {
            List<Double> vals = entry.getValue();
            if (vals.isEmpty()) continue;
            double mean = vals.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            double slope = computeLinearSlope(vals);
            String riskSignal = mean > 8 || slope > 1.5 ? "elevated"
                    : mean > 4 || slope > 0.8 ? "watch"
                    : "normal";
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("meanDisplacement", Math.round(mean * 100.0) / 100.0);
            summary.put("driftSlope", Math.round(slope * 100.0) / 100.0);
            summary.put("riskSignal", riskSignal);
            summary.put("sampleCount", vals.size());
            summary.put("validationStatus", "experimental");
            result.put(entry.getKey(), summary);
        }
        return result;
    }

    private void addIfNotNull(Map<String, List<Double>> map, String key, Double val) {
        if (val != null) map.get(key).add(val);
    }

    /** Ordinary-least-squares slope over the value series (index as x-axis). */
    private double computeLinearSlope(List<Double> values) {
        int n = values.size();
        if (n < 2) return 0;
        double sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (int i = 0; i < n; i++) {
            sumX += i;
            sumY += values.get(i);
            sumXY += (double) i * values.get(i);
            sumXX += (double) i * i;
        }
        double denom = n * sumXX - sumX * sumX;
        if (denom == 0) return 0;
        return (n * sumXY - sumX * sumY) / denom;
    }
}
