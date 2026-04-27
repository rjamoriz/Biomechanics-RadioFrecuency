package com.biomech.app.injuryrisk;

import com.biomech.app.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for the injury risk REST endpoints.
 *
 * <p>Injury risk is an experimental proxy estimate — not a clinical tool.
 * Tests verify persistence, retrieval, and worst-assessment selection.
 */
class InjuryRiskControllerIntegrationTest extends AbstractIntegrationTest {

    private String token;
    private String sessionId;

    @BeforeEach
    void setup() throws Exception {
        token = obtainToken("injury-risk-test@biomech.test", "password123");
        sessionId = createSessionFixture();
    }

    private String createSessionFixture() throws Exception {
        // Create athlete
        String athlete = objectMapper.writeValueAsString(Map.of(
                "firstName", "Risk",
                "lastName", "Tester"
        ));
        var athleteResult = mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(athlete))
                .andReturn();
        String athleteId = (String) objectMapper.readValue(
                athleteResult.getResponse().getContentAsString(), Map.class).get("id");

        // Create station
        String station = objectMapper.writeValueAsString(Map.of(
                "name", "Risk Station " + System.nanoTime(),
                "receiverMac", "AA:BB:CC:DD:EE:01",
                "transmitterMac", "11:22:33:44:55:01"
        ));
        var stationResult = mockMvc.perform(post("/api/stations")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(station))
                .andReturn();
        String stId = (String) objectMapper.readValue(
                stationResult.getResponse().getContentAsString(), Map.class).get("id");

        // Create session
        String session = objectMapper.writeValueAsString(Map.of(
                "athleteId", athleteId,
                "stationId", stId
        ));
        var sessionResult = mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(session))
                .andReturn();
        return (String) objectMapper.readValue(
                sessionResult.getResponse().getContentAsString(), Map.class).get("id");
    }

    private Map<String, Object> buildPayload(double peakRiskScore, String peakRiskLevel) {
        return Map.of(
                "peakRiskScore", peakRiskScore,
                "peakRiskLevel", peakRiskLevel,
                "meanRiskScore", peakRiskScore * 0.8,
                "snapshotCount", 120,
                "modelConfidence", 0.72,
                "signalQualityScore", 0.85
        );
    }

    @Test
    void saveAssessmentReturns201() throws Exception {
        String body = objectMapper.writeValueAsString(
                buildPayload(0.42, "moderate"));

        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.peakRiskScore").value(0.42))
                .andExpect(jsonPath("$.peakRiskLevel").value("moderate"))
                .andExpect(jsonPath("$.experimental").value(true))
                .andExpect(jsonPath("$.validationStatus").value("experimental"));
    }

    @Test
    void listAssessmentsForSessionReturnsAll() throws Exception {
        // Save two assessments
        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildPayload(0.30, "low"))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildPayload(0.65, "elevated"))))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/injury-risk/session/" + sessionId)
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(2))));
    }

    @Test
    void worstAssessmentReturnsPeakRisk() throws Exception {
        // Save low-risk assessment
        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildPayload(0.20, "low"))))
                .andExpect(status().isCreated());

        // Save high-risk assessment
        mockMvc.perform(post("/api/injury-risk/session/" + sessionId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildPayload(0.80, "high"))))
                .andExpect(status().isCreated());

        // Worst should return the 0.80 score
        mockMvc.perform(get("/api/injury-risk/session/" + sessionId + "/worst")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.peakRiskLevel").value("high"))
                .andExpect(jsonPath("$.peakRiskScore").value(0.80));
    }

    @Test
    void assessmentForNonExistentSessionReturns404() throws Exception {
        String body = objectMapper.writeValueAsString(
                buildPayload(0.50, "moderate"));

        mockMvc.perform(post("/api/injury-risk/session/00000000-0000-0000-0000-000000000000")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound());
    }
}
