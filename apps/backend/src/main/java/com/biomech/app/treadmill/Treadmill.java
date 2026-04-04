package com.biomech.app.treadmill;

import com.biomech.app.common.BaseEntity;
import com.biomech.app.station.Station;
import jakarta.persistence.*;

@Entity
@Table(name = "treadmills")
public class Treadmill extends BaseEntity {

    @Column(nullable = false)
    private String brand;

    @Column(nullable = false)
    private String model;

    private Double maxSpeedKph;
    private Double maxInclinePercent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id")
    private Station station;

    @Column(nullable = false)
    private boolean active = true;

    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public Double getMaxSpeedKph() { return maxSpeedKph; }
    public void setMaxSpeedKph(Double maxSpeedKph) { this.maxSpeedKph = maxSpeedKph; }
    public Double getMaxInclinePercent() { return maxInclinePercent; }
    public void setMaxInclinePercent(Double maxInclinePercent) { this.maxInclinePercent = maxInclinePercent; }
    public Station getStation() { return station; }
    public void setStation(Station station) { this.station = station; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
