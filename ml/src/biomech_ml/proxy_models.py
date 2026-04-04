"""
Proxy metric models — lightweight models for cadence, symmetry, and contact-time estimation.

These models operate on feature vectors extracted from CSI amplitude windows.
"""

import torch
import torch.nn as nn


class CadenceProxyModel(nn.Module):
    """Simple 1D-CNN + FC model for cadence (SPM) estimation from CSI amplitude windows.

    Input: (batch, window_size, num_subcarriers)
    Output: (batch, 1) — estimated cadence in SPM
    """

    def __init__(self, num_subcarriers: int = 64, window_size: int = 50):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(num_subcarriers, 32, kernel_size=5, padding=2),
            nn.ReLU(),
            nn.Conv1d(32, 64, kernel_size=5, padding=2),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.fc = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, window_size, subcarriers) -> transpose to (batch, subcarriers, window_size)
        x = x.transpose(1, 2)
        x = self.conv(x).squeeze(-1)
        return self.fc(x)


class SymmetryProxyModel(nn.Module):
    """Model for step symmetry proxy estimation.

    Input: (batch, window_size, num_subcarriers)
    Output: (batch, 1) — symmetry proxy 0-1 (1 = perfectly symmetric)
    """

    def __init__(self, num_subcarriers: int = 64, window_size: int = 100):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(num_subcarriers, 32, kernel_size=7, padding=3),
            nn.ReLU(),
            nn.Conv1d(32, 32, kernel_size=7, padding=3),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.fc = nn.Sequential(
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.transpose(1, 2)
        x = self.conv(x).squeeze(-1)
        return self.fc(x)


class ContactTimeProxyModel(nn.Module):
    """Model for ground contact-time proxy estimation.

    Input: (batch, window_size, num_subcarriers)
    Output: (batch, 1) — contact-time proxy ratio (0-1)
    """

    def __init__(self, num_subcarriers: int = 64, window_size: int = 50):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(num_subcarriers, 32, kernel_size=5, padding=2),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.fc = nn.Sequential(
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.transpose(1, 2)
        x = self.conv(x).squeeze(-1)
        return self.fc(x)
