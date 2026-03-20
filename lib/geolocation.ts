export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
  formatted?: string;
};

export async function requestUserLocation(timeoutMs = 12000): Promise<Coordinates | null> {
  if (typeof window === 'undefined') return null;
  if (!('geolocation' in navigator)) return null;

  return new Promise((resolve) => {
    const onSuccess = (pos: GeolocationPosition) => {
      resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp
      });
    };
    const onError = () => resolve(null);
    try {
      const id = window.setTimeout(() => resolve(null), timeoutMs);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          window.clearTimeout(id);
          onSuccess(p);
        },
        () => {
          window.clearTimeout(id);
          onError();
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0
        }
      );
    } catch {
      resolve(null);
    }
  });
}

const GOOGLE_GEOCODING_API_KEY = 'AIzaSyDZIEduNGQuiNaflS3K44bJkaN3tvQxI6I';

async function reverseGeocodeGoogle(coords: Coordinates): Promise<string | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&key=${GOOGLE_GEOCODING_API_KEY}&result_type=street_address|premise|subpremise|point_of_interest`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data?.status !== 'OK' || !data?.results?.length) return null;
    return data.results[0].formatted_address ?? null;
  } catch {
    return null;
  }
}

async function reverseGeocodeNominatim(coords: Coordinates, email?: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(coords.latitude),
      lon: String(coords.longitude),
      'accept-language': 'en',
      zoom: '18'
    });
    if (email) params.set('email', email);
    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
    const res = await fetch(url, { headers: {} });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const a = data?.address ?? {};
    const area = a.neighbourhood || a.suburb || a.city_district || a.state_district || null;
    const locality = a.city || a.town || a.village || a.county || null;
    const country = a.country || null;
    const parts = [area, locality].filter(Boolean);
    if (parts.length) return parts.join(', ');
    if (locality && country) return `${locality}, ${country}`;
    if (data?.display_name) return String(data.display_name);
    return null;
  } catch {
    return null;
  }
}

async function reverseGeocode(coords: Coordinates, email?: string): Promise<string | null> {
  // Try Google first (building-level precision), fall back to Nominatim
  const googleResult = await reverseGeocodeGoogle(coords);
  if (googleResult) return googleResult;
  return reverseGeocodeNominatim(coords, email);
}

export async function getLocationWithAddress(
  email?: string,
  timeoutMs = 12000
): Promise<Coordinates | null> {
  const coords = await requestUserLocation(timeoutMs);
  if (!coords) return null;
  const formatted = await reverseGeocode(coords, email);
  return { ...coords, formatted: formatted ?? undefined };
}



