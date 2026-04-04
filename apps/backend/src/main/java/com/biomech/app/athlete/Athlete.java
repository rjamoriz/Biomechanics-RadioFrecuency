package com.biomech.app.athlete;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "athletes")
public class Athlete extends BaseEntity {

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    private String email;
    private String sport;
    private Integer birthYear;
    private Double heightCm;
    private Double weightKg;
    private String shoeNotes;
    private String notes;

    @Column(nullable = false)
    private boolean active = true;

    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getSport() { return sport; }
    public void setSport(String sport) { this.sport = sport; }
    public Integer getBirthYear() { return birthYear; }
    public void setBirthYear(Integer birthYear) { this.birthYear = birthYear; }
    public Double getHeightCm() { return heightCm; }
    public void setHeightCm(Double heightCm) { this.heightCm = heightCm; }
    public Double getWeightKg() { return weightKg; }
    public void setWeightKg(Double weightKg) { this.weightKg = weightKg; }
    public String getShoeNotes() { return shoeNotes; }
    public void setShoeNotes(String shoeNotes) { this.shoeNotes = shoeNotes; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
