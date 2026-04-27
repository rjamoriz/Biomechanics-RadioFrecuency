package com.biomech.app.treadmill;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/treadmills")
public class TreadmillController {

    private final TreadmillService service;

    public TreadmillController(TreadmillService service) {
        this.service = service;
    }

    @GetMapping
    public List<Treadmill> list() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public Treadmill get(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Treadmill create(@RequestBody Treadmill treadmill) {
        return service.create(treadmill);
    }

    @PutMapping("/{id}")
    public Treadmill update(@PathVariable UUID id, @RequestBody Treadmill patch) {
        return service.update(id, patch);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
