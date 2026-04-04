package com.biomech.app.session;

import com.biomech.app.common.BaseEntity;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "session_events")
public class SessionEvent extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private Session session;

    @Column(nullable = false)
    private String eventType;

    @Column(nullable = false)
    private Instant occurredAt;

    private String description;
    private String metadata;

    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getMetadata() { return metadata; }
    public void setMetadata(String metadata) { this.metadata = metadata; }
}
