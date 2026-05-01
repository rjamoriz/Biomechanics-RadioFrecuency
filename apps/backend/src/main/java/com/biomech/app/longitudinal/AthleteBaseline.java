package com.biomech.app.longitudinal;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Rolling per-metric baseline for an athlete over a configurable time window.
 * Updated incrementally by the analytics pipeline after each session.
 */
@Entity
@Table(name = "athlete_baselines",
       uniqueConstraints = @UniqueConstraint(columnNames = {"athlete_id", "metric_name", "window_days"}))
public class AthleteBaseline extends BaseEntity {

    @Column(name = "athlete_id", nullable = false)
    private UUID athleteId;

    @Column(nullable = false, length = 100)
    private String metricName;

    @Column(nullable = false)
    private Double baselineMean;

    @Column(nullable = false)
    private Double baselineStd = 0.0;

    @Column(nullable = false)
    private Integer sampleCount = 1;

    @Column(nullable = false)
    private Integer windowDays = 28;

    @Column(nullable = false)
    private Instant lastUpdatedAt;

    @PrePersist
    protected void onBaselineCreate() {
        if (lastUpdatedAt == null) lastUpdatedAt = Instant.now();
    }

    public UUID getAthleteId() { return athleteId; }
    public void setAthleteId(UUID athleteId) { this.athleteId = athleteId; }
    public String getMetricName() { return metricName; }
    public void setMetricName(String metricName) { this.metricName = metricName; }
    public Double getBaselineMean() { return baselineMean; }
    public void setBaselineMean(Double baselineMean) { this.baselineMean = baselineMean; }
    public Double getBaselineStd() { return baselineStd; }
    public void setBaselineStd(Double baselineStd) { this.baselineStd = baselineStd; }
    public Integer getSampleCount() { return sampleCount; }
    public void setSampleCount(Integer sampleCount) { this.sampleCount = sampleCount; }
    public Integer getWindowDays() { return windowDays; }
    public void setWindowDays(Integer windowDays) { this.windowDays = windowDays; }
    public Instant getLastUpdatedAt() { return lastUpdatedAt; }
    public void setLastUpdatedAt(Instant lastUpdatedAt) { this.lastUpdatedAt = lastUpdatedAt; }
}
