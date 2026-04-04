package com.biomech.app.session;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record CreateSessionRequest(
        @NotNull UUID athleteId,
        @NotNull UUID stationId,
        UUID treadmillId,
        UUID protocolId,
        String operatorNotes,
        String shoeType,
        boolean inferredMotionEnabled
) {}
