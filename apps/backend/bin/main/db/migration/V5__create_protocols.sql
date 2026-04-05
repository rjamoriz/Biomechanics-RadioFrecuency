CREATE TABLE protocol_templates (
    id                UUID PRIMARY KEY,
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    target_population VARCHAR(255),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE protocol_stages (
    id                UUID PRIMARY KEY,
    protocol_id       UUID             NOT NULL REFERENCES protocol_templates(id) ON DELETE CASCADE,
    order_index       INTEGER          NOT NULL,
    label             VARCHAR(255)     NOT NULL,
    duration_seconds  INTEGER          NOT NULL,
    speed_kph         DOUBLE PRECISION NOT NULL,
    incline_percent   DOUBLE PRECISION NOT NULL,
    created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
