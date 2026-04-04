package com.biomech.app.protocol;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "protocol_stages")
public class ProtocolStage extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "protocol_id", nullable = false)
    private ProtocolTemplate protocol;

    @Column(nullable = false)
    private int orderIndex;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private int durationSeconds;

    @Column(nullable = false)
    private double speedKph;

    @Column(nullable = false)
    private double inclinePercent;

    public ProtocolTemplate getProtocol() { return protocol; }
    public void setProtocol(ProtocolTemplate protocol) { this.protocol = protocol; }
    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public int getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(int durationSeconds) { this.durationSeconds = durationSeconds; }
    public double getSpeedKph() { return speedKph; }
    public void setSpeedKph(double speedKph) { this.speedKph = speedKph; }
    public double getInclinePercent() { return inclinePercent; }
    public void setInclinePercent(double inclinePercent) { this.inclinePercent = inclinePercent; }
}
