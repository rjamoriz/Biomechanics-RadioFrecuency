package com.biomech.app.longitudinal;

import com.biomech.app.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;

import java.time.LocalDate;
import java.util.UUID;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WithMockUser
class LongitudinalControllerIT extends AbstractIntegrationTest {

    private UUID athleteId;

    @BeforeEach
    void setUp() {
        athleteId = createAthlete();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private TrainingLoadRequest validLoadRequest() {
        var req = new TrainingLoadRequest();
        req.setAthleteId(athleteId);
        req.setSessionDate(LocalDate.now());
        req.setAcuteLoad(55.0);
        req.setRpe(6);
        req.setSource("manual");
        return req;
    }

    private PainReportRequest validPainRequest() {
        var req = new PainReportRequest();
        req.setAthleteId(athleteId);
        req.setBodyRegion("achilles");
        req.setPainScale(4);
        return req;
    }

    private void postLoad() throws Exception {
        mockMvc.perform(post("/api/longitudinal/training-loads")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validLoadRequest())));
    }

    private void postPain() throws Exception {
        mockMvc.perform(post("/api/longitudinal/pain-reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validPainRequest())));
    }

    // ─── POST /api/longitudinal/training-loads ────────────────────────────────

    @Test
    void postTrainingLoad_validRequest_returns201WithComputedFields() throws Exception {
        mockMvc.perform(post("/api/longitudinal/training-loads")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validLoadRequest())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.athleteId").value(athleteId.toString()))
                .andExpect(jsonPath("$.acuteLoad").value(55.0))
                .andExpect(jsonPath("$.acwr").isNotEmpty())       // computed by service
                .andExpect(jsonPath("$.chronicLoad").isNotEmpty()); // computed by service
    }

    @Test
    void postTrainingLoad_missingRequiredFields_returns400() throws Exception {
        // Empty request violates @NotNull on athleteId, sessionDate, acuteLoad
        var emptyRequest = new TrainingLoadRequest();
        mockMvc.perform(post("/api/longitudinal/training-loads")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emptyRequest)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void postTrainingLoad_rpeOutOfRange_returns400() throws Exception {
        var req = validLoadRequest();
        req.setRpe(11); // @Max(10) violated
        mockMvc.perform(post("/api/longitudinal/training-loads")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    // ─── GET /api/longitudinal/athletes/{id}/training-loads ──────────────────

    @Test
    void getTrainingLoads_afterPost_returnsListWithElement() throws Exception {
        postLoad();

        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/training-loads"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].athleteId").value(athleteId.toString()));
    }

    @Test
    void getTrainingLoads_noData_returnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/training-loads"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    // ─── GET /api/longitudinal/athletes/{id}/training-loads/range ────────────

    @Test
    void getTrainingLoadsByRange_inRange_returnsElement() throws Exception {
        postLoad();

        String from = LocalDate.now().minusDays(1).toString();
        String to = LocalDate.now().plusDays(1).toString();

        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/training-loads/range")
                        .param("from", from)
                        .param("to", to))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))));
    }

    @Test
    void getTrainingLoadsByRange_outsideRange_returnsEmptyList() throws Exception {
        postLoad();

        // Query a range in the past — today's load is excluded
        String from = LocalDate.now().minusDays(30).toString();
        String to = LocalDate.now().minusDays(10).toString();

        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/training-loads/range")
                        .param("from", from)
                        .param("to", to))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    // ─── POST /api/longitudinal/pain-reports ─────────────────────────────────

    @Test
    void postPainReport_validRequest_returns201WithExpectedFields() throws Exception {
        mockMvc.perform(post("/api/longitudinal/pain-reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validPainRequest())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.athleteId").value(athleteId.toString()))
                .andExpect(jsonPath("$.bodyRegion").value("achilles"))
                .andExpect(jsonPath("$.painScale").value(4))
                .andExpect(jsonPath("$.reportedAt").isNotEmpty());
    }

    @Test
    void postPainReport_missingRequiredFields_returns400() throws Exception {
        var emptyRequest = new PainReportRequest();
        mockMvc.perform(post("/api/longitudinal/pain-reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emptyRequest)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void postPainReport_painScaleAboveMax_returns400() throws Exception {
        var req = validPainRequest();
        req.setPainScale(11); // @Max(10) violated
        mockMvc.perform(post("/api/longitudinal/pain-reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    // ─── GET /api/longitudinal/athletes/{id}/pain-reports ────────────────────

    @Test
    void getPainReports_afterPost_returnsListWithElement() throws Exception {
        postPain();

        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/pain-reports"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].bodyRegion").value("achilles"));
    }

    @Test
    void getPainReports_noData_returnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/pain-reports"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    // ─── GET /api/longitudinal/athletes/{id}/pain-reports/recent ─────────────

    @Test
    void getRecentPainReports_afterPost_includesRecentReport() throws Exception {
        postPain();

        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/pain-reports/recent")
                        .param("days", "14"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))));
    }

    @Test
    void getRecentPainReports_defaultDays_returns200() throws Exception {
        // No param — uses defaultValue = 14
        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/pain-reports/recent"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    // ─── GET /api/longitudinal/athletes/{id}/baselines ───────────────────────

    @Test
    void getBaselines_noData_returnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/longitudinal/athletes/" + athleteId + "/baselines"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void getBaselines_unknownAthlete_returnsEmptyList() throws Exception {
        // Service returns empty list for unknown athlete — not a 404
        mockMvc.perform(get("/api/longitudinal/athletes/" + UUID.randomUUID() + "/baselines"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }
}
