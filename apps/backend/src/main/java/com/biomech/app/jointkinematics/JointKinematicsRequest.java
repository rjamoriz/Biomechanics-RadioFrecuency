package com.biomech.app.jointkinematics;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

/**
 * Incoming payload for saving one joint kinematics snapshot.
 * Sent by the web client at end-of-session or at configurable intervals.
 */
public class JointKinematicsRequest {

    @NotNull
    private UUID athleteId;

    @NotNull
    private UUID sessionId;

    private Instant recordedAt;

    private Double speedKmh;
    private Double inclinePercent;

    // Left knee
    private Double leftKneeAngleProxyDeg;
    private Double leftKneeForceProxyN;
    private Double leftKneeDisplacementDeg;
    private String leftKneeRiskLevel;

    // Right knee
    private Double rightKneeAngleProxyDeg;
    private Double rightKneeForceProxyN;
    private Double rightKneeDisplacementDeg;
    private String rightKneeRiskLevel;

    // Left hip
    private Double leftHipAngleProxyDeg;
    private Double leftHipForceProxyN;
    private Double leftHipDisplacementDeg;
    private String leftHipRiskLevel;

    // Right hip
    private Double rightHipAngleProxyDeg;
    private Double rightHipForceProxyN;
    private Double rightHipDisplacementDeg;
    private String rightHipRiskLevel;

    // Left ankle
    private Double leftAnkleAngleProxyDeg;
    private Double leftAnkleForceProxyN;
    private Double leftAnkleDisplacementDeg;
    private String leftAnkleRiskLevel;

    // Right ankle
    private Double rightAnkleAngleProxyDeg;
    private Double rightAnkleForceProxyN;
    private Double rightAnkleDisplacementDeg;
    private String rightAnkleRiskLevel;

    // Lower back
    private Double lowerBackAngleProxyDeg;
    private Double lowerBackDisplacementDeg;
    private String lowerBackRiskLevel;

    // Bilateral summary
    private Double bilateralSymmetryScore;
    private String highestRiskJoint;

    private Double confidence;

    // ── Getters / Setters ───────────────────────────────────────────────────

