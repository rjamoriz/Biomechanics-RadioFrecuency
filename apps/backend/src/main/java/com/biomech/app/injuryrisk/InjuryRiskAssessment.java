package com.biomech.app.injuryrisk;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.session.Session;
import jakarta.persistence.*;

/**
 * Session-level injury risk assessment summary.
 *
 * Stores aggregated proxy-based injury risk signals for a session.
 * All values are EXPERIMENTAL estimates derived from Wi-Fi CSI signals.
 * Not for clinical or medical use.
 */
@Entity
@Table(name = "injury_risk_assessments")
public class InjuryRiskAssessment extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(nullable = false)
    private double peakRiskScore;

    @Column(nullable = false, length = 20)
    private String peakRiskLevel;

    @Column(nullable = false)
    private double meanRiskScore;

    @Column
    private Long peakRiskTimestamp;

    /** JSONB: map of joint → peak risk score (double). */
    @Column(columnDefinition = "jsonb")
    private String articulationPeaksJson;

    /** JSONB: string array of dominant risk factor IDs. */
    @Column(columnDefinition = "jsonb")
    private String dominantRiskFactors;

    @Column(nullable = false)
    private int snapshotCount;

    @Column(nullable = false)
    private double modelConfidence;

    @Column(nullable = false)
    private double signalQualityScore;

    @Column(nullable = false, length = 30)
    private String validationStatus = "experimental";

    @Column(nullable = false)
    private boolean experimental = true;

    // ─── Getters / Setters ───────────────────────────────────────────

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }

    public double getPeakRiskScore() { return peakRiskScore; }
    public void setPeakRiskScore(double peakRiskScore) { this.peakRiskScore = peakRiskScore; }

    public String getPeakRiskLevel() { return peakRiskLevel; }
    public void setPeakRiskLevel(String peakRiskLevel) { this.peakRiskLevel = peakRiskLevel; }

    public double getMeanRiskScore() { return meanRiskScore; }
    public void setMeanRiskScore(double meanRiskScore) { this.meanRiskScore = meanRiskScore; }

    public Long getPeakRiskTimestamp() { return peakRiskTimestamp; }
    public void setPeakRiskTimestamp(Long peakRiskTimestamp) { this.peakRiskTimestamp = peakRiskTimestamp; }

    public String getArticulationPeaksJson() { return articulationPeaksJson; }
    public void setArticulationPeaksJson(String articulationPeaksJson) { this.articulationPeaksJson = articulationPeaksJson; }

    public String getDominantRiskFactors() { return dominantRiskFactors; }
    public void setDominantRiskFactors(String dominantRiskFactors) { this.dominantRiskFactors = dominantRiskFactors; }

    public int getSnapshotCount() { return snapshotCount; }
    public void setSnapshotCount(int snapshotCount) { this.snapshotCount = snapshotCount; }

    public double getModelConfidence() { return modelConfidence; }
    public void setModelConfidence(double modelConfidence) { this.modelConfidence = modelConfidence; }

    public double getSignalQualityScore() { return signalQualityScore; }
    public void setSignalQualityScore(double signalQualityScore) { this.signalQualityScore = signalQualityScore; }

    public String getValidationStatus() { return validationStatus; }
    public void setValidationStatus(String validationStatus) { this.validationStatus = validationStatus; }

    public boolean isExperimental() { return experimental; }
    public void setExperimental(boolean experimental) { this.experimental = experimental; }
}
