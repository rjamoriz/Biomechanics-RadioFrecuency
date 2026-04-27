package com.biomech.app.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ingestion")
public class IngestionController {

    private static final Logger log = LoggerFactory.getLogger(IngestionController.class);

    private final IngestionService service;

    public IngestionController(IngestionService service) {
        this.service = service;
    }

    @PostMapping("/metrics")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void ingestMetrics(@RequestBody List<IngestionPayload> payloads) {
        log.debug("Ingesting {} metric data points from gateway", payloads.size());
        service.persist(payloads);
    }
}
