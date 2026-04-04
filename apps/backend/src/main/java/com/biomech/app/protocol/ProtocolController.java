package com.biomech.app.protocol;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/protocols")
public class ProtocolController {

    private final ProtocolTemplateRepository repository;

    public ProtocolController(ProtocolTemplateRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<ProtocolTemplate> list() {
        return repository.findAll();
    }

    @GetMapping("/{id}")
    public ProtocolTemplate get(@PathVariable UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Protocol not found: " + id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProtocolTemplate create(@RequestBody ProtocolTemplate protocol) {
        return repository.save(protocol);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        repository.deleteById(id);
    }
}
