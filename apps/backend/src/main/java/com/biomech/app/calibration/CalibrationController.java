package com.biomech.app.calibration;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/calibrations")
public class CalibrationController {

    private final CalibrationProfileRepository repository;

    public CalibrationController(CalibrationProfileRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/station/{stationId}")
    public List<CalibrationProfile> byStation(@PathVariable UUID stationId) {
        return repository.findByStationIdOrderByCreatedAtDesc(stationId);
    }

    @GetMapping("/station/{stationId}/latest")
    public CalibrationProfile latest(@PathVariable UUID stationId) {
        return repository.findFirstByStationIdOrderByCreatedAtDesc(stationId)
                .orElseThrow(() -> new NoSuchElementException(
                        "No calibration found for station: " + stationId));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CalibrationProfile create(@RequestBody CalibrationProfile profile) {
        return repository.save(profile);
    }
}
