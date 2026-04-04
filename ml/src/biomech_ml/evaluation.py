"""
Evaluation utilities — compare model predictions against reference data.
"""

import numpy as np
from dataclasses import dataclass


@dataclass
class EvaluationResult:
    """Evaluation metrics for a model comparison against reference data."""

    metric_name: str
    num_samples: int
    mae: float
    rmse: float
    mape: float
    correlation: float
    reference_source: str


def evaluate_against_reference(
    predictions: np.ndarray,
    reference: np.ndarray,
    metric_name: str,
    reference_source: str = "unknown",
) -> EvaluationResult:
    """Compute evaluation metrics comparing predictions to reference values.

    Args:
        predictions: Model predicted values, shape (N,)
        reference: Ground truth values from external source, shape (N,)
        metric_name: Name of the metric being evaluated
        reference_source: Source of reference data (e.g., "treadmill_console", "imu_csv")
    """
    assert len(predictions) == len(reference), "Prediction and reference arrays must match"

    errors = predictions - reference
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors**2)))

    # MAPE: guard against division by zero
    nonzero = reference != 0
    if nonzero.any():
        mape = float(np.mean(abs_errors[nonzero] / np.abs(reference[nonzero])) * 100)
    else:
        mape = float("inf")

    # Pearson correlation
    if np.std(predictions) > 0 and np.std(reference) > 0:
        correlation = float(np.corrcoef(predictions, reference)[0, 1])
    else:
        correlation = 0.0

    return EvaluationResult(
        metric_name=metric_name,
        num_samples=len(predictions),
        mae=mae,
        rmse=rmse,
        mape=mape,
        correlation=correlation,
        reference_source=reference_source,
    )


def print_evaluation(result: EvaluationResult):
    """Print a formatted evaluation summary."""
    print(f"\n{'=' * 50}")
    print(f"Evaluation: {result.metric_name}")
    print(f"Reference:  {result.reference_source}")
    print(f"Samples:    {result.num_samples}")
    print(f"{'=' * 50}")
    print(f"  MAE:         {result.mae:.4f}")
    print(f"  RMSE:        {result.rmse:.4f}")
    print(f"  MAPE:        {result.mape:.2f}%")
    print(f"  Correlation: {result.correlation:.4f}")
    print(f"{'=' * 50}\n")
