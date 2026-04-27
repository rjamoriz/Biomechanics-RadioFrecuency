"""
Biomech ML Inference Server
============================
FastAPI server that wraps trained proxy metric and pose inference models.

The gateway calls this service in production mode when the
``INFERENCE_SERVICE_URL`` environment variable is set.

Run with::

    uvicorn biomech_ml.inference_server:app --host 0.0.0.0 --port 8000

Or via the project script::

    python -m biomech_ml.inference_server
"""

import logging
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from biomech_ml.inference_adapter import ProxyInferenceAdapter
from biomech_ml.pose_inference import MockPoseModel

logger = logging.getLogger(__name__)

proxy_adapter = ProxyInferenceAdapter()
pose_model = MockPoseModel()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001
    proxy_adapter.load()
    loaded = list(proxy_adapter._versions.keys())
    logger.info("Proxy models loaded: %s", loaded if loaded else "none (no .pt files found)")
    yield


app = FastAPI(
    title="Biomech ML Inference Server",
    version="0.1.0",
    description=(
        "Internal inference service for the treadmill biomechanics platform. "
        "All outputs are proxy estimates or synthetic inferred models — "
        "not clinical measurements."
    ),
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class ProxyInferRequest(BaseModel):
    amplitude_window: list[list[float]] = Field(
        description="2-D amplitude window, shape (window_size, num_subcarriers)"
    )


class ProxyInferResponse(BaseModel):
    estimated_cadence_spm: float
    symmetry_proxy: float
    contact_time_proxy: float
    model_versions: dict[str, str]
    confidence: float
    experimental: bool = True
    validation_status: str = "experimental"


class PoseInferRequest(BaseModel):
    amplitude_window: list[list[float]] = Field(
        description="2-D amplitude window, shape (window_size, num_subcarriers)"
    )
    timestamp: int = Field(description="Unix timestamp in milliseconds")


class Keypoint2DOut(BaseModel):
    name: str
    x: float
    y: float
    confidence: float


class PoseInferResponse(BaseModel):
    timestamp: int
    keypoints: list[Keypoint2DOut]
    model_version: str
    confidence: float
    signal_quality: float
    experimental: bool = True
    validation_status: str = "experimental"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health", summary="Health check")
def health() -> dict:
    return {
        "status": "ok",
        "modelsLoaded": list(proxy_adapter._versions.keys()),
    }


@app.post(
    "/infer/proxy",
    response_model=ProxyInferResponse,
    summary="Proxy metric inference",
    description=(
        "Estimate cadence, symmetry proxy, and contact-time proxy from a "
        "CSI amplitude window. Outputs are estimated proxy metrics — not "
        "direct biomechanical measurements."
    ),
)
def infer_proxy(req: ProxyInferRequest) -> ProxyInferResponse:
    try:
        window = np.array(req.amplitude_window, dtype=np.float32)
        result = proxy_adapter.infer(window)
        return ProxyInferResponse(
            estimated_cadence_spm=result.estimated_cadence_spm,
            symmetry_proxy=result.symmetry_proxy,
            contact_time_proxy=result.contact_time_proxy,
            model_versions=result.model_versions,
            confidence=result.confidence,
        )
    except Exception as exc:
        logger.error("Proxy inference failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post(
    "/infer/pose",
    response_model=PoseInferResponse,
    summary="Inferred pose (synthetic)",
    description=(
        "Infer 2D keypoint positions from a CSI amplitude window. "
        "**This is a SYNTHETIC inferred model — not a camera or motion capture view.** "
        "All outputs are experimental and require external validation."
    ),
)
def infer_pose(req: PoseInferRequest) -> PoseInferResponse:
    try:
        window = np.array(req.amplitude_window, dtype=np.float32)
        frame = pose_model.infer(window, req.timestamp)
        return PoseInferResponse(
            timestamp=frame.timestamp,
            keypoints=[
                Keypoint2DOut(
                    name=kp.name,
                    x=kp.x,
                    y=kp.y,
                    confidence=kp.confidence,
                )
                for kp in frame.keypoints
            ],
            model_version=frame.model_version,
            confidence=frame.confidence,
            signal_quality=frame.signal_quality,
        )
    except Exception as exc:
        logger.error("Pose inference failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("biomech_ml.inference_server:app", host="0.0.0.0", port=8000, reload=False)
