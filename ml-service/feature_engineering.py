"""
feature_engineering.py
Computes model-ready features for a NEW booking request at prediction time,
using the same logic that produced the historical_bookings.csv columns your
model was trained on. Column names here match your actual dataset exactly.

Corridor + congestion are looked up via traffic_patterns.served_areas
(area membership), matching how the real dataset was built -- not derived
from raw lat/lng.
"""
import math
import pandas as pd


from datetime import datetime
from pathlib import Path


def load_reference_data(data_dir=None):
    if data_dir is None:
        base = Path(__file__).resolve().parent
        candidates = [base.parent / "data" / "raw", base / "data" / "raw", Path("data/raw"), Path("../data/raw"), Path(".")]
        for c in candidates:
            if (c / "nairobi_areas.csv").exists():
                data_dir = str(c)
                break
        if data_dir is None:
            data_dir = "."

    areas = pd.read_csv(f"{data_dir}/nairobi_areas.csv")
    traffic = pd.read_csv(f"{data_dir}/traffic_patterns.csv")
    providers = pd.read_csv(f"{data_dir}/service_providers.csv")
    availability = pd.read_csv(f"{data_dir}/provider_availability.csv")

    # explode "A11|A12|A27" into one row per area_id for fast lookup
    traffic = traffic.assign(area_id=traffic["served_areas"].str.split("|")).explode("area_id")

    return {"areas": areas, "traffic": traffic, "providers": providers, "availability": availability}


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def lookup_area(area_name, areas_df):
    target = str(area_name).strip().lower()
    row = areas_df.loc[areas_df.area_name.astype(str).str.strip().str.lower() == target]
    if row.empty:
        # Fallback to substring match or first area if not found
        sub = areas_df.loc[areas_df.area_name.astype(str).str.strip().str.lower().str.contains(target)]
        if not sub.empty:
            return sub.iloc[0]
        if not areas_df.empty:
            return areas_df.iloc[0]
        raise ValueError(f"Unknown Nairobi area: {area_name}")
    return row.iloc[0]


def lookup_traffic(provider_area_id, time_slot, day_type, traffic_df):
    slot = str(time_slot).strip().lower()
    dtype = str(day_type).strip().lower()

    if slot in ["weekend_day", "weekend"]:
        slot = "midday"
        dtype = "weekend"

    match = traffic_df[
        (traffic_df.area_id == provider_area_id)
        & (traffic_df.time_slot.str.lower() == slot)
        & (traffic_df.day_type.str.lower() == dtype)
    ]
    if match.empty:
        match = traffic_df[
            (traffic_df.time_slot.str.lower() == slot)
            & (traffic_df.day_type.str.lower() == dtype)
        ]
    if match.empty:
        match = traffic_df[
            (traffic_df.area_id == provider_area_id)
            & (traffic_df.day_type.str.lower() == dtype)
        ]
    if match.empty:
        match = traffic_df[traffic_df.day_type.str.lower() == dtype]
    if match.empty:
        match = traffic_df
    row = match.iloc[0]
    return row["corridor_name"], float(row["congestion_multiplier"]), float(row["avg_speed_kmh"])


