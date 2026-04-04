"""Tests for proxy models — shape and forward pass."""

import torch
from biomech_ml.proxy_models import CadenceProxyModel, SymmetryProxyModel, ContactTimeProxyModel


def test_cadence_model_shape():
    model = CadenceProxyModel(num_subcarriers=64, window_size=50)
    x = torch.randn(4, 50, 64)
    out = model(x)
    assert out.shape == (4, 1)


def test_symmetry_model_shape():
    model = SymmetryProxyModel(num_subcarriers=64, window_size=50)
    x = torch.randn(4, 50, 64)
    out = model(x)
    assert out.shape == (4, 1)
    # Sigmoid output should be 0-1
    assert (out >= 0).all() and (out <= 1).all()


def test_contact_time_model_shape():
    model = ContactTimeProxyModel(num_subcarriers=64, window_size=50)
    x = torch.randn(4, 50, 64)
    out = model(x)
    assert out.shape == (4, 1)
    assert (out >= 0).all() and (out <= 1).all()
