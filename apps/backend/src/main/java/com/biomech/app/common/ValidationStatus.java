package com.biomech.app.common;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ValidationStatus {
    UNVALIDATED("unvalidated"),
    EXPERIMENTAL("experimental"),
    STATION_VALIDATED("station_validated"),
    EXTERNALLY_VALIDATED("externally_validated");

    private final String wireValue;

    ValidationStatus(String wireValue) {
        this.wireValue = wireValue;
    }

    @JsonValue
    public String getWireValue() {
        return wireValue;
    }

    @JsonCreator
    public static ValidationStatus fromWireValue(String value) {
        if (value == null || value.isBlank()) {
            return UNVALIDATED;
        }

        String normalized = value.trim().replace('-', '_');
        for (ValidationStatus status : values()) {
            if (status.wireValue.equals(normalized) || status.name().equalsIgnoreCase(normalized)) {
                return status;
            }
        }

        throw new IllegalArgumentException("Unsupported validation status: " + value);
    }
}
