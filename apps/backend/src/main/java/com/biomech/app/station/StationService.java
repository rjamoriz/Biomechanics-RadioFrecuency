package com.biomech.app.station;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Transactional
public class StationService {

    private final StationRepository repository;

    public StationService(StationRepository repository) {
        this.repository = repository;
    }

    public List<Station> findAll() {
        return repository.findByActiveTrue();
    }

    public Station findById(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Station not found: " + id));
    }

    public Station create(Station station) {
        return repository.save(station);
    }

    public Station update(UUID id, Station updated) {
        var station = findById(id);
        station.setName(updated.getName());
        station.setLocation(updated.getLocation());
        station.setDescription(updated.getDescription());
        station.setReceiverMac(updated.getReceiverMac());
        station.setTransmitterMac(updated.getTransmitterMac());
        station.setTxDistanceCm(updated.getTxDistanceCm());
        station.setTxHeightCm(updated.getTxHeightCm());
        station.setRxHeightCm(updated.getRxHeightCm());
        station.setTxAngleDeg(updated.getTxAngleDeg());
        return repository.save(station);
    }

    public void delete(UUID id) {
        var station = findById(id);
        station.setActive(false);
        repository.save(station);
    }
}
