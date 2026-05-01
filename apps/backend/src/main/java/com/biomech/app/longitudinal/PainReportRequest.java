package com.biomech.app.longitudinal;

import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.UUID;

public class PainReportRequest {

    @NotNull
    private UUID athleteId;

    private UUID sessionId;

    private Instant reportedAt;

    @NotBlank
    private String bodyRegion;

    @NotNull @Min(0) @Max(10)
    private Integer painScale;

    private String notes;

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
