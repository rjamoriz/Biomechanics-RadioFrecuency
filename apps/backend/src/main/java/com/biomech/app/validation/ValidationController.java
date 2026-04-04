package com.biomech.app.validation;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/validations")
public class ValidationController {

    private final ValidationRunRepository repository;

    public ValidationController(ValidationRunRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/session/{sessionId}")
    public List<ValidationRun> bySession(@PathVariable UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ValidationRun create(@RequestBody ValidationRun run) {
        return repository.save(run);
    }
}
