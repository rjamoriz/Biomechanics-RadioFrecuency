package com.biomech.app.injuryrisk;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "injury_risk_summaries")
public class InjuryRiskSummary extends BaseEntity {

    @Column(nullable = false)
    private UUID sessionId;

    @Column(nullable = false)
    private Double peakRiskScore;

    @Column(nullable = false, length = 20)
    private String peakRiskLevel;

    @Column(nullable = false)
    private Double meanRiskScore;

    private Long peakRiskTimestamp;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String articulationPeaksJson;

    @Column(columnDefinition = "text[]")
    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<String> dominantRiskFactors;

    @Column(nullable = false)
    private Integer snapshotCount = 0;

    private Double modelConfidence;

    private Double signalQualityScore;

    @Column(nullable = false, length = 50)
    private String validationStatus = "unvalidated";

    @Column(nullable = false)
    private Boolean experimental = true;

    private String notes;

    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public Double getPeakRiskScore() { return peakRiskScore; }
    public void setPeakRiskScore(Double peakRiskScore) { this.peakRiskScore = peakRiskScore; }
    public String getPeakRiskLevel() { return peakRiskLevel; }
    public void setPeakRiskLevel(String peakRiskLevel) { this.peakRiskLevel = peakRiskLevel; }
    public Double getMeanRiskScore() { return meanRiskScore; }
    public void setMeanRiskScore(Double meanRiskScore) { this.meanRiskScore = meanRiskScore; }
    public Long getPeakRiskTimestamp() { return peakRiskTimestamp; }
    public void setPeakRiskTimestamp(Long peakRiskTimestamp) { this.peakRiskTimestamp = peakRiskTimestamp; }
    public String getArticulationPeaksJson() { return articulationPeaksJson; }
    public void setArticulationPeaksJson(String articulationPeaksJson) { this.articulationPeaksJson = articulationPeaksJson; }
    public List<String> getDominantRiskFactors() { return dominantRiskFactors; }
    public void setDominantRiskFactors(List<String> dominantRiskFactors) { this.dominantRiskFactors = dominantRiskFactors; }
    public Integer getSnapshotCount() { return snapshotCount; }
    public void setSnapshotCount(Integer snapshotCount) { this.snapshotCount = snapshotCount; }
    public Double getModelConfidence() { return modelConfidence; }
    public void setModelConfidence(Double modelConfidence) { this.modelConfidence = modelConfidence; }
    public Double getSignalQualityScore() { return signalQualityScore; }
    public void setSignalQualityScore(Double signalQualityScore) { this.signalQualityScore = signalQualityScore; }
    public String getValidationStatus() { return validationStatus; }
    public void setValidationStatus(String validationStatus) { this.validationStatus = validationStatus; }
    public Boolean getExperimental() { return experimental; }
    public void setExperimental(Boolean experimental) { this.experimental = experimental; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
