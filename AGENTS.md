# AI Agent Configuration

This repository uses a specialized **biomechanics** agent for code generation and review.

## Agent: biomechanics

See [.github/agents/biomechanics.md](.github/agents/biomechanics.md) for the full agent definition.

### Purpose

The biomechanics agent understands the scientific constraints of Wi-Fi CSI sensing and enforces honest terminology, proper confidence handling, and clean architectural boundaries across all layers of the platform.

### Key Rules

1. **Wi-Fi sensing is not a camera** — never present outputs as optical footage
2. **Three output classes** — direct measurements, proxy metrics, inferred motion (never mix)
3. **Confidence is mandatory** — every estimate needs confidence + signal quality + validation status
4. **Validation states are explicit** — unvalidated / experimental / station_validated / externally_validated

### When to Use

The biomechanics agent should be used for all code in this repository. It will:
- Enforce scientifically honest naming
- Preserve architectural boundaries
- Ensure confidence and validation are present in DTOs and UI
- Prevent misleading labels in charts, APIs, and documentation
