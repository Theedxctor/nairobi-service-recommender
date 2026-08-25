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


def load_reference_data(data_dir="."):
    areas = pd.read_csv(f"{data_dir}/nairobi_areas.csv")
    traffic = pd.read_csv(f"{data_dir}/traffic_patterns.csv")
    providers = pd.read_csv(f"{data_dir}/service_providers.csv")

    # explode "A11|A12|A27" into one row per area_id for fast lookup
    traffic = traffic.assign(area_id=traffic["served_areas"].str.split("|")).explode("area_id")

    return {"areas": areas, "traffic": traffic, "providers": providers}


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def lookup_area(area_name, areas_df):
    row = areas_df.loc[areas_df.area_name == area_name]
    if row.empty:
        raise ValueError(f"Unknown Nairobi area: {area_name}")
    return row.iloc[0]


def lookup_traffic(provider_area_id, time_slot, day_type, traffic_df):
    match = traffic_df[
        (traffic_df.area_id == provider_area_id)
        & (traffic_df.time_slot == time_slot)
        & (traffic_df.day_type == day_type)
    ]
    if match.empty:
        match = traffic_df[(traffic_df.time_slot == time_slot) & (traffic_df.day_type == day_type)]
    if match.empty:
        raise ValueError(f"No traffic pattern found for time_slot={time_slot}, day_type={day_type}")
    row = match.iloc[0]
    return row["corridor_name"], row["congestion_multiplier"], row["avg_speed_kmh"]


def build_feature_row(client_area, provider_row, time_slot, day_type, ref):
    """Builds the 5 model features for one client-provider-time combination."""
    areas = ref["areas"]

    client_row = lookup_area(client_area, areas)
    prov_area_row = lookup_area(provider_row["base_area_name"], areas)

    distance_km = round(
        haversine_km(client_row.lat, client_row.lng, prov_area_row.lat, prov_area_row.lng), 2
    )

    corridor, congestion_multiplier, avg_speed_kmh = lookup_traffic(
        prov_area_row.area_id, time_slot, day_type, ref["traffic"]
    )

    estimated_travel_min = round((distance_km / max(avg_speed_kmh, 1)) * 60, 1)

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
