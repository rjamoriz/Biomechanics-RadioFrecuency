package com.biomech.app.analytics;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.common.ValidationStatus;
import com.biomech.app.session.Session;
import jakarta.persistence.*;

@Entity
@Table(name = "derived_metric_series")
public class DerivedMetricSeries extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(nullable = false)
    private String metricName;

    @Column(nullable = false, columnDefinition = "jsonb")
    private String dataPointsJson;

    private Double meanConfidence;
    private Double signalQualityMean;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ValidationStatus validationStatus = ValidationStatus.UNVALIDATED;

    private String modelVersion;

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }
    public String getMetricName() { return metricName; }
    public void setMetricName(String metricName) { this.metricName = metricName; }
    public String getDataPointsJson() { return dataPointsJson; }
    public void setDataPointsJson(String dataPointsJson) { this.dataPointsJson = dataPointsJson; }
    public Double getMeanConfidence() { return meanConfidence; }
    public void setMeanConfidence(Double meanConfidence) { this.meanConfidence = meanConfidence; }
    public Double getSignalQualityMean() { return signalQualityMean; }
    public void setSignalQualityMean(Double signalQualityMean) { this.signalQualityMean = signalQualityMean; }
    public ValidationStatus getValidationStatus() { return validationStatus; }
    public void setValidationStatus(ValidationStatus validationStatus) { this.validationStatus = validationStatus; }
    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String modelVersion) { this.modelVersion = modelVersion; }
}
