import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react-native';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('real photos on the casting board', () => {
  const { talent, founders } = require('../src/data/boaContent');

  test('Phillip Quartey and Rebecca Soper have their photos; every photo file is there', () => {
    const phillip = talent.find((t) => t.id === 'phillip-quartey');
    expect(phillip).toMatchObject({ name: 'Phillip Quartey' });
    expect(phillip.headshot).toBeTruthy();
    expect(talent.find((t) => t.id === 'rebecca-soper').headshot).toBeTruthy();
    for (const f of ['david-o', 'jeremy-owusu', 'joseph-boat', 'ngor-yel', 'phillip-quartey', 'prince-boamah', 'rebecca-soper', 'sabeian-gilzene']) {
      expect(fs.existsSync(path.join(__dirname, '..', 'assets', 'talent', `${f}.jpg`))).toBe(true);
    }
    expect(founders.every((f) => f.headshot)).toBe(true);
  });

  test('a photo fills the frame (cover) under a dark gradient so the name stays readable', async () => {
    const Headshot = require('../src/components/Headshot').default;
    const person = talent.find((t) => t.id === 'phillip-quartey');
    await render(<Headshot person={person} width={160} ratio={3 / 4} caption={{ kicker: 'Actor & Model', title: 'Phillip Quartey' }} />);
    expect(screen.getByTestId('headshot-photo', { includeHiddenElements: true }).props.resizeMode).toBe('cover');
    expect(screen.getByTestId('headshot-shade', { includeHiddenElements: true })).toBeOnTheScreen();
    const src = read('src/components/Headshot.js');
    expect(src).toMatch(/rgba\(5,5,6,0\.9\)/);
  });

  test('press and hover sweep a gold sheen over the card', async () => {
    const src = read('src/components/GoldSheen.js');
    expect(src).toMatch(/export function useGoldSheen/);
    expect(src).toMatch(/colors\.gold/);
    const ui = read('src/components/ui.js');
    expect(ui).toMatch(/onPressIn\?\.\(e\)/);
    expect(ui).toMatch(/onPressOut\?\.\(e\)/);
    const talentScreen = read('src/screens/TalentScreen.js');
    expect(talentScreen).toMatch(/useGoldSheen\(\)/);
    expect(talentScreen).toMatch(/onHoverIn/);
  });
});
