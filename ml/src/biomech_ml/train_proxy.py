"""
Training script for proxy metric models.

Usage:
    python -m biomech_ml.train_proxy --model cadence --data <path> --epochs 50 --seed 42
"""

import argparse
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import numpy as np

from biomech_ml.proxy_models import CadenceProxyModel, SymmetryProxyModel, ContactTimeProxyModel


def create_synthetic_dataset(
    model_type: str,
    num_samples: int = 1000,
    window_size: int = 50,
    num_subcarriers: int = 64,
    seed: int = 42,
):
    """Create a synthetic dataset for development/testing.

    In production, replace with real labeled data loading.
    """
    rng = np.random.default_rng(seed)

    X = rng.normal(0, 1, (num_samples, window_size, num_subcarriers)).astype(np.float32)

    if model_type == "cadence":
        # Synthetic labels: cadence 150-210 SPM
        y = rng.uniform(150, 210, (num_samples, 1)).astype(np.float32)
    elif model_type == "symmetry":
        # Synthetic labels: 0-1
        y = rng.uniform(0.5, 1.0, (num_samples, 1)).astype(np.float32)
    elif model_type == "contact_time":
        # Synthetic labels: 0-1 ratio
        y = rng.uniform(0.2, 0.6, (num_samples, 1)).astype(np.float32)
    else:
        raise ValueError(f"Unknown model type: {model_type}")

    return torch.tensor(X), torch.tensor(y)


def train(model_type: str, epochs: int = 50, lr: float = 1e-3, seed: int = 42):
    torch.manual_seed(seed)

    X, y = create_synthetic_dataset(model_type, seed=seed)
    dataset = TensorDataset(X, y)
    loader = DataLoader(dataset, batch_size=32, shuffle=True)

    if model_type == "cadence":
        model = CadenceProxyModel()
        criterion = nn.MSELoss()
    elif model_type == "symmetry":
        model = SymmetryProxyModel(window_size=50)
        criterion = nn.MSELoss()
    elif model_type == "contact_time":
        model = ContactTimeProxyModel()
        criterion = nn.MSELoss()
    else:
        raise ValueError(f"Unknown model type: {model_type}")

    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    for epoch in range(epochs):
        total_loss = 0.0
        for batch_X, batch_y in loader:
            optimizer.zero_grad()
            pred = model(batch_X)
            loss = criterion(pred, batch_y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(loader)
        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"Epoch {epoch + 1}/{epochs} — Loss: {avg_loss:.4f}")

    # Save model
    save_path = f"storage/models/{model_type}_proxy.pt"
    torch.save(model.state_dict(), save_path)
    print(f"Model saved to {save_path}")

    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train proxy metric model")
    parser.add_argument("--model", choices=["cadence", "symmetry", "contact_time"], required=True)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    train(args.model, args.epochs, args.lr, args.seed)
