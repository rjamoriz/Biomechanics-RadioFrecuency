"""
Domain generalization strategies for cross-station/environment variation.

Implements MERIDIAN-inspired techniques to make CSI-based gait models
robust across different stations, room layouts, and hardware configurations.

Key components:
    - GradientReversalLayer: autograd function that reverses gradients
    - DomainAdversarialHead: domain classifier with gradient reversal
    - DomainInvariantTrainer: trains models with domain-adversarial regularization
    - FeatureAligner: statistics-based feature alignment (batch-norm adaptation)

All outputs are EXPERIMENTAL proxy estimates derived from Wi-Fi CSI sensing.
Confidence and validation state must be tracked externally.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.autograd import Function

logger = logging.getLogger(__name__)

VALIDATION_STATES = ("unvalidated", "experimental", "station_validated", "externally_validated")


# ── Gradient Reversal ───────────────────────────────────────────────── #


class _GradientReversalFn(Function):
    """Autograd function that reverses gradients during backward pass."""

    @staticmethod
    def forward(ctx: Any, x: torch.Tensor, lambda_: float) -> torch.Tensor:
        ctx.lambda_ = lambda_
        return x.clone()

    @staticmethod
    def backward(ctx: Any, grad_output: torch.Tensor) -> tuple[torch.Tensor, None]:
        return -ctx.lambda_ * grad_output, None


class GradientReversalLayer(nn.Module):
    """Module wrapper for gradient reversal.

    During forward pass, acts as identity. During backward pass, reverses
    and scales gradients by lambda_.

    Args:
        lambda_: gradient scaling factor (default 1.0)
    """

    def __init__(self, lambda_: float = 1.0) -> None:
        super().__init__()
        self.lambda_ = lambda_

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return _GradientReversalFn.apply(x, self.lambda_)

    def set_lambda(self, value: float) -> None:
        """Update the gradient reversal strength."""
        self.lambda_ = value


# ── Domain Adversarial Head ─────────────────────────────────────────── #


class DomainAdversarialHead(nn.Module):
    """Domain classifier with gradient reversal for domain-adversarial training.

    The gradient reversal ensures that the feature extractor learns
    domain-invariant representations while the domain classifier tries
    to distinguish domains.

    Args:
        feature_dim: dimension of input features
        num_domains: number of domains (stations/environments)
        lambda_: gradient reversal strength (default 1.0)
    """

    def __init__(
        self,
        feature_dim: int,
        num_domains: int,
        lambda_: float = 1.0,
    ) -> None:
        super().__init__()
        self.grl = GradientReversalLayer(lambda_)
        self.classifier = nn.Sequential(
            nn.Linear(feature_dim, feature_dim // 2),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(feature_dim // 2, num_domains),
        )
        self.num_domains = num_domains

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        """Classify domain from reversed-gradient features.

        Args:
            features: (B, feature_dim) feature vectors

        Returns:
            (B, num_domains) domain logits
        """
        reversed_features = self.grl(features)
        return self.classifier(reversed_features)

    def set_lambda(self, value: float) -> None:
        """Update gradient reversal strength."""
        self.grl.set_lambda(value)


# ── Domain-Invariant Trainer ───────────────────────────────────────── #


@dataclass
class TrainStepResult:
    """Result of a single training step."""

    total_loss: float
    main_loss: float
    domain_loss: float
    domain_accuracy: float
    validation_state: str = "experimental"


class DomainInvariantTrainer:
    """Train a model with domain-adversarial regularization.

    Combines a main task loss with a domain classification loss.
    The domain adversarial head uses gradient reversal to push the
    feature extractor toward domain-invariant representations.

    Args:
        main_model: feature extractor + task head
        domain_head: DomainAdversarialHead instance
        main_loss_fn: loss function for the main task
        domain_loss_weight: weight for domain classification loss
        feature_extractor: callable that extracts features from main_model
            given an input batch; if None, assumes main_model returns
            (logits, features) tuple
    """

    def __init__(
        self,
        main_model: nn.Module,
        domain_head: DomainAdversarialHead,
        main_loss_fn: Callable[..., torch.Tensor],
        domain_loss_weight: float = 0.1,
        feature_extractor: Callable[[nn.Module, torch.Tensor], torch.Tensor] | None = None,
    ) -> None:
        self.main_model = main_model
        self.domain_head = domain_head
        self.main_loss_fn = main_loss_fn
        self.domain_loss_weight = domain_loss_weight
        self.feature_extractor = feature_extractor
        self._domain_accuracies: list[float] = []

    @property
    def domain_accuracies(self) -> list[float]:
        return list(self._domain_accuracies)

    def train_step(
        self,
        batch: tuple[torch.Tensor, torch.Tensor],
        domain_labels: torch.Tensor,
    ) -> TrainStepResult:
        """Execute one training step with domain-adversarial regularization.

        Args:
            batch: (inputs, targets) for the main task
            domain_labels: (B,) integer domain labels

        Returns:
            TrainStepResult with loss components and domain accuracy.
        """
        inputs, targets = batch
        self.main_model.train()
        self.domain_head.train()

        # Get features and main output
        if self.feature_extractor is not None:
            features = self.feature_extractor(self.main_model, inputs)
            main_output = self.main_model(inputs)
        else:
            main_output, features = self.main_model(inputs)

        # Main task loss
        main_loss = self.main_loss_fn(main_output, targets)

        # Domain classification loss
        domain_logits = self.domain_head(features)
        domain_loss = F.cross_entropy(domain_logits, domain_labels)

        # Combined loss
        total_loss = main_loss + self.domain_loss_weight * domain_loss

        # Domain accuracy tracking
        with torch.no_grad():
            domain_preds = domain_logits.argmax(dim=-1)
            domain_acc = (domain_preds == domain_labels).float().mean().item()
            self._domain_accuracies.append(domain_acc)

        return TrainStepResult(
            total_loss=total_loss.item(),
            main_loss=main_loss.item(),
            domain_loss=domain_loss.item(),
            domain_accuracy=domain_acc,
        )


# ── Feature Aligner ────────────────────────────────────────────────── #


class FeatureAligner(nn.Module):
    """Statistics-based feature alignment for domain adaptation.

    Aligns target domain features to match source domain statistics
    (mean and variance) using running estimates, similar to batch-norm
    adaptation.

    Args:
        feature_dim: dimension of feature vectors
        momentum: momentum for running statistics update (default 0.1)
    """

    def __init__(self, feature_dim: int, momentum: float = 0.1) -> None:
        super().__init__()
        self.feature_dim = feature_dim
        self.momentum = momentum

        self.register_buffer("source_mean", torch.zeros(feature_dim))
        self.register_buffer("source_var", torch.ones(feature_dim))
        self.register_buffer("target_mean", torch.zeros(feature_dim))
        self.register_buffer("target_var", torch.ones(feature_dim))
        self.register_buffer("source_initialized", torch.tensor(False))
        self.register_buffer("target_initialized", torch.tensor(False))

    def update_source_stats(self, features: torch.Tensor) -> None:
        """Update running source statistics.

        Args:
            features: (B, feature_dim) source domain features
        """
        batch_mean = features.mean(dim=0)
        batch_var = features.var(dim=0, unbiased=False)

        if not self.source_initialized.item():
            self.source_mean.copy_(batch_mean)
            self.source_var.copy_(batch_var)
            self.source_initialized.fill_(True)
        else:
            self.source_mean.mul_(1 - self.momentum).add_(batch_mean * self.momentum)
            self.source_var.mul_(1 - self.momentum).add_(batch_var * self.momentum)

    def update_target_stats(self, features: torch.Tensor) -> None:
        """Update running target statistics.

        Args:
            features: (B, feature_dim) target domain features
        """
        batch_mean = features.mean(dim=0)
        batch_var = features.var(dim=0, unbiased=False)

        if not self.target_initialized.item():
            self.target_mean.copy_(batch_mean)
            self.target_var.copy_(batch_var)
            self.target_initialized.fill_(True)
        else:
            self.target_mean.mul_(1 - self.momentum).add_(batch_mean * self.momentum)
            self.target_var.mul_(1 - self.momentum).add_(batch_var * self.momentum)

    def align(
        self,
        source_features: torch.Tensor,
        target_features: torch.Tensor,
    ) -> torch.Tensor:
        """Align target features to match source domain statistics.

        Normalizes target features using target stats, then rescales
        to match source stats.

        Args:
            source_features: (B_s, feature_dim) — used to update source stats
            target_features: (B_t, feature_dim) — features to align

        Returns:
            (B_t, feature_dim) aligned target features
        """
        self.update_source_stats(source_features.detach())
        self.update_target_stats(target_features.detach())

        eps = 1e-6
        # Normalize target to zero mean, unit variance
        normalized = (target_features - self.target_mean) / (self.target_var.sqrt() + eps)
        # Rescale to source statistics
        aligned = normalized * (self.source_var.sqrt() + eps) + self.source_mean

        return aligned

    def forward(
        self,
        source_features: torch.Tensor,
        target_features: torch.Tensor,
    ) -> torch.Tensor:
        """Forward pass — alias for align()."""
        return self.align(source_features, target_features)
