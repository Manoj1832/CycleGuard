#!/usr/bin/env python3
"""
CycleGuard Machine Learning — Inference Engine
Loads coach_model.pkl and performs fast inference for Security Coach recommendations.
Can be executed as CLI (printing JSON) or imported as a Python module.
"""

import os
import sys
import json
import joblib
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'coach_model.pkl')

_cached_model = None

def get_model():
    global _cached_model
    if _cached_model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}. Run train_coach_model.py first.")
        _cached_model = joblib.load(MODEL_PATH)
    return _cached_model

def predict(features: dict) -> dict:
    """
    Run prediction on feature dict:
    {
      "day_of_week": int (0..6),
      "hour": int (0..23),
      "minute": int (0..59),
      "is_in_class_window": int (0 or 1),
      "security_state": int (0=OFF, 1=ON, 2=ALARM),
      "parking_confirmed_today": int (0 or 1)
    }
    """
    pkg = get_model()
    clf = pkg['model']
    encoder = pkg['label_encoder']
    feature_cols = pkg['feature_cols']

    hour = int(features.get('hour', 0))
    minute = int(features.get('minute', 0))
    minute_of_day = hour * 60 + minute

    row = {
        'day_of_week': int(features.get('day_of_week', 0)),
        'hour': hour,
        'minute': minute,
        'minute_of_day': minute_of_day,
        'is_in_class_window': int(features.get('is_in_class_window', 0)),
        'security_state': int(features.get('security_state', 0)),
        'parking_confirmed_today': int(features.get('parking_confirmed_today', 0)),
    }

    df = pd.DataFrame([row])[feature_cols]
    probabilities = clf.predict_proba(df)[0]
    best_idx = probabilities.argmax()
    best_class = encoder.inverse_transform([best_idx])[0]
    confidence = float(probabilities[best_idx])

    # Class probabilities dictionary
    class_probs = {
        cls_name: float(prob)
        for cls_name, prob in zip(encoder.classes_, probabilities)
    }

    return {
        'prediction': best_class,
        'confidence': round(confidence, 4),
        'risk_score': round(float(class_probs.get('UNSECURED_ON_CAMPUS_RISK', 0.0)), 4),
        'class_probabilities': class_probs,
        'features': row,
        'engine': 'python-scikit-learn-rf',
        'modelVersion': pkg.get('version', '1.0.0'),
    }

if __name__ == '__main__':
    if len(sys.argv) > 1:
        try:
            input_json = json.loads(sys.argv[1])
            res = predict(input_json)
            print(json.dumps(res))
            sys.exit(0)
        except Exception as e:
            print(json.dumps({'error': str(e)}), file=sys.stderr)
            sys.exit(1)
    else:
        # Default test run
        test_features = {
            'day_of_week': 0,  # Monday
            'hour': 9,
            'minute': 15,
            'is_in_class_window': 1,
            'security_state': 0,  # OFF
            'parking_confirmed_today': 0,
        }
        res = predict(test_features)
        print(json.dumps(res, indent=2))
