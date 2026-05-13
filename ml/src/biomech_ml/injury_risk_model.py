"""Experimental injury-risk contracts for proxy-based biomechanics outputs.

This module defines the injury-risk data structures consumed by the decision-
support layer. These values are experimental proxy estimates, not diagnoses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class InjuryRiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    ELEVATED = "elevated"
    HIGH = "high"
    CRITICAL = "critical"


def classify_risk_level(score: float) -> InjuryRiskLevel:
    if score < 0.20:
        return InjuryRiskLevel.LOW
    if score < 0.40:
        return InjuryRiskLevel.MODERATE
    if score < 0.60:
        return InjuryRiskLevel.ELEVATED
    if score < 0.80:
        return InjuryRiskLevel.HIGH
    return InjuryRiskLevel.CRITICAL


@dataclass
class ArticulationRiskScore:
    joint: str
    risk_score: float
    risk_level: InjuryRiskLevel
    confidence: float
    primary_driver: str
    validation_status: str = "experimental"


@dataclass
class InjuryRiskFactor:
    factor_id: str
    label: str
    value: float
    weight: float
    elevated: bool
    description: str


@dataclass
class InjuryRiskOutput:
    overall_risk_score: float
    overall_risk_level: InjuryRiskLevel
    articulation_risks: list[ArticulationRiskScore] = field(default_factory=list)
    risk_factors: list[InjuryRiskFactor] = field(default_factory=list)
    model_confidence: float = 0.0
    signal_quality_score: float = 0.0
    used_inferred_joint_angles: bool = False
    validation_status: str = "experimental"
    experimental: bool = True
    warnings: list[str] = field(default_factory=list)
