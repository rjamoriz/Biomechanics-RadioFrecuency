package com.biomech.app.treadmill;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class TreadmillService {

    private final TreadmillRepository repository;

    public TreadmillService(TreadmillRepository repository) {
        this.repository = repository;
    }

    public List<Treadmill> findAll() {
        return repository.findAll().stream()
                .filter(Treadmill::isActive)
                .toList();
    }

    public Treadmill findById(UUID id) {
        return repository.findById(id)
                .filter(Treadmill::isActive)
                .orElseThrow(() -> new NoSuchElementException("Treadmill not found: " + id));
    }

    @Transactional
    public Treadmill create(Treadmill treadmill) {
        treadmill.setId(null); // guard: never accept a client-supplied ID
        treadmill.setActive(true);
        return repository.save(treadmill);
    }

    @Transactional
    public Treadmill update(UUID id, Treadmill patch) {
        Treadmill existing = findById(id);
        existing.setBrand(patch.getBrand());
        existing.setModel(patch.getModel());
        existing.setMaxSpeedKph(patch.getMaxSpeedKph());
        existing.setMaxInclinePercent(patch.getMaxInclinePercent());
        existing.setStation(patch.getStation());
        return repository.save(existing);
    }

    /** Soft-delete: sets active = false. */
    @Transactional
    public void delete(UUID id) {
        Treadmill existing = findById(id);
        existing.setActive(false);
        repository.save(existing);
    }
}
