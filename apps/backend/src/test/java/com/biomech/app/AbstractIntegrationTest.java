package com.biomech.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base class for controller integration tests.
 *
 * <p>Shares a single PostgreSQL Testcontainer across the entire test suite.
 * Subclasses inherit the MockMvc instance, ObjectMapper, and a helper to
 * obtain a valid JWT token via the auth endpoint.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
public abstract class AbstractIntegrationTest {

    @Container
    @SuppressWarnings("resource") // lifecycle managed by Testcontainers @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:15-alpine")
                    .withReuse(true);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    /**
     * Registers a test user and returns a Bearer token.
     * Safe to call multiple times — duplicate email causes login fallback.
     */
    protected String obtainToken(String email, String password) throws Exception {
        // Try register
        String registerBody = objectMapper.writeValueAsString(Map.of(
                "email", email,
                "password", password,
                "displayName", "Test User",
                "role", "ADMIN"
        ));

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody))
                // May already exist on re-runs — that's fine
                .andReturn();

        // Login (always returns fresh token)
        String loginBody = objectMapper.writeValueAsString(Map.of(
                "email", email,
                "password", password
        ));

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody))
                .andExpect(status().isOk())
                .andReturn();

        Map<?, ?> response = objectMapper.readValue(
                result.getResponse().getContentAsString(), Map.class);

        return "Bearer " + response.get("token");
    }
}
