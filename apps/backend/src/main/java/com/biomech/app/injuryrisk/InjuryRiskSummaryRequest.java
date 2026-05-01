package com.biomech.app.injuryrisk;

import jakarta.validation.constraints.*;

import java.util.List;

public class InjuryRiskSummaryRequest {

    @NotNull
    @DecimalMin("0.0") @DecimalMax("1.0")
    private Double peakRiskScore;

    @NotBlank
    private String peakRiskLevel;

    @NotNull
    @DecimalMin("0.0") @DecimalMax("1.0")
    private Double meanRiskScore;

    private Long peakRiskTimestamp;

    private String articulationPeaksJson;

    private List<String> dominantRiskFactors;

    @NotNull
    @Min(0)
    private Integer snapshotCount;

    @DecimalMin("0.0") @DecimalMax("1.0")
    private Double modelConfidence;

    @DecimalMin("0.0") @DecimalMax("1.0")
    private Double signalQualityScore;

    private String validationStatus;

    private Boolean experimental;

    private String notes;

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
