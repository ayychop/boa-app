// The Daily Spark: one line a day, in the kind you chose at sign-up. All
// written for BOA, so nothing here needs a credit or a licence.
//
// Each category's id is what's stored in profiles.quote_category.

export const QUOTE_CATEGORIES = [
  { id: 'good_energy', label: 'Good Energy', theme: 'Mindset', icon: 'sunny-outline' },
  { id: 'love', label: 'Love', theme: 'Relationships', icon: 'heart-outline' },
  { id: 'wealth', label: 'Wealth', theme: 'Financial', icon: 'trending-up-outline' },
  { id: 'health', label: 'Health', theme: 'Wellness', icon: 'leaf-outline' },
  { id: 'career', label: 'Career', theme: 'Ambition', icon: 'rocket-outline' },
];

export const DEFAULT_QUOTE_CATEGORY = 'good_energy';

export const QUOTES = {
  good_energy: [
    'Protect your peace like it pays the rent. Some days it does.',
    'You are allowed to begin again before lunch.',
    'The room changes when you walk in steady. Walk in steady.',
    'Your mood is a forecast, not a sentence.',
    'Gratitude is quiet confidence: you already have enough to start.',
    'Not every thought deserves a seat at your table.',
    'Light travels. Be the reason someone else finds their way today.',
    'Small wins still count. Stack them.',
    'Breathe first. The answer is usually on the other side of the exhale.',
    'Energy is currency. Spend it where it multiplies.',
    'You do not need a new year. You need a new hour.',
    'Choose the version of today you will be proud to remember.',
  ],
  love: [
    'Love is attention that does not need an audience.',
    'Be soft with the people who are learning you.',
    'The right people will not make you audition twice.',
    'Say it while it is warm. Kind words go cold in drawers.',
    'Listening is the most generous thing you can give for free.',
    'Love yourself loudly enough that you never settle for whispers.',
    'Real love leaves you more yourself, not less.',
    'Forgive quickly, remember wisely.',
    'Show up on ordinary days. That is where love lives.',
    'A good partner is a safe place and a brave push, both.',
    'Call the person you thought of. That was the sign.',
    'Hold on to people who clap when you win and stay when you do not.',
  ],
  wealth: [
    'Pay yourself first, even when it is small. Especially when it is small.',
    'Rich is a number. Wealthy is a plan. Free is a decision.',
    'Every pound has a job. Give it one before it finds its own.',
    'Buy time before you buy things.',
    'Your network is an asset. Invest in it with value, not asks.',
    'Compound interest rewards the patient and punishes the impulsive.',
    'Own something that works while you sleep.',
    'Know your numbers like you know your favourite song.',
    'Discipline today is the freedom you get to spend tomorrow.',
    'Skills are the only asset nobody can repossess.',
    'Spend like the future you is watching. They are.',
    'Opportunity looks like work wearing plain clothes.',
  ],
  health: [
    'Your body hears everything your mind says. Speak kindly.',
    'Water, sunlight, sleep, movement. Repeat until it feels like luxury.',
    'Rest is part of the work, not a reward for finishing it.',
    'Walk it off. Literally. Ten minutes changes the whole day.',
    'Feed yourself like someone you love.',
    'Strength is built in the reps nobody sees.',
    'Your phone can wait. Your breath cannot.',
    'Health is the quiet wealth that makes every other wealth possible.',
    'Stretch before you stress.',
    'Go to bed on time. Tomorrow you is counting on it.',
    'Listen to the whisper before your body has to shout.',
    'Movement is medicine with no queue.',
  ],
  career: [
    'Talent is everywhere. Opportunity is built. Build it.',
    'Do the work so well they cannot pretend not to see it.',
    'Your portfolio speaks before you do. Give it something to say.',
    'Ask for the room, then make the room glad it said yes.',
    'Consistency beats a lucky break. It also attracts one.',
    'Learn the craft, then learn the business of the craft.',
    'Say yes to the small job. Big ones are watching who does those well.',
    'Your first draft is a door, not a verdict.',
    'Find the people building what you want to build. Bring value.',
    'Credits are earned on set and kept by reputation.',
    'Be early, be ready, be the easiest person to hire again.',
    'Ambition without a calendar is just a mood. Book it in.',
  ],
};

export const categoryById = (id) => QUOTE_CATEGORIES.find((c) => c.id === id) ?? null;
