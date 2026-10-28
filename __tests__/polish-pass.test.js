// The polish pass, kept: no stock spinners, every slider BOA's own with
// its big thumb, and no full-screen modal on the platform's linear slide.
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.js')) files.push(p);
  }
})(SRC);
const offenders = (re, except = []) => files.filter((f) => !except.some((e) => f.endsWith(e)) && re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SRC, f));

test('loading is a shimmer skeleton or the gold dots, never a stock spinner', () => {
  expect(offenders(/<ActivityIndicator\b/)).toEqual([]);
});

test('every slider is BoaSlider: a 28 pt thumb and a 48 pt track to grab', () => {
  expect(offenders(/from '@react-native-community\/slider'/, ['components/BoaSlider.js'])).toEqual([]);
  const { SLIDER_HEIGHT } = require('../src/components/BoaSlider');
  expect(SLIDER_HEIGHT).toBeGreaterThanOrEqual(44);
});

test('full-screen sheets rise on the spring, not the platform slide', () => {
  expect(offenders(/animationType="slide"/)).toEqual([]);
});
