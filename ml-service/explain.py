"""
Model-based explanations for recommendation cards (#103).

The score comes from XGBoost, so the explanation should too. XGBoost can
split any single prediction into one contribution per input column
(`pred_contribs=True`, the TreeSHAP method). For this regression model the
parts add up exactly:

    score = base value + contribution(distance) + contribution(congestion)
            + contribution(time slot) + contribution(road) + contribution(completion)

The base value is the model's average prediction over the training data,
about 0.76, so each contribution says how much one factor moved this
provider's score above or below a typical booking. One-hot columns (the 5
time slots, the 3 road qualities) are summed back into their feature, so the
client sees the 5 features the model was designed around, not 11 columns.

Contributions are shown in reliability points: 0.061 is "+6.1 pts", the same
scale as the percentage on the card.
"""
import numpy as np
import xgboost as xgb

# Fragment of the encoded column name -> the factor it belongs to.
# Encoded names look like "num__distance_km" or "cat__time_slot_midday".
FACTOR_COLUMNS = {
    "distance": "distance_km",
    "congestion": "congestion_multiplier",
    "time_slot": "time_slot",
    "road": "provider_area_road_quality",
    "completion": "provider_completion_rate",
}

# Contributions are measured against a typical (average) booking, so the
# wording says "than average" rather than claiming an absolute judgement.
RAISES = {
    "distance": "shorter distance than average",
    "congestion": "lighter traffic than average on this route",
    "time_slot": "a quieter time of day than average",
    "road": "better roads than average around the provider's base",
    "completion": "above-average completion record",
}
LOWERS = {
    "distance": "longer distance than average",
    "congestion": "heavier traffic than average on this route",
    "time_slot": "a busier time of day than average",
    "road": "poorer roads than average around the provider's base",
    "completion": "below-average completion record",
}
COMPARED_ON = {
    "distance": "distance",
    "congestion": "traffic on their route",
    "time_slot": "time of day",
    "road": "road access",
    "completion": "completion record",
}

MAIN_FACTOR_MIN_PTS = 2.0   # smaller effects are left out of the sentence
BEHIND_MIN_PTS = 1.0
MAX_MAIN_FACTORS = 3
MAX_BEHIND_FACTORS = 2


def feature_contributions(pipe, X):
    """(per-row {factor: points}, base value in points) for a fitted
    preprocessor + XGBRegressor pipeline and a DataFrame of model features."""
    preprocessor, model = pipe[:-1], pipe[-1]
    encoded = preprocessor.transform(X)
    if hasattr(encoded, "toarray"):  # OneHotEncoder may return a sparse matrix
        encoded = encoded.toarray()
    columns = list(preprocessor.get_feature_names_out())

    contribs = model.get_booster().predict(
        xgb.DMatrix(np.asarray(encoded, dtype=float)), pred_contribs=True
    )
    # contribs has one column per encoded column, plus a last column for the base value.
    groups = {
        factor: [i for i, col in enumerate(columns) if fragment in col]
        for factor, fragment in FACTOR_COLUMNS.items()
    }
    rows = [
        {factor: round(float(row[idx].sum()) * 100, 1) for factor, idx in groups.items()}
        for row in contribs
    ]
    base_pts = round(float(contribs[0, -1]) * 100, 1) if len(contribs) else 0.0
    return rows, base_pts


def _pts(value):
    return f"{value:+.1f} pts"


def describe(factors, has_history=True, default_traffic=False):
    """The card sentence: the factors that moved this score most, plus honest
    notes where an input is an assumption rather than real data."""
    shown = {f: v for f, v in factors.items() if not (f == "completion" and not has_history)}
    main = sorted(
        (f for f, v in shown.items() if abs(v) >= MAIN_FACTOR_MIN_PTS),
        key=lambda f: abs(shown[f]),
        reverse=True,
    )[:MAX_MAIN_FACTORS]

    if main:
        parts = [(RAISES if shown[f] > 0 else LOWERS)[f] + f" ({_pts(shown[f])})" for f in main]
        sentences = ["Main factors vs a typical booking: " + ", ".join(parts)]
    else:
        sentences = ["Close to a typical booking on every factor"]

    if not has_history:
        sentences.append(
            "New provider with no job history yet (completion rate assumed at the platform median)"
        )
    if default_traffic:
        sentences.append(
            "No traffic data for this provider's area, so a fallback congestion figure was used"
        )
    return ". ".join(sentences)


def behind_top(factors, top_factors):
    """Why a provider ranks below #1: the factors where it lost the most
    points against #1. None if no factor differs by at least a point."""
    gaps = {f: round(factors[f] - top_factors[f], 1) for f in factors}
    worst = sorted((f for f, g in gaps.items() if g <= -BEHIND_MIN_PTS), key=lambda f: gaps[f])
    if not worst:
        return None
    parts = [f"{COMPARED_ON[f]} ({_pts(gaps[f])})" for f in worst[:MAX_BEHIND_FACTORS]]
    return "Behind #1 mainly on: " + ", ".join(parts)
