package com.biomech.app.athlete;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Transactional
public class AthleteService {

    private final AthleteRepository repository;

    public AthleteService(AthleteRepository repository) {
        this.repository = repository;
    }

    public List<Athlete> findAll() {
        return repository.findByActiveTrue();
    }

    public Athlete findById(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Athlete not found: " + id));
    }

    public Athlete create(AthleteDto dto) {
        var athlete = new Athlete();
        mapFields(dto, athlete);
        return repository.save(athlete);
    }

    public Athlete update(UUID id, AthleteDto dto) {
        var athlete = findById(id);
        mapFields(dto, athlete);
        return repository.save(athlete);
    }

    public void delete(UUID id) {
        var athlete = findById(id);
        athlete.setActive(false);
        repository.save(athlete);
    }

    private void mapFields(AthleteDto dto, Athlete athlete) {
        athlete.setFirstName(dto.firstName());
        athlete.setLastName(dto.lastName());
        athlete.setEmail(dto.email());
        athlete.setSport(dto.sport());
        athlete.setBirthYear(dto.birthYear());
        athlete.setHeightCm(dto.heightCm());
        athlete.setWeightKg(dto.weightKg());
        athlete.setShoeNotes(dto.shoeNotes());
        athlete.setNotes(dto.notes());
    }
}
