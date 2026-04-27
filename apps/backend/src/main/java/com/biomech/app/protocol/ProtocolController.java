package com.biomech.app.protocol;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/protocols")
public class ProtocolController {

    private final ProtocolService service;

    public ProtocolController(ProtocolService service) {
        this.service = service;
    }

    @GetMapping
    public List<ProtocolTemplate> list() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public ProtocolTemplate get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProtocolTemplate create(@RequestBody ProtocolTemplate protocol) {
        return service.create(protocol);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
