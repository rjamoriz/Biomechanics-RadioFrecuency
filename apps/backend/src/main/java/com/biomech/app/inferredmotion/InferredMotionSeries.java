package com.biomech.app.inferredmotion;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.common.ValidationStatus;
import com.biomech.app.session.Session;
import jakarta.persistence.*;

@Entity
@Table(name = "inferred_motion_series")
public class InferredMotionSeries extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(nullable = false)
    private String modelVersion;

    @Column(nullable = false)
    private String inferenceMode;

    @Column(nullable = false)
    private boolean experimental = true;

    @Column(nullable = false)
    private String keypointSchemaVersion;

    @Column(columnDefinition = "jsonb")
    private String framesJson;

    private Double meanConfidence;
    private Double signalQualitySummary;

    private int frameCount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ValidationStatus validationStatus = ValidationStatus.EXPERIMENTAL;

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }
    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String modelVersion) { this.modelVersion = modelVersion; }
    public String getInferenceMode() { return inferenceMode; }
    public void setInferenceMode(String inferenceMode) { this.inferenceMode = inferenceMode; }
    public boolean isExperimental() { return experimental; }
    public void setExperimental(boolean experimental) { this.experimental = experimental; }
    public String getKeypointSchemaVersion() { return keypointSchemaVersion; }
    public void setKeypointSchemaVersion(String keypointSchemaVersion) { this.keypointSchemaVersion = keypointSchemaVersion; }
    public String getFramesJson() { return framesJson; }
    public void setFramesJson(String framesJson) { this.framesJson = framesJson; }
    public Double getMeanConfidence() { return meanConfidence; }
    public void setMeanConfidence(Double meanConfidence) { this.meanConfidence = meanConfidence; }
    public Double getSignalQualitySummary() { return signalQualitySummary; }
    public void setSignalQualitySummary(Double signalQualitySummary) { this.signalQualitySummary = signalQualitySummary; }
    public int getFrameCount() { return frameCount; }
    public void setFrameCount(int frameCount) { this.frameCount = frameCount; }
    public ValidationStatus getValidationStatus() { return validationStatus; }
    public void setValidationStatus(ValidationStatus validationStatus) { this.validationStatus = validationStatus; }
}
