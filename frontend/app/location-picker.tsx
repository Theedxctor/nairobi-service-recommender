'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

export interface LatLng {
  lat: number;
  lng: number;
  accuracy?: number;
}

const LocationMap = dynamic(() => import('./location-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-stone-100" aria-hidden="true" />,
});

export function LocationPicker({
  value,
  onChange,
  label,
}: {
  value: LatLng | null;
  onChange: (v: LatLng) => void;
  label?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied' | 'unsupported' | 'timeout' | 'error'>('idle');

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus('idle');
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else if (err.code === err.TIMEOUT) setStatus('timeout');
        else setStatus('error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const acc = value?.accuracy;
  let message = '';
  let warn = false;
  if (status === 'locating') message = 'Locating…';
  else if (status === 'denied')
    message = 'Location permission was denied. You can drop the pin on the map instead, or choose your area below.';
  else if (status === 'unsupported')
    message = 'Your browser does not support location. Click the map to drop the pin instead.';
  else if (status === 'timeout')
    message = 'Locating timed out. Try again, or click the map to drop the pin.';
  else if (status === 'error') message = 'Could not get your location. Click the map to drop the pin instead.';
  else if (acc !== undefined) {
    message = `Location found (±${Math.round(acc)} m).`;
    if (acc > 500) {
      message += ' Your location looks approximate — drag the pin to your exact spot';
      warn = true;
    }
  }

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium text-stone-700">{label}</p>}
      <button
        type="button"
        onClick={locate}
        disabled={status === 'locating'}
        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        Use my current location
      </button>
      <p
        aria-live="polite"
        className={`min-h-5 text-sm ${status === 'denied' || status === 'timeout' || status === 'error' || status === 'unsupported' || warn ? 'text-amber-700' : 'text-stone-600'}`}
      >
        {message}
      </p>
      <div className="h-72 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
        <LocationMap
          value={value}
          onChange={(p) => {
            // A pin placed by hand replaces any earlier denied/timeout message.
            setStatus('idle');
            onChange({ lat: p.lat, lng: p.lng });
          }}
        />
      </div>
      <p className="text-xs text-stone-500">Drag the pin or click the map to adjust.</p>
      {value && (
        <p className="text-xs text-stone-500">
          {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}
