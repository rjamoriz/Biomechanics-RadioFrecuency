package com.biomech.app.validation;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ValidationService {

    private final ValidationRunRepository repository;

    public ValidationService(ValidationRunRepository repository) {
        this.repository = repository;
    }

    public List<ValidationRun> bySession(UUID sessionId) {
        return repository.findBySessionId(sessionId);
    }

    @Transactional
    public ValidationRun create(ValidationRun run) {
        run.setId(null); // guard: never accept a client-supplied ID
        return repository.save(run);
    }
}
