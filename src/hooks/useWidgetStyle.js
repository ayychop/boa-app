import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as widget from '../../modules/boa-widget';

const KEY = 'boa:widget:v1';
export const DEFAULT_WIDGET_STYLE = { color: '#141416', opacity: 0.55 };

/**
 * The home screen widget's glass: tint and opacity, saved on the device and
 * pushed to the widget whenever it changes.
 */
export default function useWidgetStyle() {
  const [style, setStyleState] = useState(DEFAULT_WIDGET_STYLE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setStyleState({ ...DEFAULT_WIDGET_STYLE, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch) => {
    setStyleState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      widget.setStyle(next.color, next.opacity);
      return next;
    });
  }, []);

  return { style, update, ready, available: widget.isAvailable };
}
