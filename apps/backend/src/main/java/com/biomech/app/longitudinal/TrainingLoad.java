package com.biomech.app.longitudinal;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Daily training load record for an athlete.
 * Supports ACWR (acute:chronic workload ratio), monotony, and strain calculations.
 */
@Entity
@Table(name = "training_loads")
public class TrainingLoad extends BaseEntity {

    @Column(name = "athlete_id", nullable = false)
    private UUID athleteId;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(nullable = false)
    private LocalDate sessionDate;

    @Column(nullable = false)
    private Double acuteLoad = 0.0;

    @Column(nullable = false)
    private Double chronicLoad = 0.0;

    private Double acwr;
    private Double monotony;
    private Double strain;

    /** Subjective RPE (1–10) if provided by coach/athlete. */
    private Integer rpe;

    /** session RPE = RPE × session duration in minutes. */
    private Double sessionRpe;

    @Column(nullable = false, length = 100)
    private String source = "derived";

    private String notes;

    public UUID getAthleteId() { return athleteId; }
    public void setAthleteId(UUID athleteId) { this.athleteId = athleteId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public LocalDate getSessionDate() { return sessionDate; }
    public void setSessionDate(LocalDate sessionDate) { this.sessionDate = sessionDate; }
    public Double getAcuteLoad() { return acuteLoad; }
    public void setAcuteLoad(Double acuteLoad) { this.acuteLoad = acuteLoad; }
    public Double getChronicLoad() { return chronicLoad; }
    public void setChronicLoad(Double chronicLoad) { this.chronicLoad = chronicLoad; }
    public Double getAcwr() { return acwr; }
    public void setAcwr(Double acwr) { this.acwr = acwr; }
    public Double getMonotony() { return monotony; }
    public void setMonotony(Double monotony) { this.monotony = monotony; }
    public Double getStrain() { return strain; }
    public void setStrain(Double strain) { this.strain = strain; }
    public Integer getRpe() { return rpe; }
    public void setRpe(Integer rpe) { this.rpe = rpe; }
    public Double getSessionRpe() { return sessionRpe; }
    public void setSessionRpe(Double sessionRpe) { this.sessionRpe = sessionRpe; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
