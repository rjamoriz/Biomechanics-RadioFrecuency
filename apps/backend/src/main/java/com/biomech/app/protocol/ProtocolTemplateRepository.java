package com.biomech.app.protocol;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ProtocolTemplateRepository extends JpaRepository<ProtocolTemplate, UUID> {
}
