package com.biomech.app.ingestion;

import com.biomech.app.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies gateway-facing persistence contracts.
 *
 * <p>All persisted outputs are proxy or inferred motion outputs and must expose
 * validation status using the public wire values.
 */
class IngestionAndInferredMotionIntegrationTest extends AbstractIntegrationTest {

    private String token;
    private String sessionId;

    @BeforeEach
    void setup() throws Exception {
        token = obtainToken("contracts-ci-test@biomech.test", "password123");
        sessionId = createSessionFixture();
    }

    @Test
    void metricBatchIngestionPersistsUnvalidatedSeries() throws Exception {
        var payload = List.of(Map.of(
                "sessionId", sessionId,
                "timestamp", Instant.parse("2026-04-27T12:00:00Z").toString(),
                "metricName", "estimatedCadence",
                "value", 171.5,
                "confidence", 0.81,
                "signalQuality", 0.74,
                "modelVersion", "gateway-test"
        ));

        mockMvc.perform(post("/api/ingestion/metrics")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isAccepted());

        mockMvc.perform(get("/api/analytics/session/" + sessionId + "/metric/estimatedCadence")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].metricName").value("estimatedCadence"))
                .andExpect(jsonPath("$[0].validationStatus").value("unvalidated"));
    }

    @Test
    void inferredMotionPostAndGetRoundTripUsesWireValidationStatus() throws Exception {
        var payload = Map.of(
                "modelVersion", "demo-v0.1.0",
                "inferenceMode", "wifi_csi_inferred_motion",
                "keypointSchemaVersion", "biomech-keypoints-v1",
                "frames", List.of(Map.of(
                        "timestamp", 1_700_000_000_000L,
                        "frameIndex", 1,
                        "confidence", 0.72,
                        "signalQualityScore", 0.83,
                        "validationStatus", "experimental",
                        "experimental", true,
                        "keypoints2D", List.of(Map.of(
                                "name", "left_knee",
                                "x", 0.42,
                                "y", 0.68,
                                "confidence", 0.77
                        ))
                )),
                "meanConfidence", 0.72,
                "signalQualitySummary", 0.83,
                "validationStatus", "experimental"
        );

        mockMvc.perform(post("/api/inferred-motion/session/" + sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.frameCount").value(1))
                .andExpect(jsonPath("$.validationStatus").value("experimental"));

        mockMvc.perform(get("/api/inferred-motion/session/" + sessionId)
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].modelVersion").value("demo-v0.1.0"))
                .andExpect(jsonPath("$[0].validationStatus").value("experimental"));
    }

    private String createSessionFixture() throws Exception {
        var athleteResult = mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "firstName", "Contract",
                                "lastName", "Runner"
                        ))))
                .andReturn();
        String athleteId = (String) objectMapper.readValue(
                athleteResult.getResponse().getContentAsString(), Map.class).get("id");

        var stationResult = mockMvc.perform(post("/api/stations")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", "Contract Station " + System.nanoTime(),
                                "receiverMac", "AA:BB:CC:DD:EE:10",
                                "transmitterMac", "11:22:33:44:55:10"
                        ))))
                .andReturn();
        String stationId = (String) objectMapper.readValue(
                stationResult.getResponse().getContentAsString(), Map.class).get("id");

        var sessionResult = mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "athleteId", athleteId,
                                "stationId", stationId,
                                "inferredMotionEnabled", true
                        ))))
                .andReturn();
        return (String) objectMapper.readValue(
                sessionResult.getResponse().getContentAsString(), Map.class).get("id");
    }
}
