import sys
from pathlib import Path

# make ml-service importable as top-level modules (feature_engineering, api, ...)
ML_SERVICE_DIR = Path(__file__).resolve().parents[2] / "ml-service"
sys.path.insert(0, str(ML_SERVICE_DIR))
