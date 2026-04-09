"""
Tests for domain generalization — gradient reversal, domain-adversarial training,
and feature alignment.
"""

import pytest
import torch
import torch.nn as nn

from biomech_ml.domain_generalization import (
    GradientReversalLayer,
    DomainAdversarialHead,
    DomainInvariantTrainer,
    FeatureAligner,
    TrainStepResult,
    VALIDATION_STATES,
)


# ── Fixtures ────────────────────────────────────────────────────────── #


@pytest.fixture
def feature_dim():
    return 32


@pytest.fixture
def num_domains():
    return 3


@pytest.fixture
def grl():
    return GradientReversalLayer(lambda_=1.0)


@pytest.fixture
def domain_head(feature_dim, num_domains):
    return DomainAdversarialHead(feature_dim, num_domains)


@pytest.fixture
def simple_model(feature_dim):
    """Simple model that returns (logits, features)."""
    class _Model(nn.Module):
        def __init__(self, fdim: int, n_classes: int) -> None:
            super().__init__()
            self.fc = nn.Linear(fdim, n_classes)

        def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            return self.fc(x), x  # logits, features
    return _Model(feature_dim, 5)


@pytest.fixture
def feature_aligner(feature_dim):
    return FeatureAligner(feature_dim)


@pytest.fixture
def batch_features(feature_dim):
    torch.manual_seed(42)
    return torch.randn(16, feature_dim)


# ── Gradient Reversal Layer ──────────────────────────────────────────── #


class TestGradientReversalLayer:
    def test_forward_is_identity(self, grl):
        x = torch.randn(4, 8)
        out = grl(x)
        assert torch.allclose(out, x)

    def test_reverses_gradients(self):
        grl = GradientReversalLayer(lambda_=1.0)
        x = torch.randn(4, 8, requires_grad=True)
        out = grl(x)
        loss = out.sum()
        loss.backward()
        # Gradient should be -1 for each element (reversed from +1)
        expected = -torch.ones_like(x)
        assert torch.allclose(x.grad, expected)

    def test_gradient_scaling(self):
        grl = GradientReversalLayer(lambda_=0.5)
        x = torch.randn(4, 8, requires_grad=True)
        out = grl(x)
        loss = out.sum()
        loss.backward()
        expected = -0.5 * torch.ones_like(x)
        assert torch.allclose(x.grad, expected)

    def test_set_lambda(self, grl):
        grl.set_lambda(2.0)
        assert grl.lambda_ == 2.0

    def test_zero_lambda_no_reversal(self):
        grl = GradientReversalLayer(lambda_=0.0)
        x = torch.randn(4, 8, requires_grad=True)
        out = grl(x)
        loss = out.sum()
        loss.backward()
        expected = torch.zeros_like(x)
        assert torch.allclose(x.grad, expected)


# ── Domain Adversarial Head ──────────────────────────────────────────── #


class TestDomainAdversarialHead:
    def test_output_shape(self, domain_head, feature_dim, num_domains):
        features = torch.randn(8, feature_dim)
        logits = domain_head(features)
        assert logits.shape == (8, num_domains)

    def test_classifies_domains(self, domain_head, feature_dim, num_domains):
        features = torch.randn(8, feature_dim)
        logits = domain_head(features)
        preds = logits.argmax(dim=-1)
        assert preds.shape == (8,)
        assert (preds >= 0).all() and (preds < num_domains).all()

    def test_set_lambda_propagates(self, domain_head):
        domain_head.set_lambda(0.3)
        assert domain_head.grl.lambda_ == 0.3

    def test_gradient_flows(self, domain_head, feature_dim):
        features = torch.randn(8, feature_dim, requires_grad=True)
        logits = domain_head(features)
        loss = logits.sum()
        loss.backward()
        assert features.grad is not None


# ── Domain-Invariant Trainer ─────────────────────────────────────────── #


