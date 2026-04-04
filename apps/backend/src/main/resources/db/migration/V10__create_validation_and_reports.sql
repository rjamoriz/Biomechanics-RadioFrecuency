CREATE TABLE validation_runs (
    id                      UUID PRIMARY KEY,
    session_id              UUID         NOT NULL REFERENCES sessions(id),
    reference_type          VARCHAR(100) NOT NULL,
    reference_file_name     VARCHAR(500) NOT NULL,
    comparison_results_json JSONB,
    error_summary_json      JSONB,
    notes                   TEXT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE report_artifacts (
    id                       UUID PRIMARY KEY,
    session_id               UUID         NOT NULL REFERENCES sessions(id),
    report_type              VARCHAR(100) NOT NULL,
    file_path                VARCHAR(500) NOT NULL,
    mime_type                VARCHAR(100) NOT NULL,
    includes_inferred_motion BOOLEAN      NOT NULL DEFAULT FALSE,
    notes                    TEXT,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
