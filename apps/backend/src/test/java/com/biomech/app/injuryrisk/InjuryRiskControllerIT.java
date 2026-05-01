package com.biomech.app.injuryrisk;

import com.biomech.app.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;

import java.util.UUID;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WithMockUser
class InjuryRiskControllerIT extends AbstractIntegrationTest {

    private UUID athleteId;
    private UUID sessionId;

    @BeforeEach
    void setUp() {
        athleteId = createAthlete();
        UUID stationId = createStation();
        sessionId = createSession(athleteId, stationId);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private InjuryRiskSummaryRequest validRequest() {
        var req = new InjuryRiskSummaryRequest();
        req.setPeakRiskScore(0.72);
        req.setPeakRiskLevel("high");
        req.setMeanRiskScore(0.55);
        req.setSnapshotCount(120);
        req.setModelConfidence(0.80);
        req.setSignalQualityScore(0.85);
        req.setValidationStatus("unvalidated");
        req.setExperimental(true);
        return req;
    }

    private void postValidSummary() throws Exception {
        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRequest())));
    }

    // ─── POST /api/injury-risk/session/{sessionId} ────────────────────────────

    @Test
    void postRiskSummary_validRequest_returns201WithExpectedFields() throws Exception {
        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.sessionId").value(sessionId.toString()))
                .andExpect(jsonPath("$.peakRiskScore").value(0.72))
                .andExpect(jsonPath("$.peakRiskLevel").value("high"))
                .andExpect(jsonPath("$.meanRiskScore").value(0.55))
                .andExpect(jsonPath("$.snapshotCount").value(120))
                .andExpect(jsonPath("$.validationStatus").value("unvalidated"))
                .andExpect(jsonPath("$.experimental").value(true));
    }

    @Test
    void postRiskSummary_unknownSession_returns404() throws Exception {
        mockMvc.perform(post("/api/injury-risk/session/" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isNotFound());
    }

    @Test
    void postRiskSummary_missingRequiredFields_returns400() throws Exception {
        // Empty request violates @NotNull on peakRiskScore, peakRiskLevel, meanRiskScore, snapshotCount
        var emptyRequest = new InjuryRiskSummaryRequest();
        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emptyRequest)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void postRiskSummary_scoreOutOfRange_returns400() throws Exception {
        var req = validRequest();
        req.setPeakRiskScore(1.5); // > 1.0 violates @DecimalMax("1.0")
        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    // ─── GET /api/injury-risk/session/{sessionId} ─────────────────────────────

    @Test
    void getBySession_afterPost_returnsListWithOneElement() throws Exception {
        postValidSummary();

        mockMvc.perform(get("/api/injury-risk/session/" + sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].sessionId").value(sessionId.toString()));
    }

    @Test
    void getBySession_noSummaries_returnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/injury-risk/session/" + sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    // ─── GET /api/injury-risk/session/{sessionId}/latest ──────────────────────

    @Test
    void getLatestBySession_afterPost_returnsLatestSummary() throws Exception {
        postValidSummary();

        mockMvc.perform(get("/api/injury-risk/session/" + sessionId + "/latest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.peakRiskLevel").value("high"))
                .andExpect(jsonPath("$.sessionId").value(sessionId.toString()));
    }

    @Test
    void getLatestBySession_noSummaries_returns404() throws Exception {
        mockMvc.perform(get("/api/injury-risk/session/" + sessionId + "/latest"))
                .andExpect(status().isNotFound());
    }

    // ─── GET /api/injury-risk/athlete/{athleteId} ─────────────────────────────

    @Test
    void getByAthlete_afterPost_returnsRiskHistory() throws Exception {
        postValidSummary();

        mockMvc.perform(get("/api/injury-risk/athlete/" + athleteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))));
    }

    @Test
    void getByAthlete_noSummaries_returnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/injury-risk/athlete/" + athleteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }
}
