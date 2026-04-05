CREATE TABLE sessions (
    id                       UUID PRIMARY KEY,
    athlete_id               UUID        NOT NULL REFERENCES athletes(id),
    station_id               UUID        NOT NULL REFERENCES stations(id),
    treadmill_id             UUID REFERENCES treadmills(id),
    protocol_id              UUID REFERENCES protocol_templates(id),
    status                   VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    validation_status        VARCHAR(50) NOT NULL DEFAULT 'UNVALIDATED',
    started_at               TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,
    operator_notes           TEXT,
    shoe_type                VARCHAR(255),
    inferred_motion_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_stages (
    id                      UUID PRIMARY KEY,
    session_id              UUID             NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    order_index             INTEGER          NOT NULL,
    label                   VARCHAR(255)     NOT NULL,
    speed_kph               DOUBLE PRECISION NOT NULL,
    incline_percent         DOUBLE PRECISION NOT NULL,
    planned_duration_seconds INTEGER,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE TABLE session_events (
    id          UUID PRIMARY KEY,
    session_id  UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type  VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMPTZ  NOT NULL,
    description TEXT,
    metadata    TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
