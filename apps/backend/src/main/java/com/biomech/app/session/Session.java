package com.biomech.app.session;

import com.biomech.app.athlete.Athlete;
import com.biomech.app.common.BaseEntity;
import com.biomech.app.common.SessionStatus;
import com.biomech.app.common.ValidationStatus;
import com.biomech.app.protocol.ProtocolTemplate;
import com.biomech.app.station.Station;
import com.biomech.app.treadmill.Treadmill;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "sessions")
public class Session extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "athlete_id", nullable = false)
    private Athlete athlete;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id", nullable = false)
    private Station station;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "treadmill_id")
    private Treadmill treadmill;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "protocol_id")
    private ProtocolTemplate protocol;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SessionStatus status = SessionStatus.CREATED;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ValidationStatus validationStatus = ValidationStatus.UNVALIDATED;

    private Instant startedAt;
    private Instant completedAt;

    private String operatorNotes;
    private String shoeType;

    @Column(nullable = false)
    private boolean inferredMotionEnabled = false;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("startedAt ASC")
    private List<SessionStage> stages = new ArrayList<>();

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("occurredAt ASC")
    private List<SessionEvent> events = new ArrayList<>();

    public Athlete getAthlete() { return athlete; }
    public void setAthlete(Athlete athlete) { this.athlete = athlete; }
    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public Treadmill getTreadmill() { return treadmill; }
    public void setTreadmill(Treadmill treadmill) { this.treadmill = treadmill; }
    public ProtocolTemplate getProtocol() { return protocol; }
    public void setProtocol(ProtocolTemplate protocol) { this.protocol = protocol; }
    public SessionStatus getStatus() { return status; }
    public void setStatus(SessionStatus status) { this.status = status; }
    public ValidationStatus getValidationStatus() { return validationStatus; }
    public void setValidationStatus(ValidationStatus validationStatus) { this.validationStatus = validationStatus; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public String getOperatorNotes() { return operatorNotes; }
    public void setOperatorNotes(String operatorNotes) { this.operatorNotes = operatorNotes; }
    public String getShoeType() { return shoeType; }
    public void setShoeType(String shoeType) { this.shoeType = shoeType; }
    public boolean isInferredMotionEnabled() { return inferredMotionEnabled; }
    public void setInferredMotionEnabled(boolean inferredMotionEnabled) { this.inferredMotionEnabled = inferredMotionEnabled; }
    public List<SessionStage> getStages() { return stages; }
    public List<SessionEvent> getEvents() { return events; }

    public void addStage(SessionStage stage) {
        stages.add(stage);
        stage.setSession(this);
    }

    public void addEvent(SessionEvent event) {
        events.add(event);
        event.setSession(this);
    }
}
