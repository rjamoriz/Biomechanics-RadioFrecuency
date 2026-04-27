package com.biomech.app.session;

import com.biomech.app.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionControllerIntegrationTest extends AbstractIntegrationTest {

    private String token;
    private String athleteId;
    private String stationId;

    @BeforeEach
    void setup() throws Exception {
        token = obtainToken("session-test@biomech.test", "password123");
        athleteId = createAthlete();
        stationId = createStation();
    }

    private String createAthlete() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "firstName", "Runner",
                "lastName", "TestAthlete"
        ));
        var result = mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
        return (String) objectMapper.readValue(
                result.getResponse().getContentAsString(), Map.class).get("id");
    }

    private String createStation() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "name", "Test Station " + System.nanoTime(),
                "receiverMac", "AA:BB:CC:DD:EE:FF",
                "transmitterMac", "11:22:33:44:55:66"
        ));
        var result = mockMvc.perform(post("/api/stations")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
        return (String) objectMapper.readValue(
                result.getResponse().getContentAsString(), Map.class).get("id");
    }

    @Test
    void createSessionReturns201() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "athleteId", athleteId,
                "stationId", stationId,
                "operatorNotes", "Integration test session"
        ));

        mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.status").value("CREATED"));
    }

    @Test
    void sessionLifecycle_CreatedStartedCompleted() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "athleteId", athleteId,
                "stationId", stationId
        ));

        var created = mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();

        String sessionId = (String) objectMapper.readValue(
                created.getResponse().getContentAsString(), Map.class).get("id");

        // Start
        mockMvc.perform(post("/api/sessions/" + sessionId + "/start")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.startedAt").isNotEmpty());

        // Complete
        mockMvc.perform(post("/api/sessions/" + sessionId + "/complete")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.completedAt").isNotEmpty());
    }

    @Test
    void sessionLifecycle_CreatedCancelled() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "athleteId", athleteId,
                "stationId", stationId
        ));

        var created = mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        String sessionId = (String) objectMapper.readValue(
                created.getResponse().getContentAsString(), Map.class).get("id");

        mockMvc.perform(post("/api/sessions/" + sessionId + "/cancel")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void getSessionByIdReturns200() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "athleteId", athleteId,
                "stationId", stationId,
                "shoeType", "carbon-plate",
                "inferredMotionEnabled", true
        ));

        var created = mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        String sessionId = (String) objectMapper.readValue(
                created.getResponse().getContentAsString(), Map.class).get("id");

        mockMvc.perform(get("/api/sessions/" + sessionId)
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(sessionId))
                .andExpect(jsonPath("$.shoeType").value("carbon-plate"))
                .andExpect(jsonPath("$.inferredMotionEnabled").value(true));
    }

    @Test
    void getNonExistentSessionReturns404() throws Exception {
        mockMvc.perform(get("/api/sessions/00000000-0000-0000-0000-000000000000")
                        .header("Authorization", token))
                .andExpect(status().isNotFound());
    }

    @Test
    void getSessionsByAthleteReturnsResults() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "athleteId", athleteId,
                "stationId", stationId
        ));

        mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/sessions/by-athlete/" + athleteId)
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", not(empty())));
    }

    @Test
    void createSessionWithMissingAthleteReturns404() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "athleteId", "00000000-0000-0000-0000-000000000000",
                "stationId", stationId
        ));

        mockMvc.perform(post("/api/sessions")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound());
    }
}
