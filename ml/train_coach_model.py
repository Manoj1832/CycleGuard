#!/usr/bin/env python3
"""
CycleGuard Machine Learning — Security Coach Routine & Risk Model
Trains an explainable neural / tree ensemble model on user routine and timetable fixtures.
Saves model and label encoders to ml/models/coach_model.pkl.
"""

import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder

# Path resolution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
MOCK_DATA_DIR = os.path.join(PROJECT_DIR, 'mock-data')
MODELS_DIR = os.path.join(BASE_DIR, 'models')

os.makedirs(MODELS_DIR, exist_ok=True)

DAYS_MAP = {
    'Monday': 0,
    'Tuesday': 1,
    'Wednesday': 2,
    'Thursday': 3,
    'Friday': 4,
    'Saturday': 5,
    'Sunday': 6,
}

CLASSES = [
    'ALL_SAFE',
    'UNSECURED_ON_CAMPUS_RISK',
    'DEPARTURE_REMINDER',
    'RETURN_REMINDER',
]

def parse_time_to_minutes(time_str):
    try:
        parts = time_str.strip().split(':')
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0

def generate_synthetic_training_dataset():
    """
    Synthesize realistic feature combinations based on the mock timetable and routines
    to train a generalized routine classifier.
    """
    timetable_file = os.path.join(MOCK_DATA_DIR, 'timetable_schedule.csv')
    routine_file = os.path.join(MOCK_DATA_DIR, 'mock_user_routine.csv')

    timetable_df = pd.read_csv(timetable_file) if os.path.exists(timetable_file) else pd.DataFrame()
    routine_df = pd.read_csv(routine_file) if os.path.exists(routine_file) else pd.DataFrame()

    samples = []

    # Parse class windows: list of (day_idx, start_min, end_min, activity, location)
    class_windows = []
    if not timetable_df.empty:
        for _, row in timetable_df.iterrows():
            day_idx = DAYS_MAP.get(str(row['day_of_week']).strip(), 0)
            start_m = parse_time_to_minutes(str(row['start_time']))
            end_m = parse_time_to_minutes(str(row['end_time']))
            class_windows.append((day_idx, start_m, end_m, str(row['activity']), str(row['location'])))

    # Parse routine windows (departure around 08:00, return around 16:30)
    dep_time_m = 8 * 60  # 480
    ret_time_m = 16 * 60 + 30  # 990
    if not routine_df.empty:
        for _, row in routine_df.iterrows():
            key = str(row['routine_key']).strip()
            if 'leave' in key:
                dep_time_m = parse_time_to_minutes(str(row['usual_time']))
            elif 'return' in key:
                ret_time_m = parse_time_to_minutes(str(row['usual_time']))

    # Generate samples covering 7 days and 24 hours at 15-minute intervals
    for day in range(7):
        for minute_of_day in range(0, 24 * 60, 15):
            hour = minute_of_day // 60
            minute = minute_of_day % 60

            # Check if within a scheduled class window
            in_class = 0
            for c_day, c_start, c_end, _, _ in class_windows:
                if day == c_day and c_start <= minute_of_day <= c_end:
                    in_class = 1
                    break

            # Simulate 3 security states: 0=OFF (Disarmed), 1=ON (Armed), 2=ALARM
            # Simulate 2 parking confirmed states: 0=No, 1=Yes
            for sec_state in [0, 1, 2]:
                for park_confirmed in [0, 1]:
                    # Determine target label
                    label = 'ALL_SAFE'

                    if sec_state == 0 and in_class == 1:
                        # Bicycle is disarmed while user is in class on campus! High risk!
                        label = 'UNSECURED_ON_CAMPUS_RISK'
                    elif sec_state == 0 and abs(minute_of_day - dep_time_m) <= 30 and day < 5:
                        label = 'DEPARTURE_REMINDER'
                    elif sec_state == 0 and abs(minute_of_day - ret_time_m) <= 30 and day < 5:
                        label = 'RETURN_REMINDER'
                    elif sec_state == 0 and park_confirmed == 1:
                        label = 'UNSECURED_ON_CAMPUS_RISK'
                    else:
                        label = 'ALL_SAFE'

                    samples.append({
                        'day_of_week': day,
                        'hour': hour,
                        'minute': minute,
                        'minute_of_day': minute_of_day,
                        'is_in_class_window': in_class,
                        'security_state': sec_state,
                        'parking_confirmed_today': park_confirmed,
                        'label': label,
                    })

    df = pd.DataFrame(samples)
    return df

def train_and_save():
    print('[Train] Generating training dataset from mock timetable and routines...')
    df = generate_synthetic_training_dataset()
    print(f'[Train] Generated {len(df)} samples across all time and security dimensions.')

    feature_cols = [
        'day_of_week',
        'hour',
        'minute',
        'minute_of_day',
        'is_in_class_window',
        'security_state',
        'parking_confirmed_today',
    ]

    X = df[feature_cols]
    y = df['label']

    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)

    print(f'[Train] Training RandomForestClassifier on features: {feature_cols}...')
    clf = RandomForestClassifier(n_estimators=100, max_depth=12, random_state=42)
    clf.fit(X, y_encoded)

    model_path = os.path.join(MODELS_DIR, 'coach_model.pkl')
    payload = {
        'model': clf,
        'label_encoder': label_encoder,
        'feature_cols': feature_cols,
        'classes': list(label_encoder.classes_),
        'version': '1.0.0',
    }

    joblib.dump(payload, model_path)
    print(f'[Train] Model successfully saved to {model_path}')
    return model_path

if __name__ == '__main__':
    train_and_save()
