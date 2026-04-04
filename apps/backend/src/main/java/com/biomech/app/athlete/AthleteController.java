package com.biomech.app.athlete;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/athletes")
public class AthleteController {

    private final AthleteService service;

    public AthleteController(AthleteService service) {
        this.service = service;
    }

    @GetMapping
    public List<Athlete> list() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public Athlete get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Athlete create(@Valid @RequestBody AthleteDto dto) {
        return service.create(dto);
    }

    @PutMapping("/{id}")
    public Athlete update(@PathVariable UUID id, @Valid @RequestBody AthleteDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
