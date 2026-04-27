package com.biomech.app.calibration;

import com.biomech.app.station.Station;
import com.biomech.app.station.StationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/calibrations")
public class CalibrationController {

    private final CalibrationService service;
    private final StationService stationService;

    public CalibrationController(CalibrationService service, StationService stationService) {
        this.service = service;
        this.stationService = stationService;
    }

    @GetMapping("/station/{stationId}")
    public List<CalibrationProfile> byStation(@PathVariable UUID stationId) {
        return service.byStation(stationId);
    }

    @GetMapping("/station/{stationId}/latest")
    public CalibrationProfile latest(@PathVariable UUID stationId) {
        return service.latestForStation(stationId);
    }

    /**
     * Returns {@code true} when a valid, non-expired calibration exists for the station.
     * Used by the gateway to determine calibration state before metric streaming.
     */
    @GetMapping("/station/{stationId}/active")
    public boolean active(@PathVariable UUID stationId) {
        return service.isActiveForStation(stationId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CalibrationProfile create(@RequestBody @Valid CalibrationRequest request) {
        Station station = stationService.findById(request.stationId());
        var profile = new CalibrationProfile();
        profile.setStation(station);
        if (request.status() != null) {
            profile.setStatus(request.status());
        }
        if (request.signalQualityScore() != null) {
            profile.setSignalQualityScore(request.signalQualityScore());
        }
        if (request.notes() != null) {
            profile.setNotes(request.notes());
        }
        return service.create(profile);
    }
}
