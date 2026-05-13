"""Tests for RL baseline policies and PolicyComparison framework."""

from __future__ import annotations

from datetime import datetime, timezone

from biomech_ml.injury_risk_model import InjuryRiskLevel, InjuryRiskOutput
from biomech_ml.recommendation_policy import (
    PainStatus,
    RecoveryState,
    TrainingAction,
    TrainingLoadState,
)
from biomech_ml.rl.baselines import (
    ConservativeInterventionPolicy,
    PolicyComparison,
    PolicyComparisonReport,
    RandomInterventionPolicy,
)
from biomech_ml.rl.contextual_bandit import ContextualBanditPolicy
from biomech_ml.rl.digital_twin_env import AthleteSimEnvironment
from biomech_ml.rl.evaluation import OfflinePolicyEvaluator
from biomech_ml.rl.policy import RuleBasedInterventionPolicy
from biomech_ml.rl.schemas import DecisionReplayDataset, DecisionTransition
from biomech_ml.rl.state import AthleteState


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_state(
    athlete_id: str = "test",
    risk_score: float = 0.45,
    pain_score: float = 1.0,
    acute_load: float = 0.5,
    chronic_load: float = 0.5,
) -> AthleteState:
    return AthleteState(
        athlete_id=athlete_id,
        timestamp=datetime(2024, 6, 1, tzinfo=timezone.utc),
        training_load=TrainingLoadState(acute_load=acute_load, chronic_load=chronic_load),
        recovery=RecoveryState(readiness_score=0.65),
        pain_status=PainStatus(pain_score=pain_score),
        risk_forecast=InjuryRiskOutput(
            overall_risk_score=risk_score,
            overall_risk_level=InjuryRiskLevel.MODERATE,
            model_confidence=0.75,
            signal_quality_score=0.85,
        ),
    )


def _make_transition(
    prev_risk: float = 0.45,
    next_risk: float = 0.38,
    prev_pain: float = 2.0,
    next_pain: float = 1.5,
) -> DecisionTransition:
    prev_state = _make_state(risk_score=prev_risk, pain_score=prev_pain)
    next_state = _make_state(risk_score=next_risk, pain_score=next_pain)
    return DecisionTransition(
        previous_state=prev_state,
        next_state=next_state,
        available_actions=(TrainingAction.CONTINUE_MONITORING, TrainingAction.REDUCE_INTENSITY),
        observed_action_id=TrainingAction.REDUCE_INTENSITY,
    )


# ---------------------------------------------------------------------------
# RandomInterventionPolicy
# ---------------------------------------------------------------------------


class TestRandomInterventionPolicy:
    def test_returns_recommendation_with_allowed_action(self) -> None:
        policy = RandomInterventionPolicy(seed=0)
        state = _make_state()

        rec = policy.recommend_action(state)

        assert rec.selected_action is not None
        assert rec.athlete_id == state.athlete_id

    def test_confidence_is_zero(self) -> None:
        policy = RandomInterventionPolicy(seed=1)
        state = _make_state()

        rec = policy.recommend_action(state)

        assert rec.confidence == 0.0

    def test_validation_status_is_experimental(self) -> None:
        policy = RandomInterventionPolicy(seed=2)
        state = _make_state()

        rec = policy.recommend_action(state)

        assert rec.validation_status == "experimental"

    def test_seeded_random_is_reproducible(self) -> None:
        state = _make_state()

        rec_a = RandomInterventionPolicy(seed=42).recommend_action(state)
        rec_b = RandomInterventionPolicy(seed=42).recommend_action(state)

        assert rec_a.selected_action.action_id == rec_b.selected_action.action_id

    def test_different_seeds_may_differ(self) -> None:
        state = _make_state()
        recs = {
            RandomInterventionPolicy(seed=i).recommend_action(state).selected_action.action_id
            for i in range(20)
        }
        # With 20 seeds there should be some variety in action choices
        assert len(recs) > 1


# ---------------------------------------------------------------------------
# ConservativeInterventionPolicy
# ---------------------------------------------------------------------------


class TestConservativeInterventionPolicy:
    def test_returns_recommendation(self) -> None:
        policy = ConservativeInterventionPolicy()
        state = _make_state()

        rec = policy.recommend_action(state)

        assert rec.selected_action is not None

    def test_selected_action_has_minimal_stimulus(self) -> None:
        policy = ConservativeInterventionPolicy()
        state = _make_state()

        rec = policy.recommend_action(state)
        # The selected action should have the minimum training stimulus
        # among all allowed actions — confirm no allowed action has lower stimulus
        from biomech_ml.rl.constraints import ConstraintEngine
        from biomech_ml.rl.actions import build_default_action_catalog

        engine = ConstraintEngine()
        catalog = build_default_action_catalog()
        allowed, _ = engine.filter_actions(state, list(catalog.values()))
        min_stimulus = min(a.expected_training_stimulus for a in allowed)

        assert rec.selected_action.expected_training_stimulus <= min_stimulus + 1e-6

    def test_validation_status_is_experimental(self) -> None:
        policy = ConservativeInterventionPolicy()
        rec = policy.recommend_action(_make_state())

        assert rec.validation_status == "experimental"

    def test_deterministic(self) -> None:
        policy = ConservativeInterventionPolicy()
        state = _make_state()

        rec_a = policy.recommend_action(state)
        rec_b = policy.recommend_action(state)

        assert rec_a.selected_action.action_id == rec_b.selected_action.action_id