class TestDomainInvariantTrainer:
    def test_train_step_returns_result(self, simple_model, domain_head, feature_dim):
        trainer = DomainInvariantTrainer(
            main_model=simple_model,
            domain_head=domain_head,
            main_loss_fn=nn.CrossEntropyLoss(),
            domain_loss_weight=0.1,
        )
        inputs = torch.randn(8, feature_dim)
        targets = torch.randint(0, 5, (8,))
        domain_labels = torch.randint(0, 3, (8,))

        result = trainer.train_step((inputs, targets), domain_labels)
        assert isinstance(result, TrainStepResult)
        assert result.total_loss > 0
        assert result.main_loss > 0
        assert result.domain_loss > 0
        assert 0.0 <= result.domain_accuracy <= 1.0

    def test_domain_accuracy_tracked(self, simple_model, domain_head, feature_dim):
        trainer = DomainInvariantTrainer(
            main_model=simple_model,
            domain_head=domain_head,
            main_loss_fn=nn.CrossEntropyLoss(),
        )
        inputs = torch.randn(8, feature_dim)
        targets = torch.randint(0, 5, (8,))
        domain_labels = torch.randint(0, 3, (8,))

        trainer.train_step((inputs, targets), domain_labels)
        trainer.train_step((inputs, targets), domain_labels)
        assert len(trainer.domain_accuracies) == 2

    def test_custom_feature_extractor(self, domain_head, feature_dim):
        class _SimpleModel(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.fc = nn.Linear(feature_dim, 5)

            def forward(self, x: torch.Tensor) -> torch.Tensor:
                return self.fc(x)

        model = _SimpleModel()

        def extract(m: nn.Module, x: torch.Tensor) -> torch.Tensor:
            return x  # features = input itself

        trainer = DomainInvariantTrainer(
            main_model=model,
            domain_head=domain_head,
            main_loss_fn=nn.CrossEntropyLoss(),
            feature_extractor=extract,
        )
        inputs = torch.randn(8, feature_dim)
        targets = torch.randint(0, 5, (8,))
        domain_labels = torch.randint(0, 3, (8,))

        result = trainer.train_step((inputs, targets), domain_labels)
        assert result.total_loss > 0

    def test_domain_loss_weight_effect(self, simple_model, feature_dim, num_domains):
        torch.manual_seed(42)
        inputs = torch.randn(8, feature_dim)
        targets = torch.randint(0, 5, (8,))
        domain_labels = torch.randint(0, num_domains, (8,))

        head_low = DomainAdversarialHead(feature_dim, num_domains)
        head_high = DomainAdversarialHead(feature_dim, num_domains)
        # Copy weights so domain loss is the same
        head_high.load_state_dict(head_low.state_dict())

        trainer_low = DomainInvariantTrainer(
            simple_model, head_low, nn.CrossEntropyLoss(), domain_loss_weight=0.01,
        )
        trainer_high = DomainInvariantTrainer(
            simple_model, head_high, nn.CrossEntropyLoss(), domain_loss_weight=10.0,
        )

        r_low = trainer_low.train_step((inputs, targets), domain_labels)
        r_high = trainer_high.train_step((inputs, targets), domain_labels)
        # Higher weight → higher total loss
        assert r_high.total_loss > r_low.total_loss


# ── Feature Aligner ──────────────────────────────────────────────────── #


class TestFeatureAligner:
    def test_align_output_shape(self, feature_aligner, feature_dim):
        source = torch.randn(16, feature_dim)
        target = torch.randn(8, feature_dim)
        aligned = feature_aligner.align(source, target)
        assert aligned.shape == (8, feature_dim)

    def test_align_matches_source_stats(self, feature_aligner, feature_dim):
        torch.manual_seed(42)
        source = torch.randn(256, feature_dim) * 2 + 5  # mean~5, std~2
        target = torch.randn(256, feature_dim) * 0.5 - 3  # mean~-3, std~0.5

        aligned = feature_aligner.align(source, target)
        # After alignment, target stats should be closer to source stats
        src_mean = source.mean(dim=0)
        aligned_mean = aligned.mean(dim=0)
        target_mean = target.mean(dim=0)

        dist_before = (target_mean - src_mean).abs().mean().item()
        dist_after = (aligned_mean - src_mean).abs().mean().item()
        assert dist_after < dist_before

    def test_forward_is_alias_for_align(self, feature_aligner, feature_dim):
        source = torch.randn(8, feature_dim)
        target = torch.randn(4, feature_dim)
        a1 = feature_aligner.align(source, target)
        # Reset stats for fair comparison
        fa2 = FeatureAligner(feature_dim)
        a2 = fa2.forward(source, target)
        assert torch.allclose(a1, a2)

    def test_running_stats_update(self, feature_aligner, feature_dim):
        source = torch.randn(16, feature_dim) + 10
        target = torch.randn(16, feature_dim) - 10
        feature_aligner.align(source, target)
        assert feature_aligner.source_initialized.item() is True
        assert feature_aligner.target_initialized.item() is True
        # Source mean should be near 10
        assert feature_aligner.source_mean.mean().item() > 5

    def test_identity_alignment(self, feature_dim):
        """If source and target have same distribution, alignment is ~identity."""
        torch.manual_seed(42)
        aligner = FeatureAligner(feature_dim)
        data = torch.randn(128, feature_dim)
        aligned = aligner.align(data, data.clone())
        # Should be close to original
        assert torch.allclose(aligned, data, atol=0.5)
