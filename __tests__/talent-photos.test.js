import fs from 'fs';
import path from 'path';
import { render, screen, userEvent } from '@testing-library/react-native';

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

describe('the website bios, word for word', () => {
  const { talent, founders } = require('../src/data/boaContent');
  const BIOS = {
    'prince-boamah': "Prince Boamah is an emerging creative with a passion for storytelling, film and bringing meaningful characters to life. Driven by creativity, ambition and a desire to grow, he is focused on developing his craft and exploring opportunities within the entertainment industry. With a genuine appreciation for authentic stories and the power of film to connect people, Prince brings dedication, personality and a fresh perspective to every project he is part of. His journey is rooted in resilience, self expression and the belief that every story deserves to be told. As he continues to build his experience, Prince aims to create work that resonates with audiences, challenges perspectives and leaves a lasting impression.",
    'rebecca-soper': "Rebecca Soper is a London based actor, drama facilitator and Youth Violence Intervention Specialist. She trained at Intermission Youth Theatre, Identity Drama School, the National Youth Theatre and London School of Dramatic Arts. Her acting credits include Shakespeare's Globe, the Royal Court Theatre, film and voiceover work, including Netflix productions. Alongside acting, Rebecca uses drama and storytelling to raise awareness of youth violence, exploitation, identity and belonging, working with young people across schools, youth theatres and prison settings to inspire meaningful change.",
    'sabeian-gilzene': "Sabeian Gilzene is a 6ft5 Actor and model from the UK with Caribbean roots. He is an amazing model and Actor, very professional on set, and looks to one day make his own TV shows and movies.",
    'ngor-yel': "Ngor Yel is an Actor and model who is professional on set and ready to do whatever it takes to make sure the scene is right. A great basketball player and athlete, he is also a daytime teacher, making him excellent at code switching.",
    'phillip-quartey': "Phillip Quartey is an Actor and Model from London. Standing at 6ft2, he is confident, an amazing dancer, and is always ready for the call. He is also a great athlete, especially in football.",
    'jeremy-benson': "Jeremy Benson is up and coming, learning the ropes of acting and the whole creative portfolio that comes with it. He will soon be hosting his own channel, which will have activities and explorations inside it. He is very confident, ready at fast speed, and gets his scenes right, if not on the first attempt, then the second.",
    'jeremy-owusu': "Jeremy Owusu is an Actor and model who is confident, a comedian, and brings joy and good energy into the room. He still has a quiet, cool, observant profile about himself. He enjoys football a lot, is excellent at code switching, and showcases this on camera.",
    'chan-yel': "Chan Yel is an amazing Actor and model who takes his craft seriously. He is very good at basketball, specialises in urban content, and would be great for thriller roles both inside and outside the urban scene. He is athletic and has the perfect muscular build, not too big and not too small.",
  };
  const FOUNDERS = {
    'David O': "Very observant, quiet and reserved in profile, yet very thoughtful and one of the most helpful, outgoing people you'll meet. He is technically and creatively up to date, good with all equipment and setup. He has done everything creatively from a camera and editing standpoint, so he is well experienced.",
    'Joseph Boat': "A confident leader who is always looking for ways for all of us to win. My goal is to create chances and opportunities for people who the door has been closed on and not given a chance, yet they are talented and have what it takes, they just need exposure. Profile is charismatic and a people's person, great at networking in any environment. Inside I am shy, but on the outside I portray a very confident, assertive demeanour. Overall, walk with love.",
  };

  test.each(Object.entries(BIOS))('%s', (id, bio) => {
    expect(talent.find((t) => t.id === id).bio).toBe(bio);
  });

  test.each(Object.entries(FOUNDERS))('%s (founder)', (name, bio) => {
    expect(founders.find((f) => f.name === name).bio).toBe(bio);
  });

  test('Jeremy Benson and Jeremy Owusu are different people; nobody else is invented a bio', () => {
    expect(talent.find((t) => t.id === 'jeremy-benson').name).toBe('Jeremy Benson');
    expect(talent.find((t) => t.id === 'jeremy-owusu').name).toBe('Jeremy Owusu');
    expect(talent.filter((t) => !BIOS[t.id]).every((t) => t.bio === null)).toBe(true);
  });

  test('the edited photos replaced the old ones, at the same paths', () => {
    for (const f of ['david-o', 'joseph-boat', 'ngor-yel', 'phillip-quartey', 'prince-boamah']) {
      const bytes = fs.readFileSync(path.join(__dirname, '..', 'assets', 'talent', `${f}.jpg`));
      expect(bytes.length).toBeGreaterThan(50000);
      // JPEG, resized to fit the app (the originals were 2 to 3 MB).
      expect(bytes.length).toBeLessThan(400000);
    }
  });
});

describe('founders, on Profile and on the Talent page', () => {
  const FounderCard = require('../src/components/FounderCard').default;
  const { founders } = require('../src/data/boaContent');

  test('a founder card opens to the whole bio and closes again', async () => {
    const user = userEvent.setup();
    await render(<FounderCard founder={founders[0]} />);
    expect(screen.getByTestId('founder-bio').props.numberOfLines).toBe(3);
    await user.press(screen.getByTestId('founder-bio-toggle'));
    expect(screen.getByTestId('founder-bio').props.numberOfLines).toBeUndefined();
    await user.press(screen.getByTestId('founder-bio-toggle'));
    expect(screen.getByTestId('founder-bio').props.numberOfLines).toBe(3);
  });

  test('on the Talent page the photo is large, cover-filled, under the dark gradient', async () => {
    await render(<FounderCard founder={founders[1]} photoWidth={300} />);
    expect(screen.getByTestId('headshot-photo').props.resizeMode).toBe('cover');
    expect(screen.getByTestId('headshot-shade')).toBeOnTheScreen();
  });

  test('both screens show them, and a talent bio opens in the profile sheet', () => {
    const talentScreen = read('src/screens/TalentScreen.js');
    expect(talentScreen).toMatch(/<FounderCard/);
    expect(talentScreen).toMatch(/testID="talent-founders"/);
    expect(talentScreen).toMatch(/\{selected\.bio/);
    expect(read('src/screens/ProfileScreen.js')).toMatch(/<FounderCard/);
  });
});