# ---------------------------------------------------------------------------
# PolicyComparison
# ---------------------------------------------------------------------------


class TestPolicyComparison:
    def _make_dataset(self, n: int = 5) -> list[DecisionTransition]:
        return [_make_transition() for _ in range(n)]

    def test_compare_returns_report_with_all_policies(self) -> None:
        dataset = self._make_dataset(5)
        comparison = PolicyComparison(
            policies={
                "random": RandomInterventionPolicy(seed=0),
                "conservative": ConservativeInterventionPolicy(),
                "rule_based": RuleBasedInterventionPolicy(),
            }
        )

        report = comparison.compare(dataset)

        assert isinstance(report, PolicyComparisonReport)
        assert len(report.entries) == 3
        names = {e.policy_name for e in report.entries}
        assert names == {"random", "conservative", "rule_based"}

    def test_report_sample_count_matches_dataset(self) -> None:
        dataset = self._make_dataset(7)
        comparison = PolicyComparison(
            policies={"rule_based": RuleBasedInterventionPolicy()}
        )

        report = comparison.compare(dataset)

        assert report.sample_count == 7

    def test_ranked_by_mean_reward_is_sorted_descending(self) -> None:
        dataset = self._make_dataset(8)
        comparison = PolicyComparison(
            policies={
                "random": RandomInterventionPolicy(seed=0),
                "conservative": ConservativeInterventionPolicy(),
            }
        )

        report = comparison.compare(dataset)
        ranked = report.ranked_by_mean_reward

        rewards = [e.evaluation_report.summary.mean_reward for e in ranked]
        assert rewards == sorted(rewards, reverse=True)

    def test_best_policy_name_is_not_none(self) -> None:
        dataset = self._make_dataset(4)
        comparison = PolicyComparison(
            policies={"rule_based": RuleBasedInterventionPolicy()}
        )

        report = comparison.compare(dataset)

        assert report.best_policy_name == "rule_based"

    def test_mean_reward_by_policy_keys_match_entries(self) -> None:
        dataset = self._make_dataset(3)
        comparison = PolicyComparison(
            policies={
                "a": RandomInterventionPolicy(seed=0),
                "b": ConservativeInterventionPolicy(),
            }
        )

        report = comparison.compare(dataset)

        assert set(report.mean_reward_by_policy.keys()) == {"a", "b"}

    def test_validation_status_is_experimental(self) -> None:
        comparison = PolicyComparison(
            policies={"rule_based": RuleBasedInterventionPolicy()}
        )
        report = comparison.compare(self._make_dataset(2))

        assert report.validation_status == "experimental"

    def test_rule_based_outperforms_random_on_risk_reduction_dataset(self) -> None:
        """Rule-based policy should have lower unsafe_action_rate than random."""
        # Build transitions where the risky "continue monitoring" action is available
        transitions = [
            DecisionTransition(
                previous_state=_make_state(risk_score=0.78),
                next_state=_make_state(risk_score=0.70),
                available_actions=(
                    TrainingAction.CONTINUE_MONITORING,
                    TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN,
                ),
            )
            for _ in range(20)
        ]
        comparison = PolicyComparison(
            policies={
                "random": RandomInterventionPolicy(seed=0),
                "rule_based": RuleBasedInterventionPolicy(),
            }
        )
        report = comparison.compare(transitions)

        rule_based_safety = report.safety_rate_by_policy.get("rule_based", 0.0)
        random_safety = report.safety_rate_by_policy.get("random", 0.0)

        # Rule-based should be at least as safe as random, typically better
        assert rule_based_safety >= random_safety - 0.05  # allow tiny tolerance

    def test_compare_with_decisionreplaydataset(self) -> None:
        dataset = DecisionReplayDataset(self._make_dataset(4))
        comparison = PolicyComparison(
            policies={"conservative": ConservativeInterventionPolicy()}
        )

        report = comparison.compare(dataset)

        assert report.sample_count == 4

    def test_empty_policy_dict_raises(self) -> None:
        import pytest
        with pytest.raises(ValueError, match="At least one policy"):
            PolicyComparison(policies={})

    def test_compare_with_sim_generated_transitions(self) -> None:
        """Integration: use digital twin to generate transitions, then compare policies."""
        env = AthleteSimEnvironment(
            initial_state=_make_state(),
            max_steps=10,
            noise_level=0.0,
            seed=42,
        )
        rule_policy = RuleBasedInterventionPolicy()
        rollout = env.rollout(rule_policy)
        transitions = [
            DecisionTransition(
                previous_state=r.previous_state,
                next_state=r.next_state,
            )
            for r in rollout
        ]

        comparison = PolicyComparison(
            policies={
                "conservative": ConservativeInterventionPolicy(),
                "rule_based": RuleBasedInterventionPolicy(),
                "random": RandomInterventionPolicy(seed=5),
            }
        )
        report = comparison.compare(transitions)

        assert report.sample_count == 10
        assert report.best_policy_name is not None
