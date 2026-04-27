package com.biomech.app.protocol;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ProtocolService {

    private final ProtocolTemplateRepository repository;

    public ProtocolService(ProtocolTemplateRepository repository) {
        this.repository = repository;
    }

    public List<ProtocolTemplate> findAll() {
        return repository.findAll();
    }

    public ProtocolTemplate findById(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Protocol not found: " + id));
    }

    @Transactional
    public ProtocolTemplate create(ProtocolTemplate protocol) {
        protocol.setId(null); // guard: never accept a client-supplied ID
        return repository.save(protocol);
    }

    @Transactional
    public void delete(UUID id) {
        if (!repository.existsById(id)) {
            throw new NoSuchElementException("Protocol not found: " + id);
        }
        repository.deleteById(id);
    }
}
