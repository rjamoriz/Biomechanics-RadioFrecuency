package com.biomech.app.longitudinal;

import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.util.UUID;

public class TrainingLoadRequest {

    @NotNull
    private UUID athleteId;

    private UUID sessionId;

    @NotNull
    private LocalDate sessionDate;

    @NotNull @DecimalMin("0.0")
    private Double acuteLoad;

    @Min(1) @Max(10)
    private Integer rpe;

    private Double sessionRpe;

    private String source;
    private String notes;

    public UUID getAthleteId() { return athleteId; }
    public void setAthleteId(UUID athleteId) { this.athleteId = athleteId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public LocalDate getSessionDate() { return sessionDate; }
    public void setSessionDate(LocalDate sessionDate) { this.sessionDate = sessionDate; }
    public Double getAcuteLoad() { return acuteLoad; }
    public void setAcuteLoad(Double acuteLoad) { this.acuteLoad = acuteLoad; }
    public Integer getRpe() { return rpe; }
    public void setRpe(Integer rpe) { this.rpe = rpe; }
    public Double getSessionRpe() { return sessionRpe; }
    public void setSessionRpe(Double sessionRpe) { this.sessionRpe = sessionRpe; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
