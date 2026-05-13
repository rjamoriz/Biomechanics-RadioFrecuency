"""Minimal RL/decision-support package for safe athlete recommendations."""

from .actions import ActionCategory, TrainingActionDefinition, build_default_action_catalog
from .constraints import (
    BlockedAction,
    ConstraintEngine,
    ConstraintViolation,
    HighPainConstraint,
    HighRiskSessionConstraint,
    LowDataQualityConstraint,
    ManualRestrictionConstraint,
    SafetyConstraint,
    default_safety_constraints,
)
from .contextual_bandit import BanditArmStats, ContextualBanditPolicy
from .evaluation import (
    OfflineDecisionResult,
    OfflineDecisionSample,
    OfflineEvaluationReport,
    OfflineEvaluationSummary,
    OfflinePolicyEvaluator,
)
from .logging import (
    AthleteStateAuditSnapshot,
    BlockedActionAudit,
    ObservedDecisionOutcome,
    RecommendationAuditLogger,
    RecommendationAuditRecord,
)
from .baselines import (
    ConservativeInterventionPolicy,
    PolicyComparison,
    PolicyComparisonEntry,
    PolicyComparisonReport,
    RandomInterventionPolicy,
)
from .digital_twin_env import (
    AthleteAdaptationModel,
    AthleteSimEnvironment,
    SimStepResult,
)
from .offline_rl import (
    ActionOutcomeStats,
    FrequencyBasedPolicy,
    OfflineRLTrainer,
    OfflineTrainingResult,
    StateContext,
    classify_state,
)
from .policy import InterventionPolicy, PolicyRecommendation, RuleBasedInterventionPolicy
from .rewards import RewardBreakdown, RewardFunction, ShortHorizonRewardFunction
from .schemas import DecisionReplayDataset, DecisionTransition
from .state import AthleteState
from .storage import ContextualBanditSnapshotStore, RecommendationAuditLogStore
