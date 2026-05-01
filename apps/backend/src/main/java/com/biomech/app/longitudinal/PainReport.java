package com.biomech.app.longitudinal;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.Instant;
import java.util.UUID;

/**
 * Athlete-reported pain or wellness check-in, optionally linked to a session.
 * Pain scale 0–10 per body region.
 */
@Entity
@Table(name = "pain_reports")
public class PainReport extends BaseEntity {

    @Column(name = "athlete_id", nullable = false)
    private UUID athleteId;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(nullable = false)
    private Instant reportedAt;

    @Column(nullable = false, length = 100)
    private String bodyRegion;

    @Min(0) @Max(10)
    @Column(nullable = false)
    private Integer painScale;

    private String notes;

    @PrePersist
    protected void onPainCreate() {
        if (reportedAt == null) reportedAt = Instant.now();
    }

    public UUID getAthleteId() { return athleteId; }
    public void setAthleteId(UUID athleteId) { this.athleteId = athleteId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public Instant getReportedAt() { return reportedAt; }
    public void setReportedAt(Instant reportedAt) { this.reportedAt = reportedAt; }
    public String getBodyRegion() { return bodyRegion; }
    public void setBodyRegion(String bodyRegion) { this.bodyRegion = bodyRegion; }
    public Integer getPainScale() { return painScale; }
    public void setPainScale(Integer painScale) { this.painScale = painScale; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
