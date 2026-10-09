'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export interface MapPoint {
  lat: number;
  lng: number;
}

const NAIROBI_CBD: MapPoint = { lat: -1.286389, lng: 36.817223 };

// CSS-only teal pin; avoids Leaflet's default PNG marker assets, which break under bundlers.
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#0d9488;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function ClickHandler({ onChange }: { onChange: (p: MapPoint) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FlyToExternal({ value, lastEmitted }: { value: MapPoint | null; lastEmitted: React.MutableRefObject<MapPoint | null> }) {
  const map = useMap();
  useEffect(() => {
    if (!value) return;
    const last = lastEmitted.current;
    // Only fly when the change came from outside (e.g. geolocation), not from our own click/drag.
    if (last && last.lat === value.lat && last.lng === value.lng) return;
    map.flyTo([value.lat, value.lng], 16);
  }, [value, map, lastEmitted]);
  return null;
}

export default function LocationMap({
  value,
  onChange,
}: {
  value: MapPoint | null;
  onChange: (p: MapPoint) => void;
}) {
  const lastEmitted = useRef<MapPoint | null>(null);
  const emit = (p: MapPoint) => {
    lastEmitted.current = p;
    onChange(p);
  };
  const handlers = useMemo(
    () => ({
      dragend(e: L.LeafletEvent) {
        const ll = (e.target as L.Marker).getLatLng();
        lastEmitted.current = { lat: ll.lat, lng: ll.lng };
        onChange({ lat: ll.lat, lng: ll.lng });
      },
    }),
    [onChange],
  );
  const pos = value ?? NAIROBI_CBD;

  return (
    <MapContainer center={[pos.lat, pos.lng]} zoom={value ? 16 : 12} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onChange={emit} />
      <FlyToExternal value={value} lastEmitted={lastEmitted} />
      {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} draggable eventHandlers={handlers} />}
    </MapContainer>
  );
}
