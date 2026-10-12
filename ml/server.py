#!/usr/bin/env python3
"""
CycleGuard Machine Learning — FastAPI Inference Microservice
Serves the Security Coach prediction endpoint at POST /predict.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn
from predict import predict

app = FastAPI(
    title="CycleGuard ML Security Coach API",
    description="Inference microservice for timetable-aware bicycle security recommendations.",
    version="1.0.0",
)

class CoachPredictionRequest(BaseModel):
    day_of_week: int
    hour: int
    minute: int
    is_in_class_window: int = 0
    security_state: int = 0
    parking_confirmed_today: int = 0

class CoachPredictionResponse(BaseModel):
    prediction: str
    confidence: float
    risk_score: float
    class_probabilities: dict
    features: dict
    engine: str
    modelVersion: str

@app.get("/")
def root():
    return {
        "service": "CycleGuard ML Security Coach API",
        "status": "online",
        "endpoints": {
            "health": "/health",
            "predict": "/predict",
            "interactive_docs": "/docs"
        }
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "cycleguard-ml"}

@app.post("/predict", response_model=CoachPredictionResponse)
def get_prediction(req: CoachPredictionRequest):
    try:
        result = predict(req.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    uvicorn.run(app, host="127.0.0.1", port=5001)
