package com.biomech.app.validation;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/validations")
public class ValidationController {

    private final ValidationService service;

    public ValidationController(ValidationService service) {
        this.service = service;
    }

    @GetMapping("/session/{sessionId}")
    public List<ValidationRun> bySession(@PathVariable UUID sessionId) {
        return service.bySession(sessionId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ValidationRun create(@RequestBody ValidationRun run) {
        return service.create(run);
    }
}
