# Treadmill Protocols

## What Is a Protocol?

A protocol is a predefined sequence of speed/incline stages for a treadmill session. It provides structured testing conditions for consistent biomechanics assessment.

## Example Protocols

### Warm-Up / Steady-State / Cool-Down
| Stage | Speed (km/h) | Incline (%) | Duration |
|-------|-------------|-------------|----------|
| Warm-up | 5.0 | 0 | 3 min |
| Steady state | 10.0 | 1 | 10 min |
| Cool-down | 5.0 | 0 | 3 min |

### Incremental Speed Test
| Stage | Speed (km/h) | Incline (%) | Duration |
|-------|-------------|-------------|----------|
| Baseline | 6.0 | 1 | 3 min |
| Stage 1 | 8.0 | 1 | 3 min |
| Stage 2 | 10.0 | 1 | 3 min |
| Stage 3 | 12.0 | 1 | 3 min |
| Stage 4 | 14.0 | 1 | 3 min |
| Recovery | 6.0 | 0 | 3 min |

### Fatigue Assessment
| Stage | Speed (km/h) | Incline (%) | Duration |
|-------|-------------|-------------|----------|
| Warm-up | 6.0 | 0 | 5 min |
| Sustained | 11.0 | 1 | 20 min |
| Cool-down | 5.0 | 0 | 5 min |

### Interval Training
| Stage | Speed (km/h) | Incline (%) | Duration |
|-------|-------------|-------------|----------|
| Warm-up | 6.0 | 0 | 3 min |
| Fast | 14.0 | 1 | 1 min |
| Recovery | 8.0 | 0 | 2 min |
| Fast | 14.0 | 1 | 1 min |
| Recovery | 8.0 | 0 | 2 min |
| Fast | 14.0 | 1 | 1 min |
| Cool-down | 5.0 | 0 | 3 min |

## Protocol Template Model

```typescript
interface ProtocolTemplate {
  id: string;
  name: string;
  description: string;
  sport: string;
  stages: ProtocolStageDefinition[];
}

interface ProtocolStageDefinition {
  stageNumber: number;
  label: string;
  targetSpeed: number;    // km/h
  targetIncline: number;  // percent
  durationSeconds: number;
}
```

## Usage

1. Create protocol templates in the admin UI
2. When starting a session, optionally select a protocol
3. The system tracks stage transitions and overlays them on metric charts
4. Stage-based summaries are generated in reports
