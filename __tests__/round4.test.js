import { act, screen, userEvent } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as fs from 'fs';
import * as path from 'path';
import * as widget from '../modules/boa-widget';
import { routeLink } from '../App';
import { QUOTE_CATEGORIES, QUOTES } from '../src/data/quotes';
import { dailyQuote, dayOfYear } from '../src/utils/dailyQuote';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

describe('the Daily Spark', () => {
  test('five kinds, each with at least 10 different quotes', () => {
    expect(QUOTE_CATEGORIES.map((c) => c.label)).toEqual(['Good Energy', 'Love', 'Wealth', 'Health', 'Career']);
    for (const c of QUOTE_CATEGORIES) {
      expect(QUOTES[c.id].length).toBeGreaterThanOrEqual(10);
      expect(new Set(QUOTES[c.id]).size).toBe(QUOTES[c.id].length);
      QUOTES[c.id].forEach((q) => expect(q).not.toMatch(/\u2014/));
    }
  });

  test('day of the year, 1 to 365/366, local time', () => {
    expect(dayOfYear(new Date(2026, 0, 1, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 0, 1, 23, 59))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31, 12))).toBe(365);
    expect(dayOfYear(new Date(2028, 11, 31, 12))).toBe(366);
  });

  test('the quote is day-of-year modulo the list: same all day, new at midnight', () => {
    const morning = new Date(2026, 9, 24, 7, 0);
    const night = new Date(2026, 9, 24, 23, 59);
    const tomorrow = new Date(2026, 9, 25, 0, 1);
    const list = QUOTES.wealth;
    expect(dailyQuote('wealth', morning).text).toBe(list[dayOfYear(morning) % list.length]);
    expect(dailyQuote('wealth', night).text).toBe(dailyQuote('wealth', morning).text);
    expect(dailyQuote('wealth', tomorrow).text).not.toBe(dailyQuote('wealth', morning).text);
    expect(dailyQuote('wealth', morning).category.label).toBe('Wealth');
  });

  test('no kind chosen (or an unknown one) is Good Energy', () => {
    const day = new Date(2026, 9, 24);
    expect(dailyQuote(null, day).category.id).toBe('good_energy');
    expect(dailyQuote('nope', day).text).toBe(dailyQuote('good_energy', day).text);
  });
});

test('the confirmation email returns to exactly network.boa://auth-callback', () => {
  expect(require('../src/api/hub').AUTH_REDIRECT).toBe('network.boa://auth-callback');
});

test('the reset migration recreates the Hub with quote_category, in one transaction', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261024210000_boa_hub_reset.sql'), 'utf8');
  expect(sql).toMatch(/^begin;$/m);
  expect(sql).toMatch(/^commit;$/m);
  expect(sql).toContain('drop table if exists public.reports, public.messages, public.conversations, public.blocks, public.profiles cascade;');
  expect(sql).toMatch(/quote_category text\s+check \(quote_category in \('good_energy', 'love', 'wealth', 'health', 'career'\)\)/);
  expect(sql).toContain('adult_confirmed_at timestamptz not null');
  // The ids the app stores are exactly the ones the database allows.
  const allowed = sql.match(/quote_category in \(([^)]*)\)/)[1].match(/'(\w+)'/g).map((x) => x.slice(1, -1));
  expect(allowed).toEqual(QUOTE_CATEGORIES.map((c) => c.id));
});

describe('in the app', () => {
  let probe;
  beforeEach(async () => {
    probe = instrument();
    AppState.currentState = 'active';
    await setWindow(PORTRAIT);
    jest.clearAllMocks();
  });
  afterEach(() => {
    expect(probe.errors).toEqual([]);
    jest.restoreAllMocks();
  });

  test("the widget's weather link opens the forecast; its now-playing link opens Radio", async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    // Whichever way the link arrives (cold start or while running), it routes.
    const go = async (url) => {
      let routed;
      await act(async () => {
        routed = routeLink(url);
      });
      await advance(600);
      return routed;
    };
    expect(await go('network.boa://weather')).toBe(true);
    expect(screen.getByTestId(/^forecast-(screen|empty)$/)).toBeOnTheScreen();
    expect(await go('network.boa://now-playing')).toBe(true);
    expect(screen.getByTestId('radio-stage')).toBeOnTheScreen();
    expect(routeLink('https://example.com')).toBe(false);
    // The confirmation email's link: handled (here the test app has no
    // Supabase, so it lands on Chat and says what went wrong).
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    expect(await go('network.boa://auth-callback?code=x')).toBe(true);
    expect(screen.getByText('Messages')).toBeOnTheScreen();
    expect(alert).toHaveBeenCalledWith("That link didn't work", expect.any(String));
  });

  test('Profile shows the Daily Spark on frosted glass with the kind', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Profile');
    expect(screen.getByTestId('daily-spark')).toBeOnTheScreen();
    expect(screen.getByTestId('daily-spark-category')).toHaveTextContent(/Good Energy · Mindset/);
    expect(screen.getByTestId('daily-spark-quote')).toHaveTextContent(dailyQuote(null, new Date()).text);
  });

  test('the widget settings offer Glass, Compact and Record, and send the choice to the widget', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Profile');
    await user.press(screen.getByText('Home screen widget'));
    await advance(500);
    await user.press(screen.getByTestId('widget-layout-record'));
    expect(widget.setLayout).toHaveBeenLastCalledWith('record');
    await user.press(screen.getByTestId('widget-layout-compact'));
    expect(widget.setLayout).toHaveBeenLastCalledWith('compact');
    expect(screen.getByTestId('widget-preview')).toBeOnTheScreen();
  });
});
