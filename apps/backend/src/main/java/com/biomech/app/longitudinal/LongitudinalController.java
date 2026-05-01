package com.biomech.app.longitudinal;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/longitudinal")
public class LongitudinalController {

    private final LongitudinalService service;

    public LongitudinalController(LongitudinalService service) {
        this.service = service;
    }

    // ─── Training Loads ──────────────────────────────────────────────────────

    @PostMapping("/training-loads")
    @ResponseStatus(HttpStatus.CREATED)
    public TrainingLoad recordLoad(@Valid @RequestBody TrainingLoadRequest request) {
        return service.recordLoad(request);
    }

    @GetMapping("/athletes/{athleteId}/training-loads")
    public List<TrainingLoad> getLoads(@PathVariable UUID athleteId) {
        return service.findLoadsByAthlete(athleteId);
    }

    @GetMapping("/athletes/{athleteId}/training-loads/range")
    public List<TrainingLoad> getLoadsByRange(
            @PathVariable UUID athleteId,
            @RequestParam LocalDate from,
            @RequestParam LocalDate to) {
        return service.findLoadsByAthleteInRange(athleteId, from, to);
    }

    // ─── Pain Reports ─────────────────────────────────────────────────────────

    @PostMapping("/pain-reports")
    @ResponseStatus(HttpStatus.CREATED)
    public PainReport recordPain(@Valid @RequestBody PainReportRequest request) {
        return service.recordPain(request);
    }

    @GetMapping("/athletes/{athleteId}/pain-reports")
    public List<PainReport> getPain(@PathVariable UUID athleteId) {
        return service.findPainByAthlete(athleteId);
    }

    @GetMapping("/athletes/{athleteId}/pain-reports/recent")
    public List<PainReport> getRecentPain(
            @PathVariable UUID athleteId,
            @RequestParam(defaultValue = "14") int days) {
        return service.findRecentPainByAthlete(athleteId, days);
    }

    // ─── Baselines ────────────────────────────────────────────────────────────

    @GetMapping("/athletes/{athleteId}/baselines")
    public List<AthleteBaseline> getBaselines(@PathVariable UUID athleteId) {
        return service.findBaselinesByAthlete(athleteId);
    }
}
