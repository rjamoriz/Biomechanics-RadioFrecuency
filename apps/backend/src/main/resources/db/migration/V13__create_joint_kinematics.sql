-- V13: Joint kinematics per-session records
-- Stores proxy estimates for per-joint angles, forces, and displacements
-- captured during a running session.
--
-- All values are PROXY ESTIMATES with validation_status = 'experimental'.
-- Do not treat as clinical-grade biomechanics data.

CREATE TABLE joint_kinematics_records (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id                      UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    session_id                      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    recorded_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Context
    speed_kmh                       DOUBLE PRECISION NOT NULL DEFAULT 0,
    incline_percent                 DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- Left knee
    left_knee_angle_proxy_deg       DOUBLE PRECISION,
    left_knee_force_proxy_n         DOUBLE PRECISION,
    left_knee_displacement_deg      DOUBLE PRECISION,
    left_knee_risk_level            VARCHAR(20),

    -- Right knee
    right_knee_angle_proxy_deg      DOUBLE PRECISION,
    right_knee_force_proxy_n        DOUBLE PRECISION,
    right_knee_displacement_deg     DOUBLE PRECISION,
    right_knee_risk_level           VARCHAR(20),

    -- Left hip
    left_hip_angle_proxy_deg        DOUBLE PRECISION,
    left_hip_force_proxy_n          DOUBLE PRECISION,
    left_hip_displacement_deg       DOUBLE PRECISION,
    left_hip_risk_level             VARCHAR(20),

    -- Right hip
    right_hip_angle_proxy_deg       DOUBLE PRECISION,
    right_hip_force_proxy_n         DOUBLE PRECISION,
    right_hip_displacement_deg      DOUBLE PRECISION,
    right_hip_risk_level            VARCHAR(20),

    -- Left ankle
    left_ankle_angle_proxy_deg      DOUBLE PRECISION,
    left_ankle_force_proxy_n        DOUBLE PRECISION,
    left_ankle_displacement_deg     DOUBLE PRECISION,
    left_ankle_risk_level           VARCHAR(20),

    -- Right ankle
    right_ankle_angle_proxy_deg     DOUBLE PRECISION,
    right_ankle_force_proxy_n       DOUBLE PRECISION,
    right_ankle_displacement_deg    DOUBLE PRECISION,
    right_ankle_risk_level          VARCHAR(20),

    -- Lower back
    lower_back_angle_proxy_deg      DOUBLE PRECISION,
    lower_back_displacement_deg     DOUBLE PRECISION,
    lower_back_risk_level           VARCHAR(20),

    -- Bilateral summary
    bilateral_symmetry_score        DOUBLE PRECISION,
    highest_risk_joint              VARCHAR(50),

    -- Quality / validation
    confidence                      DOUBLE PRECISION,
    validation_status               VARCHAR(30) NOT NULL DEFAULT 'experimental',

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for athlete longitudinal queries
CREATE INDEX idx_jkr_athlete_id       ON joint_kinematics_records (athlete_id);
CREATE INDEX idx_jkr_session_id       ON joint_kinematics_records (session_id);
CREATE INDEX idx_jkr_recorded_at      ON joint_kinematics_records (recorded_at DESC);
CREATE INDEX idx_jkr_athlete_time     ON joint_kinematics_records (athlete_id, recorded_at DESC);
