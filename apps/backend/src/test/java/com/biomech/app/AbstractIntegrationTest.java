package com.biomech.app;

import com.biomech.app.athlete.Athlete;
import com.biomech.app.athlete.AthleteRepository;
import com.biomech.app.session.Session;
import com.biomech.app.session.SessionRepository;
import com.biomech.app.station.Station;
import com.biomech.app.station.StationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

/**
 * Base class for all backend integration tests.
 *
 * Each test method runs in a transaction that is rolled back on completion,
 * keeping the database clean between tests without extra setup cost.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Transactional
public abstract class AbstractIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    private AthleteRepository athleteRepository;

    @Autowired
    private StationRepository stationRepository;

    @Autowired
    private SessionRepository sessionRepository;

    // ─── Test fixture helpers ─────────────────────────────────────────────────

    /**
     * Create and persist a minimal athlete.  Rolled back after the test.
     */
    protected UUID createAthlete() {
        var athlete = new Athlete();
        athlete.setFirstName("Test");
        athlete.setLastName("Athlete");
        return athleteRepository.save(athlete).getId();
    }

    /**
     * Create and persist a station with the required NOT NULL columns.
     * The name is randomised to avoid UNIQUE constraint collisions between tests
     * that run inside the same outer transaction.
     */
    protected UUID createStation() {
        var station = new Station();
        station.setName("station-" + UUID.randomUUID());
        station.setReceiverMac("aa:bb:cc:dd:ee:ff");
        station.setTransmitterMac("11:22:33:44:55:66");
        return stationRepository.save(station).getId();
    }

    /**
     * Create and persist a session linked to the given athlete and station.
     * Uses {@code getReferenceById} to avoid an extra SELECT when only the
     * FK proxy is needed by JPA.
     */
    protected UUID createSession(UUID athleteId, UUID stationId) {
        var athlete = athleteRepository.findById(athleteId).orElseThrow();
        var station = stationRepository.findById(stationId).orElseThrow();
        var session = new Session();
        session.setAthlete(athlete);
        session.setStation(station);
        return sessionRepository.save(session).getId();
    }
}
