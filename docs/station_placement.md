# Station Placement Guide

## Placement Principles

The Wi-Fi CSI signal is sensitive to the spatial relationship between TX and RX nodes. Proper placement maximizes the body's effect on the signal path.

## Recommended Layout

```
        TX ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ RX
        │                        │
        │    ┌──────────────┐    │
        │    │   Treadmill   │    │
        │    │              │    │
        │    │   [Athlete]  │    │
        │    │              │    │
        │    └──────────────┘    │
        │                        │
```

- **TX** and **RX** should be on opposite sides of the treadmill belt
- The athlete's body should cross the line-of-sight (LoS) between TX and RX during running
- Height: approximately waist-to-chest level (80–120 cm from floor)
- Distance: 1.5–3.0 meters apart (through the treadmill zone)

## Placement Variables

| Variable | Recommendation | Effect |
|----------|---------------|--------|
| Height | 80–120 cm | Higher captures more torso/arm; lower captures more legs |
| Distance | 1.5–3.0 m | Closer = stronger signal; farther = more body coverage |
| Angle | Perpendicular to belt direction | Maximizes body cross-section in signal path |
| Mounting | Stable tripod or wall bracket | Prevents vibration artifacts |

## Avoid

- Placing both nodes on the same side of the treadmill
- Obstructing the path with metal objects or thick walls
- Placing near other active Wi-Fi equipment
- Mounting on vibrating surfaces
- Changing placement between calibration and sessions

## Environmental Considerations

- **Metal surfaces** cause strong reflections — position to minimize indirect paths
- **Other people** walking through the sensing zone will corrupt the signal
- **Gym equipment** movement nearby can introduce artifacts
- **Temperature/humidity** changes may cause slow drift in baseline

## Recalibration Triggers

Recalibrate the station when:
- Nodes have been moved (even slightly)
- Furniture or equipment near the station has changed
- A different treadmill is used
- Environmental conditions have significantly changed
- Signal quality score drops below threshold
