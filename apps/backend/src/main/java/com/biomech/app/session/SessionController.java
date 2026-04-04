package com.biomech.app.session;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionService service;

    public SessionController(SessionService service) {
        this.service = service;
    }

    @GetMapping
    public List<Session> list() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public Session get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @GetMapping("/by-athlete/{athleteId}")
    public List<Session> byAthlete(@PathVariable UUID athleteId) {
        return service.findByAthlete(athleteId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Session create(@Valid @RequestBody CreateSessionRequest request) {
        return service.create(request);
    }

    @PostMapping("/{id}/start")
    public Session start(@PathVariable UUID id) {
        return service.start(id);
    }

    @PostMapping("/{id}/pause")
    public Session pause(@PathVariable UUID id) {
        return service.pause(id);
    }

    @PostMapping("/{id}/complete")
    public Session complete(@PathVariable UUID id) {
        return service.complete(id);
    }

    @PostMapping("/{id}/cancel")
    public Session cancel(@PathVariable UUID id) {
        return service.cancel(id);
    }
}