def build_feature_row(client_area, provider_row, time_slot, day_type, ref):
    """Builds the 5 model features for one client-provider-time combination."""
    areas = ref["areas"]

    client_row = lookup_area(client_area, areas)
    prov_area_row = lookup_area(provider_row["base_area_name"], areas)

    # Use provider's actual GPS coordinates if available, falling back to base area centroid
    prov_lat = provider_row["lat"] if ("lat" in provider_row and pd.notna(provider_row["lat"])) else prov_area_row.lat
    prov_lng = provider_row["lng"] if ("lng" in provider_row and pd.notna(provider_row["lng"])) else prov_area_row.lng

    calc_dist = haversine_km(float(client_row.lat), float(client_row.lng), float(prov_lat), float(prov_lng))

    # Avoid 0.0 km: realistic minimum intra-area travel distance is ~0.8 km
    distance_km = round(max(float(calc_dist), 0.8), 2)

    corridor, congestion_multiplier, avg_speed_kmh = lookup_traffic(
        prov_area_row.area_id, time_slot, day_type, ref["traffic"]
    )

    # Avoid 0.0 min ETA: realistic minimum travel/dispatch time in urban traffic is ~4.0 min
    raw_travel_min = (distance_km / max(avg_speed_kmh, 1)) * 60
    estimated_travel_min = round(max(float(raw_travel_min), 4.0), 1)

    return {
        # --- the 5 features the model actually consumes ---
        "distance_km": distance_km,
        "congestion_multiplier": congestion_multiplier,
        "time_slot": time_slot,
        "provider_area_road_quality": prov_area_row.road_quality,
        "provider_completion_rate": provider_row["completion_rate"],
        # --- extra context, for display/explanation only, not fed to the model ---
        "primary_corridor": corridor,
        "avg_speed_kmh": avg_speed_kmh,
        "estimated_travel_min": estimated_travel_min,
        "client_area_road_quality": client_row.road_quality,
    }


MODEL_FEATURES = ["distance_km", "congestion_multiplier", "time_slot",
                   "provider_area_road_quality", "provider_completion_rate"]


TIME_SLOT_RANGES = {
    "morning_rush": ("07:00", "09:00"),
    "midday": ("11:00", "14:00"),
    "evening_rush": ("16:00", "19:00"),
    "night": ("21:00", "05:00"),
    "weekend_day": ("09:00", "18:00"),
}

WEEKDAYS = {"monday", "tuesday", "wednesday", "thursday", "friday"}
WEEKENDS = {"saturday", "sunday"}


def is_provider_available(provider_id, day_type, time_slot, availability_df):
    """
    Checks whether a given provider has an availability record covering the requested day_type and time_slot.

    Availability Policy for Missing Records:
    Providers with no availability record in availability_df are treated as EXCLUDED (returns False)
    by default, ensuring unverified or unscheduled providers are not dispatched.

    Parameters:
        provider_id: ID of the service provider (e.g. 'P0001').
        day_type: 'weekday', 'weekend', or a specific day name ('Monday', 'Tuesday', etc.).
        time_slot: Time slot string ('morning_rush', 'midday', etc.).
        availability_df: DataFrame containing provider availability records.

    Returns:
        bool: True if the provider is scheduled and available for the requested day and time slot, False otherwise.
    """
    if availability_df is None or (isinstance(availability_df, pd.DataFrame) and availability_df.empty):
        return False

    prov_records = availability_df.loc[availability_df["provider_id"].astype(str) == str(provider_id)]
    if prov_records.empty:
        return False

    if "is_available" in prov_records.columns:
        is_avail_mask = prov_records["is_available"].astype(str).str.lower().isin(["true", "1"])
        prov_records = prov_records.loc[is_avail_mask]
        if prov_records.empty:
            return False

    dtype = str(day_type).strip().lower()
    if dtype == "weekday":
        target_days = WEEKDAYS
    elif dtype == "weekend":
        target_days = WEEKENDS
    elif dtype in WEEKDAYS or dtype in WEEKENDS:
        target_days = {dtype}
    else:
        target_days = WEEKDAYS

    day_matches = prov_records.loc[
        prov_records["day_of_week"].astype(str).str.strip().str.lower().isin(target_days)
    ]
    if day_matches.empty:
        return False

    slot = str(time_slot).strip().lower()
    if slot == "weekend":
        slot = "weekend_day"

    if slot not in TIME_SLOT_RANGES:
        return True

    slot_start = datetime.strptime(TIME_SLOT_RANGES[slot][0], "%H:%M").time()
    slot_end = datetime.strptime(TIME_SLOT_RANGES[slot][1], "%H:%M").time()

    for _, row in day_matches.iterrows():
        start_time = datetime.strptime(str(row["start_time"]).strip(), "%H:%M").time()
        end_time = datetime.strptime(str(row["end_time"]).strip(), "%H:%M").time()

        if slot_start < slot_end:
            if start_time < slot_end and end_time > slot_start:
                return True
        else:
            if start_time < slot_end or end_time > slot_start:
                return True

    return False
