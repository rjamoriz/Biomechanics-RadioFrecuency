package com.biomech.app.jointkinematics;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

/**
 * Persisted snapshot of per-joint proxy kinematics from one running session.
 *
 * All values are PROXY ESTIMATES with validationStatus = 'experimental'.
 * Not clinical-grade biomechanics data.
 */
@Entity
@Table(name = "joint_kinematics_records",
        indexes = {
                @Index(name = "idx_jkr_athlete_time", columnList = "athlete_id, recorded_at DESC"),
                @Index(name = "idx_jkr_session_id", columnList = "session_id"),
        })
public class JointKinematicsRecord extends BaseEntity {

    @NotNull
    @Column(name = "athlete_id", nullable = false)
    private UUID athleteId;

    @NotNull
    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "speed_kmh")
    private Double speedKmh;

    @Column(name = "incline_percent")
    private Double inclinePercent;

    // Left knee
    @Column(name = "left_knee_angle_proxy_deg") private Double leftKneeAngleProxyDeg;
    @Column(name = "left_knee_force_proxy_n")   private Double leftKneeForceProxyN;
    @Column(name = "left_knee_displacement_deg") private Double leftKneeDisplacementDeg;
    @Column(name = "left_knee_risk_level", length = 20) private String leftKneeRiskLevel;

    // Right knee
    @Column(name = "right_knee_angle_proxy_deg") private Double rightKneeAngleProxyDeg;
    @Column(name = "right_knee_force_proxy_n")   private Double rightKneeForceProxyN;
    @Column(name = "right_knee_displacement_deg") private Double rightKneeDisplacementDeg;
    @Column(name = "right_knee_risk_level", length = 20) private String rightKneeRiskLevel;

    // Left hip
    @Column(name = "left_hip_angle_proxy_deg") private Double leftHipAngleProxyDeg;
    @Column(name = "left_hip_force_proxy_n")   private Double leftHipForceProxyN;
    @Column(name = "left_hip_displacement_deg") private Double leftHipDisplacementDeg;
    @Column(name = "left_hip_risk_level", length = 20) private String leftHipRiskLevel;

    // Right hip
    @Column(name = "right_hip_angle_proxy_deg") private Double rightHipAngleProxyDeg;
    @Column(name = "right_hip_force_proxy_n")   private Double rightHipForceProxyN;
    @Column(name = "right_hip_displacement_deg") private Double rightHipDisplacementDeg;
    @Column(name = "right_hip_risk_level", length = 20) private String rightHipRiskLevel;

    // Left ankle
    @Column(name = "left_ankle_angle_proxy_deg") private Double leftAnkleAngleProxyDeg;
    @Column(name = "left_ankle_force_proxy_n")   private Double leftAnkleForceProxyN;
    @Column(name = "left_ankle_displacement_deg") private Double leftAnkleDisplacementDeg;
    @Column(name = "left_ankle_risk_level", length = 20) private String leftAnkleRiskLevel;

    // Right ankle
    @Column(name = "right_ankle_angle_proxy_deg") private Double rightAnkleAngleProxyDeg;
    @Column(name = "right_ankle_force_proxy_n")   private Double rightAnkleForceProxyN;
    @Column(name = "right_ankle_displacement_deg") private Double rightAnkleDisplacementDeg;
    @Column(name = "right_ankle_risk_level", length = 20) private String rightAnkleRiskLevel;

    // Lower back
    @Column(name = "lower_back_angle_proxy_deg") private Double lowerBackAngleProxyDeg;
    @Column(name = "lower_back_displacement_deg") private Double lowerBackDisplacementDeg;
    @Column(name = "lower_back_risk_level", length = 20) private String lowerBackRiskLevel;

    // Bilateral summary
    @Column(name = "bilateral_symmetry_score") private Double bilateralSymmetryScore;
    @Column(name = "highest_risk_joint", length = 50) private String highestRiskJoint;

    // Quality / validation
    @Column(name = "confidence") private Double confidence;

    @Column(name = "validation_status", nullable = false, length = 30)
    private String validationStatus = "experimental";

    @PrePersist
    protected void onJointKinCreate() {
        if (recordedAt == null) recordedAt = Instant.now();
    }

    // ── Getters / Setters ───────────────────────────────────────────────────

    public UUID getAthleteId() { return athleteId; }
    public void setAthleteId(UUID athleteId) { this.athleteId = athleteId; }

    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }

    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }

    public Double getSpeedKmh() { return speedKmh; }
    public void setSpeedKmh(Double speedKmh) { this.speedKmh = speedKmh; }

    public Double getInclinePercent() { return inclinePercent; }
    public void setInclinePercent(Double inclinePercent) { this.inclinePercent = inclinePercent; }

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
    public String getValidationStatus() { return validationStatus; }
    public void setValidationStatus(String v) { this.validationStatus = v; }
}