    public UUID getAthleteId() { return athleteId; }
    public void setAthleteId(UUID athleteId) { this.athleteId = athleteId; }

    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }

    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }

    public Double getSpeedKmh() { return speedKmh; }
    public void setSpeedKmh(Double v) { this.speedKmh = v; }

    public Double getInclinePercent() { return inclinePercent; }
    public void setInclinePercent(Double v) { this.inclinePercent = v; }

    public Double getLeftKneeAngleProxyDeg() { return leftKneeAngleProxyDeg; }
    public void setLeftKneeAngleProxyDeg(Double v) { this.leftKneeAngleProxyDeg = v; }
    public Double getLeftKneeForceProxyN() { return leftKneeForceProxyN; }
    public void setLeftKneeForceProxyN(Double v) { this.leftKneeForceProxyN = v; }
    public Double getLeftKneeDisplacementDeg() { return leftKneeDisplacementDeg; }
    public void setLeftKneeDisplacementDeg(Double v) { this.leftKneeDisplacementDeg = v; }
    public String getLeftKneeRiskLevel() { return leftKneeRiskLevel; }
    public void setLeftKneeRiskLevel(String v) { this.leftKneeRiskLevel = v; }

    public Double getRightKneeAngleProxyDeg() { return rightKneeAngleProxyDeg; }
    public void setRightKneeAngleProxyDeg(Double v) { this.rightKneeAngleProxyDeg = v; }
    public Double getRightKneeForceProxyN() { return rightKneeForceProxyN; }
    public void setRightKneeForceProxyN(Double v) { this.rightKneeForceProxyN = v; }
    public Double getRightKneeDisplacementDeg() { return rightKneeDisplacementDeg; }
    public void setRightKneeDisplacementDeg(Double v) { this.rightKneeDisplacementDeg = v; }
    public String getRightKneeRiskLevel() { return rightKneeRiskLevel; }
    public void setRightKneeRiskLevel(String v) { this.rightKneeRiskLevel = v; }

    public Double getLeftHipAngleProxyDeg() { return leftHipAngleProxyDeg; }
    public void setLeftHipAngleProxyDeg(Double v) { this.leftHipAngleProxyDeg = v; }
    public Double getLeftHipForceProxyN() { return leftHipForceProxyN; }
    public void setLeftHipForceProxyN(Double v) { this.leftHipForceProxyN = v; }
    public Double getLeftHipDisplacementDeg() { return leftHipDisplacementDeg; }
    public void setLeftHipDisplacementDeg(Double v) { this.leftHipDisplacementDeg = v; }
    public String getLeftHipRiskLevel() { return leftHipRiskLevel; }
    public void setLeftHipRiskLevel(String v) { this.leftHipRiskLevel = v; }

    public Double getRightHipAngleProxyDeg() { return rightHipAngleProxyDeg; }
    public void setRightHipAngleProxyDeg(Double v) { this.rightHipAngleProxyDeg = v; }
    public Double getRightHipForceProxyN() { return rightHipForceProxyN; }
    public void setRightHipForceProxyN(Double v) { this.rightHipForceProxyN = v; }
    public Double getRightHipDisplacementDeg() { return rightHipDisplacementDeg; }
    public void setRightHipDisplacementDeg(Double v) { this.rightHipDisplacementDeg = v; }
    public String getRightHipRiskLevel() { return rightHipRiskLevel; }
    public void setRightHipRiskLevel(String v) { this.rightHipRiskLevel = v; }

    public Double getLeftAnkleAngleProxyDeg() { return leftAnkleAngleProxyDeg; }
    public void setLeftAnkleAngleProxyDeg(Double v) { this.leftAnkleAngleProxyDeg = v; }
    public Double getLeftAnkleForceProxyN() { return leftAnkleForceProxyN; }
    public void setLeftAnkleForceProxyN(Double v) { this.leftAnkleForceProxyN = v; }
    public Double getLeftAnkleDisplacementDeg() { return leftAnkleDisplacementDeg; }
    public void setLeftAnkleDisplacementDeg(Double v) { this.leftAnkleDisplacementDeg = v; }
    public String getLeftAnkleRiskLevel() { return leftAnkleRiskLevel; }
    public void setLeftAnkleRiskLevel(String v) { this.leftAnkleRiskLevel = v; }

    public Double getRightAnkleAngleProxyDeg() { return rightAnkleAngleProxyDeg; }
    public void setRightAnkleAngleProxyDeg(Double v) { this.rightAnkleAngleProxyDeg = v; }
    public Double getRightAnkleForceProxyN() { return rightAnkleForceProxyN; }
    public void setRightAnkleForceProxyN(Double v) { this.rightAnkleForceProxyN = v; }
    public Double getRightAnkleDisplacementDeg() { return rightAnkleDisplacementDeg; }
    public void setRightAnkleDisplacementDeg(Double v) { this.rightAnkleDisplacementDeg = v; }
    public String getRightAnkleRiskLevel() { return rightAnkleRiskLevel; }
    public void setRightAnkleRiskLevel(String v) { this.rightAnkleRiskLevel = v; }

    public Double getLowerBackAngleProxyDeg() { return lowerBackAngleProxyDeg; }
    public void setLowerBackAngleProxyDeg(Double v) { this.lowerBackAngleProxyDeg = v; }
    public Double getLowerBackDisplacementDeg() { return lowerBackDisplacementDeg; }
    public void setLowerBackDisplacementDeg(Double v) { this.lowerBackDisplacementDeg = v; }
    public String getLowerBackRiskLevel() { return lowerBackRiskLevel; }
    public void setLowerBackRiskLevel(String v) { this.lowerBackRiskLevel = v; }

    public Double getBilateralSymmetryScore() { return bilateralSymmetryScore; }
    public void setBilateralSymmetryScore(Double v) { this.bilateralSymmetryScore = v; }
    public String getHighestRiskJoint() { return highestRiskJoint; }
    public void setHighestRiskJoint(String v) { this.highestRiskJoint = v; }

    public Double getConfidence() { return confidence; }
    public void setConfidence(Double v) { this.confidence = v; }
}
