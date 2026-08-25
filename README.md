# A Context-Aware Recommendation System for Household Service Providers Using Ensemble Learning in Urban Environments

**Student:** Mbithi, Keith Austine (164003)
**Supervisor:** Dr. Deperias Kerre
**Institution:** Strathmore University — School of Computing and Engineering Sciences

A context-aware web platform that recommends household service providers
(electricians, plumbers, cleaners) in Nairobi based on a predicted **arrival
reliability score** — combining traffic congestion, road quality, time of
day, and provider history — rather than distance or rating alone.

## Repository structure

```
docs/           Proposal, defense materials, final report chapters, diagrams
data/           Raw datasets and the ML feature reference/data dictionary
notebooks/      Kaggle/Colab exploration notebooks (training history)
ml-service/     Production ML pipeline + FastAPI recommendation service
frontend/       Next.js client application
database/       PostgreSQL/PostGIS schema
tests/          Test suites for ml-service and frontend
```

## Status

- [x] Proposal approved and defended
- [x] Synthetic dataset built (`data/raw/`)
- [x] Model trained, tuned, and evaluated (`notebooks/training.ipynb`)
- [x] ML pipeline + `/predict` and `/recommend` API (`ml-service/`)
- [ ] Provider availability filtering
- [ ] PostgreSQL/PostGIS integration
- [ ] Next.js frontend
- [ ] Final documentation (Chapters 4–6)

## Quick start — ML service

```bash
cd ml-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 finalize_model.py       # regenerate the model from data/raw/
uvicorn api:app --reload --port 8000
```

Docs at `http://localhost:8000/docs`.

## Model performance (current)

| Model | RMSE | MAE |
|---|---|---|
| Baseline A — Distance only | 0.1872 | 0.1514 |
| Baseline B — Rating only | 0.1936 | 0.1585 |
| **Proposed — XGBoost (tuned)** | **0.1417** | **0.1160** |

5-fold CV RMSE: 0.1411 (± 0.0043). See `ml-service/results/` for full details.
