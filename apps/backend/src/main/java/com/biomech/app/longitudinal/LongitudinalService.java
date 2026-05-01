package com.biomech.app.longitudinal;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class LongitudinalService {

    private static final int ACUTE_DAYS = 7;
    private static final int CHRONIC_DAYS = 28;

    private final TrainingLoadRepository trainingLoadRepo;
    private final PainReportRepository painReportRepo;
    private final AthleteBaselineRepository baselineRepo;

    public LongitudinalService(TrainingLoadRepository trainingLoadRepo,
                                PainReportRepository painReportRepo,
                                AthleteBaselineRepository baselineRepo) {
        this.trainingLoadRepo = trainingLoadRepo;
        this.painReportRepo = painReportRepo;
        this.baselineRepo = baselineRepo;
    }

    // ─── Training Loads ──────────────────────────────────────────────────────

    @Transactional
    public TrainingLoad recordLoad(TrainingLoadRequest request) {
        var load = new TrainingLoad();
        load.setAthleteId(request.getAthleteId());
        load.setSessionId(request.getSessionId());
        load.setSessionDate(request.getSessionDate());
        load.setAcuteLoad(request.getAcuteLoad());
        load.setRpe(request.getRpe());
        load.setSessionRpe(request.getSessionRpe());
        load.setSource(request.getSource() != null ? request.getSource() : "derived");
        load.setNotes(request.getNotes());

        // Compute ACWR from historical data
        var acwr = computeAcwr(request.getAthleteId(), request.getSessionDate(), request.getAcuteLoad());
        load.setChronicLoad(acwr.chronicLoad());
        load.setAcwr(acwr.ratio());
        load.setMonotony(acwr.monotony());
        load.setStrain(acwr.strain());

        return trainingLoadRepo.save(load);
    }

    @Transactional(readOnly = true)
    public List<TrainingLoad> findLoadsByAthlete(UUID athleteId) {
        return trainingLoadRepo.findByAthleteIdOrderBySessionDateDesc(athleteId);
    }

    @Transactional(readOnly = true)
    public List<TrainingLoad> findLoadsByAthleteInRange(UUID athleteId, LocalDate from, LocalDate to) {
        return trainingLoadRepo.findByAthleteIdAndSessionDateBetweenOrderBySessionDateAsc(athleteId, from, to);
    }

    // ─── Pain Reports ─────────────────────────────────────────────────────────

    @Transactional
    public PainReport recordPain(PainReportRequest request) {
        var report = new PainReport();
        report.setAthleteId(request.getAthleteId());
        report.setSessionId(request.getSessionId());
        report.setReportedAt(request.getReportedAt() != null ? request.getReportedAt() : Instant.now());
        report.setBodyRegion(request.getBodyRegion());
        report.setPainScale(request.getPainScale());
        report.setNotes(request.getNotes());
        return painReportRepo.save(report);
    }

    @Transactional(readOnly = true)
    public List<PainReport> findPainByAthlete(UUID athleteId) {
        return painReportRepo.findByAthleteIdOrderByReportedAtDesc(athleteId);
    }

    @Transactional(readOnly = true)
    public List<PainReport> findRecentPainByAthlete(UUID athleteId, int days) {
        var since = Instant.now().minusSeconds((long) days * 86_400);
        return painReportRepo.findByAthleteIdAndReportedAtAfterOrderByReportedAtDesc(athleteId, since);
    }

    // ─── Baselines ────────────────────────────────────────────────────────────

    @Transactional
    public AthleteBaseline upsertBaseline(UUID athleteId, String metricName, double newValue, int windowDays) {
        var existing = baselineRepo.findByAthleteIdAndMetricNameAndWindowDays(athleteId, metricName, windowDays);
        AthleteBaseline baseline;
        if (existing.isPresent()) {
            baseline = existing.get();
            // Welford's online algorithm for running mean and variance
            int n = baseline.getSampleCount() + 1;
            double delta = newValue - baseline.getBaselineMean();
            double newMean = baseline.getBaselineMean() + delta / n;
            double delta2 = newValue - newMean;
            double newVariance = (baseline.getBaselineStd() * baseline.getBaselineStd()
                    * (n - 2) + delta * delta2) / (n - 1);
            baseline.setBaselineMean(newMean);
            baseline.setBaselineStd(Math.sqrt(Math.max(0, newVariance)));
            baseline.setSampleCount(n);
        } else {
            baseline = new AthleteBaseline();
            baseline.setAthleteId(athleteId);
            baseline.setMetricName(metricName);
            baseline.setBaselineMean(newValue);
            baseline.setBaselineStd(0.0);
            baseline.setSampleCount(1);
            baseline.setWindowDays(windowDays);
        }
        baseline.setLastUpdatedAt(Instant.now());
        return baselineRepo.save(baseline);
    }

    @Transactional(readOnly = true)
    public List<AthleteBaseline> findBaselinesByAthlete(UUID athleteId) {
        return baselineRepo.findByAthleteId(athleteId);
    }

    // ─── ACWR Calculation ─────────────────────────────────────────────────────

    private record AcwrResult(double chronicLoad, double ratio, double monotony, double strain) {}

    private AcwrResult computeAcwr(UUID athleteId, LocalDate date, double todayAcuteLoad) {
        var historicLoads = trainingLoadRepo.findRecentByAthlete(
                athleteId, date.minusDays(CHRONIC_DAYS));

        var last7 = historicLoads.stream()
                .filter(l -> !l.getSessionDate().isBefore(date.minusDays(ACUTE_DAYS)))
                .mapToDouble(TrainingLoad::getAcuteLoad)
                .toArray();

        var last28 = historicLoads.stream()
                .mapToDouble(TrainingLoad::getAcuteLoad)
                .toArray();

        double acuteMean = average(last7, todayAcuteLoad);
        double chronicMean = last28.length > 0 ? average(last28) : acuteMean;
        double ratio = chronicMean > 0 ? acuteMean / chronicMean : 1.0;

        // Monotony = mean(load) / std(load) over 7 days
        double monotony = computeMonotony(last7, todayAcuteLoad);
        double strain = acuteMean * 7 * monotony;

        return new AcwrResult(chronicMean, ratio, monotony, strain);
    }

    private double average(double[] values, double extra) {
        double sum = extra;
        for (double v : values) sum += v;
        return sum / (values.length + 1);
    }

    private double average(double[] values) {
        if (values.length == 0) return 0;
        double sum = 0;
        for (double v : values) sum += v;
        return sum / values.length;
    }

    private double computeMonotony(double[] values, double extra) {
        double[] all = new double[values.length + 1];
        System.arraycopy(values, 0, all, 0, values.length);
        all[values.length] = extra;
        double mean = average(all);
        if (mean == 0) return 0;
        double variance = 0;
        for (double v : all) variance += (v - mean) * (v - mean);
        double std = Math.sqrt(variance / all.length);
        return std > 0 ? mean / std : 0;
    }
}
