// Local weather from Open-Meteo (open-meteo.com: free, no key, CC BY 4.0
// data). One request brings the current conditions, the next 24 hours and
// seven days. Everything here is pure apart from fetchForecast, so the
// summaries can be tested on their own.

const API = 'https://api.open-meteo.com/v1/forecast';

// WMO weather codes, grouped into what we draw.
export function conditionFor(code, isDay = true) {
  if (code === 0) return { kind: isDay ? 'sun' : 'moon', label: isDay ? 'Sunny' : 'Clear' };
  if (code === 1) return { kind: isDay ? 'sun' : 'moon', label: 'Mostly clear' };
  if (code === 2) return { kind: isDay ? 'partly' : 'cloud_night', label: 'Partly cloudy' };
  if (code === 3) return { kind: 'cloud', label: 'Overcast' };
  if (code === 45 || code === 48) return { kind: 'cloud', label: 'Fog' };
  if (code >= 51 && code <= 57) return { kind: 'rain', label: 'Drizzle' };
  if (code === 61 || code === 80) return { kind: 'rain', label: 'Light rain' };
  if (code === 63 || code === 81) return { kind: 'rain', label: 'Rain' };
  if (code === 65 || code === 82 || code === 66 || code === 67) return { kind: 'rain', label: 'Heavy rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Snow' };
  if (code >= 95) return { kind: 'storm', label: 'Thunderstorm' };
  return { kind: 'cloud', label: 'Cloudy' };
}

const WET = new Set(['rain', 'storm', 'snow']);

/** Fahrenheit for the US and its territories, Celsius everywhere else. */
export function prefersFahrenheit(locale) {
  try {
    const tag = locale ?? Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return /[-_](US|PR|GU|VI|AS|MP|LR|BS|BZ|KY|PW)\b/i.test(tag);
  } catch {
    return false;
  }
}

/**
 * The rain outlook, in words: what the widget and Home say under the
 * temperature ("Rain likely to continue", "Rain likely around 3pm", ...).
 * `hours` are the coming hours' { time, precip } (probability, 0 to 100).
 */
export function rainOutlook(currentKind, hours) {
  const next = hours.slice(0, 3).map((h) => h.precip ?? 0);
  const soon = Math.max(0, ...next);
  const wetNow = WET.has(currentKind);
  const word = currentKind === 'snow' ? 'Snow' : 'Rain';
  if (wetNow) return soon >= 50 ? `${word} likely to continue` : `${word} easing off soon`;
  const first = hours.slice(0, 12).find((h) => (h.precip ?? 0) >= 60);
  if (first) {
    const i = hours.indexOf(first);
    if (i <= 1) return 'Rain likely within the hour';
    return `Rain likely around ${hourLabel(first.time)}`;
  }
  const max12 = Math.max(0, ...hours.slice(0, 12).map((h) => h.precip ?? 0));
  if (max12 < 10) return 'No rain expected';
  return `${Math.round(max12)}% chance of rain`;
}

export function hourLabel(iso) {
  const d = new Date(iso);
  try {
    return d.toLocaleTimeString(undefined, { hour: 'numeric' }).replace(/\s/g, '').toLowerCase();
  } catch {
    return `${d.getHours()}:00`;
  }
}

export function dayLabel(iso, i) {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tomorrow';
  const d = new Date(`${iso}T12:00:00`);
  try {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  } catch {
    return iso;
  }
}

/** Turns Open-Meteo's response into what the app draws. */
export function shapeForecast(json, place, fahrenheit) {
  const c = json.current;
  const now = conditionFor(c.weather_code, c.is_day !== 0);
  const startAt = json.hourly.time.findIndex((t) => new Date(t).getTime() >= Date.now() - 30 * 60 * 1000);
  const from = Math.max(0, startAt);
  const hours = json.hourly.time.slice(from, from + 24).map((time, i) => ({
    time,
    temp: Math.round(json.hourly.temperature_2m[from + i]),
    precip: json.hourly.precipitation_probability?.[from + i] ?? 0,
    ...conditionFor(json.hourly.weather_code[from + i], json.hourly.is_day?.[from + i] !== 0),
  }));
  const days = json.daily.time.map((date, i) => ({
    date,
    name: dayLabel(date, i),
    high: Math.round(json.daily.temperature_2m_max[i]),
    low: Math.round(json.daily.temperature_2m_min[i]),
    precip: json.daily.precipitation_probability_max?.[i] ?? 0,
    sunrise: json.daily.sunrise?.[i] ?? null,
    sunset: json.daily.sunset?.[i] ?? null,
    ...conditionFor(json.daily.weather_code[i], true),
  }));
  return {
    at: Date.now(),
    place,
    unit: fahrenheit ? 'F' : 'C',
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    wind: Math.round(c.wind_speed_10m),
    windUnit: fahrenheit ? 'mph' : 'km/h',
    isDay: c.is_day !== 0,
    ...now,
    outlook: rainOutlook(now.kind, hours),
    rainChance: hours[0]?.precip ?? 0,
    high: days[0]?.high,
    low: days[0]?.low,
    hours,
    days,
  };
}

export async function fetchForecast({ latitude, longitude }, place, fahrenheit = prefersFahrenheit()) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
    ...(fahrenheit && { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph' }),
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return shapeForecast(await res.json(), place, fahrenheit);
}

/** What the home screen widget shows: "14°", the icon, the place, the outlook. */
export function widgetWeather(w) {
  if (!w) return null;
  return { temp: `${w.temp}°`, icon: w.kind, place: w.place || w.label, detail: w.outlook };
}
