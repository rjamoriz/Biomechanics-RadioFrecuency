package com.biomech.app.station;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/stations")
public class StationController {

    private final StationService service;

    public StationController(StationService service) {
        this.service = service;
    }

    @GetMapping
    public List<Station> list() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public Station get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Station create(@RequestBody Station station) {
        return service.create(station);
    }

    @PutMapping("/{id}")
    public Station update(@PathVariable UUID id, @RequestBody Station station) {
        return service.update(id, station);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
