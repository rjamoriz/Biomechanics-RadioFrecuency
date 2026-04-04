package com.biomech.app.session;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "session_stages")
public class SessionStage extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(nullable = false)
    private int orderIndex;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private double speedKph;

    @Column(nullable = false)
    private double inclinePercent;

    private int plannedDurationSeconds;
    private Instant startedAt;
    private Instant completedAt;

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }
    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public double getSpeedKph() { return speedKph; }
    public void setSpeedKph(double speedKph) { this.speedKph = speedKph; }
    public double getInclinePercent() { return inclinePercent; }
    public void setInclinePercent(double inclinePercent) { this.inclinePercent = inclinePercent; }
    public int getPlannedDurationSeconds() { return plannedDurationSeconds; }
    public void setPlannedDurationSeconds(int plannedDurationSeconds) { this.plannedDurationSeconds = plannedDurationSeconds; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
}
