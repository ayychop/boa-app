import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { guarded } from '../utils/safely';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { fetchForecast, widgetWeather } from '../api/weather';
import * as widget from '../../modules/boa-widget';

const STORE_KEY = 'boa.weather.v1';
// Weather moves slowly; a fresh forecast at most every half hour.
const STALE_MS = 30 * 60 * 1000;

const WeatherContext = createContext(null);

/**
 * Local weather for Home, the forecast page and the home screen widget.
 * Location is only asked for when the listener taps "Show my weather" (or
 * the widget's weather), and only the approximate kind. Once allowed, the
 * forecast refreshes on launch and whenever the app comes back after half
 * an hour. The last forecast is kept on the phone, so Home shows it at once.
 */
export function WeatherProvider({ children }) {
  // idle: never asked; denied; loading; ready; error.
  const [status, setStatus] = useState('idle');
  const [data, setData] = useState(null);
  const busy = useRef(false);
  const dataRef = useRef(null);
  dataRef.current = data;

  const load = useCallback(async ({ ask = false, force = false } = {}) => {
    if (busy.current) return;
    if (!force && dataRef.current && Date.now() - dataRef.current.at < STALE_MS) return;
    busy.current = true;
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && ask && perm.canAskAgain !== false) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setStatus(perm.canAskAgain === false || ask ? 'denied' : 'idle');
        return;
      }
      setStatus((s) => (dataRef.current ? s : 'loading'));
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 60 * 60 * 1000 }).catch(() => null)) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      let place = null;
      if (Platform.OS !== 'web') {
        try {
          const [g] = await Location.reverseGeocodeAsync(pos.coords);
          place = g?.city || g?.subregion || g?.district || g?.region || null;
        } catch {}
      }
      const next = await fetchForecast(pos.coords, place);
      setData(next);
      setStatus('ready');
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
    } catch (err) {
      console.warn('[weather] forecast failed', err?.message ?? err);
      setStatus(dataRef.current ? 'ready' : 'error');
    } finally {
      busy.current = false;
    }
  }, []);

  // The last forecast first, then a fresh one if location is already allowed.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw);
        if (saved?.temp != null) {
          setData(saved);
          setStatus('ready');
        }
      })
      .catch(() => {})
      .finally(() => alive && load());
    const sub = AppState.addEventListener(
      'change',
      guarded('weather app state', (s) => s === 'active' && load()),
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, [load]);

  // The widget always shows the latest.
  useEffect(() => {
    if (data) widget.setWeather(widgetWeather(data));
  }, [data]);

  const enable = useCallback(() => load({ ask: true, force: true }), [load]);
  const refresh = useCallback(() => load({ force: true }), [load]);
  const value = useMemo(() => ({ status, data, enable, refresh }), [status, data, enable, refresh]);
  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}

export function useWeather() {
  const ctx = useContext(WeatherContext);
  if (!ctx) throw new Error('useWeather must be used inside <WeatherProvider>');
  return ctx;
}
