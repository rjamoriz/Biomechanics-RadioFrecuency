package com.biomech.app.calibration;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.common.CalibrationStatus;
import com.biomech.app.station.Station;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "calibration_profiles")
public class CalibrationProfile extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id", nullable = false)
    private Station station;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CalibrationStatus status = CalibrationStatus.IN_PROGRESS;

    private Instant environmentBaselineAt;
    private Instant treadmillBaselineAt;
    private Instant athleteBaselineAt;
    private Instant completedAt;
    private Instant expiresAt;

    private Double environmentNoiseFloor;
    private Double treadmillNoiseFloor;
    private Double signalQualityScore;
    private String notes;

    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public CalibrationStatus getStatus() { return status; }
    public void setStatus(CalibrationStatus status) { this.status = status; }
    public Instant getEnvironmentBaselineAt() { return environmentBaselineAt; }
    public void setEnvironmentBaselineAt(Instant environmentBaselineAt) { this.environmentBaselineAt = environmentBaselineAt; }
    public Instant getTreadmillBaselineAt() { return treadmillBaselineAt; }
    public void setTreadmillBaselineAt(Instant treadmillBaselineAt) { this.treadmillBaselineAt = treadmillBaselineAt; }
    public Instant getAthleteBaselineAt() { return athleteBaselineAt; }
    public void setAthleteBaselineAt(Instant athleteBaselineAt) { this.athleteBaselineAt = athleteBaselineAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Double getEnvironmentNoiseFloor() { return environmentNoiseFloor; }
    public void setEnvironmentNoiseFloor(Double environmentNoiseFloor) { this.environmentNoiseFloor = environmentNoiseFloor; }
    public Double getTreadmillNoiseFloor() { return treadmillNoiseFloor; }
    public void setTreadmillNoiseFloor(Double treadmillNoiseFloor) { this.treadmillNoiseFloor = treadmillNoiseFloor; }
    public Double getSignalQualityScore() { return signalQualityScore; }
    public void setSignalQualityScore(Double signalQualityScore) { this.signalQualityScore = signalQualityScore; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
