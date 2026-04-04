package com.biomech.app.session;

import com.biomech.app.athlete.AthleteRepository;
import com.biomech.app.common.SessionStatus;
import com.biomech.app.protocol.ProtocolTemplateRepository;
import com.biomech.app.station.StationRepository;
import com.biomech.app.treadmill.TreadmillRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Transactional
public class SessionService {

    private final SessionRepository sessionRepository;
    private final AthleteRepository athleteRepository;
    private final StationRepository stationRepository;
    private final TreadmillRepository treadmillRepository;
    private final ProtocolTemplateRepository protocolRepository;

    public SessionService(SessionRepository sessionRepository,
                          AthleteRepository athleteRepository,
                          StationRepository stationRepository,
                          TreadmillRepository treadmillRepository,
                          ProtocolTemplateRepository protocolRepository) {
        this.sessionRepository = sessionRepository;
        this.athleteRepository = athleteRepository;
        this.stationRepository = stationRepository;
        this.treadmillRepository = treadmillRepository;
        this.protocolRepository = protocolRepository;
    }

    public List<Session> findAll() {
        return sessionRepository.findAll();
    }

    public Session findById(UUID id) {
        return sessionRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Session not found: " + id));
    }

    public List<Session> findByAthlete(UUID athleteId) {
        return sessionRepository.findByAthleteIdOrderByCreatedAtDesc(athleteId);
    }

    public Session create(CreateSessionRequest request) {
        var athlete = athleteRepository.findById(request.athleteId())
                .orElseThrow(() -> new NoSuchElementException("Athlete not found"));
        var station = stationRepository.findById(request.stationId())
                .orElseThrow(() -> new NoSuchElementException("Station not found"));

        var session = new Session();
        session.setAthlete(athlete);
        session.setStation(station);
        session.setOperatorNotes(request.operatorNotes());
        session.setShoeType(request.shoeType());
        session.setInferredMotionEnabled(request.inferredMotionEnabled());

        if (request.treadmillId() != null) {
            var treadmill = treadmillRepository.findById(request.treadmillId())
                    .orElseThrow(() -> new NoSuchElementException("Treadmill not found"));
            session.setTreadmill(treadmill);
        }

        if (request.protocolId() != null) {
            var protocol = protocolRepository.findById(request.protocolId())
                    .orElseThrow(() -> new NoSuchElementException("Protocol not found"));
            session.setProtocol(protocol);
        }

        return sessionRepository.save(session);
    }

    public Session start(UUID id) {
        var session = findById(id);
        session.setStatus(SessionStatus.RUNNING);
        session.setStartedAt(Instant.now());
        return sessionRepository.save(session);
    }

    public Session pause(UUID id) {
        var session = findById(id);
        session.setStatus(SessionStatus.PAUSED);
        return sessionRepository.save(session);
    }

    public Session complete(UUID id) {
        var session = findById(id);
        session.setStatus(SessionStatus.COMPLETED);
        session.setCompletedAt(Instant.now());
        return sessionRepository.save(session);
    }

    public Session cancel(UUID id) {
        var session = findById(id);
        session.setStatus(SessionStatus.CANCELLED);
        session.setCompletedAt(Instant.now());
        return sessionRepository.save(session);
    }
}
