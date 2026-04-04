package com.biomech.app.athlete;

import jakarta.validation.constraints.NotBlank;

public record AthleteDto(
        String id,
        @NotBlank String firstName,
        @NotBlank String lastName,
        String email,
        String sport,
        Integer birthYear,
        Double heightCm,
        Double weightKg,
        String shoeNotes,
        String notes
) {}
