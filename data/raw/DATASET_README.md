**Nairobi Service Provider Recommendation System — Dataset**  
A Context-Aware Recommendation System Using Ensemble Learning  
   
 Scope: Nairobi, Kenya | Scale: Synthetic but geographically and behaviourally realistic  
**Files**  
| | | |  
|-|-|-|  
| **File** | **Rows** | **Description** |   
| nairobi_areas.csv | 30 | Nairobi neighbourhoods with coordinates, area type, road quality |   
| traffic_patterns.csv | 160 | Congestion multipliers per corridor × time slot × day type |   
| service_providers.csv | 200 | Provider profiles with ratings, rates, location, experience |   
| clients.csv | 500 | Client profiles with location across Nairobi |   
| provider_availability.csv | ~1200 | Weekly availability schedule per provider |   
| historical_bookings.csv | 3000 | Full booking records — the PRIMARY ML TRAINING DATA |   
| ml_features_reference.csv | 21 | Data dictionary for all ML features and the target variable |   
   
**ML Target Variable**  
arrival_reliability_score in historical_bookings.csv (range 0.0 – 1.0)  
- Composite score reflecting: on-time arrival, job completion, congestion at booking time,  
   
 provider quality, and route/road conditions  
- XGBoost will be trained to predict this score for new provider-client-time combinations  
**Key Relationships**  
- historical_bookings.provider_id → service_providers.provider_id  
- historical_bookings.client_id   → clients.client_id  
- service_providers.base_area_id  → nairobi_areas.area_id  
- clients.area_id                 → nairobi_areas.area_id  
- historical_bookings.primary_corridor + time_slot + day_type → traffic_patterns.csv  
**Traffic Corridors Covered**  
Mombasa Road, Thika Road, Ngong Road, Waiyaki Way, Jogoo Road,  
   
 Outer Ring Road, Uhuru Highway, Langata Road, Forest Road, Kiambu Road  
**Congestion Multiplier Guide**  
1.0 = Free flow (50 km/h)  
   
 1.5 = Light traffic (~33 km/h)  
   
 2.0 = Moderate (~25 km/h)  
   
 3.0 = Heavy (~17 km/h)  
   
 3.5 = Gridlock (~14 km/h) — typical Mombasa/Thika Road morning rush  
