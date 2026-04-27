package com.biomech.app.athlete;

import com.biomech.app.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AthleteControllerIntegrationTest extends AbstractIntegrationTest {

    private String token;

    @BeforeEach
    void setup() throws Exception {
        token = obtainToken("athlete-test@biomech.test", "password123");
    }

    @Test
    void createAthleteReturns201() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "firstName", "Laura",
                "lastName", "Díaz",
                "email", "laura.diaz@test.com",
                "sport", "Running"
        ));

        mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.firstName").value("Laura"))
                .andExpect(jsonPath("$.lastName").value("Díaz"))
                .andExpect(jsonPath("$.sport").value("Running"));
    }

    @Test
    void listAthletesReturnsCreatedAthlete() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "firstName", "Carlos",
                "lastName", "López"
        ));

        mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/athletes")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", not(empty())))
                .andExpect(jsonPath("$[*].lastName", hasItem("López")));
    }

    @Test
    void getByIdReturns200() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "firstName", "Sofía",
                "lastName", "Ramírez",
                "email", "sofia@test.com"
        ));

        var created = mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();

        var createdMap = objectMapper.readValue(
                created.getResponse().getContentAsString(), Map.class);
        String id = (String) createdMap.get("id");

        mockMvc.perform(get("/api/athletes/" + id)
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.firstName").value("Sofía"));
    }

    @Test
    void getNonExistentAthleteReturns404() throws Exception {
        mockMvc.perform(get("/api/athletes/00000000-0000-0000-0000-000000000000")
                        .header("Authorization", token))
                .andExpect(status().isNotFound());
    }

    @Test
    void updateAthleteReturns200() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "firstName", "Ignacio",
                "lastName", "Vega"
        ));

        var created = mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();

        var createdMap = objectMapper.readValue(
                created.getResponse().getContentAsString(), Map.class);
        String id = (String) createdMap.get("id");

        String updateBody = objectMapper.writeValueAsString(Map.of(
                "firstName", "Ignacio",
                "lastName", "Vega",
                "sport", "Cycling"
        ));

        mockMvc.perform(put("/api/athletes/" + id)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sport").value("Cycling"));
    }

    @Test
    void deleteAthleteReturns204() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "firstName", "Marcos",
                "lastName", "Torres"
        ));

        var created = mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();

        var createdMap = objectMapper.readValue(
                created.getResponse().getContentAsString(), Map.class);
        String id = (String) createdMap.get("id");

        mockMvc.perform(delete("/api/athletes/" + id)
                        .header("Authorization", token))
                .andExpect(status().isNoContent());

        // Soft-deleted athlete should return 404
        mockMvc.perform(get("/api/athletes/" + id)
                        .header("Authorization", token))
                .andExpect(status().isNotFound());
    }

    @Test
    void createAthleteWithoutFirstNameReturns400() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "lastName", "Missing FirstName"
        ));

        mockMvc.perform(post("/api/athletes")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }
}
