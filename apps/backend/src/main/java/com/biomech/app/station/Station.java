package com.biomech.app.station;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.common.CalibrationStatus;
import jakarta.persistence.*;

@Entity
@Table(name = "stations")
public class Station extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String name;

    private String location;
    private String description;

    @Column(nullable = false)
    private String receiverMac;

    @Column(nullable = false)
    private String transmitterMac;

    private Double txDistanceCm;
    private Double txHeightCm;
    private Double rxHeightCm;
    private Double txAngleDeg;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CalibrationStatus calibrationStatus = CalibrationStatus.NOT_CALIBRATED;

    @Column(nullable = false)
    private boolean active = true;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getReceiverMac() { return receiverMac; }
    public void setReceiverMac(String receiverMac) { this.receiverMac = receiverMac; }
    public String getTransmitterMac() { return transmitterMac; }
    public void setTransmitterMac(String transmitterMac) { this.transmitterMac = transmitterMac; }
    public Double getTxDistanceCm() { return txDistanceCm; }
    public void setTxDistanceCm(Double txDistanceCm) { this.txDistanceCm = txDistanceCm; }
    public Double getTxHeightCm() { return txHeightCm; }
    public void setTxHeightCm(Double txHeightCm) { this.txHeightCm = txHeightCm; }
    public Double getRxHeightCm() { return rxHeightCm; }
    public void setRxHeightCm(Double rxHeightCm) { this.rxHeightCm = rxHeightCm; }
    public Double getTxAngleDeg() { return txAngleDeg; }
    public void setTxAngleDeg(Double txAngleDeg) { this.txAngleDeg = txAngleDeg; }
    public CalibrationStatus getCalibrationStatus() { return calibrationStatus; }
    public void setCalibrationStatus(CalibrationStatus calibrationStatus) { this.calibrationStatus = calibrationStatus; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
