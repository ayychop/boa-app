// Emoji Google's animated set doesn't have: people (with skin tones) and
// every flag. They draw as the phone's own emoji, and animate where Google's
// set has an animation for them (a hand with a skin tone, say). Used by the
// animated emoji picker (src/components/chat/StickerPicker.js).

// ---------------------------------------------------------------- skin tones

/** The six tones: none (the default yellow) and the five Fitzpatrick modifiers. */
export const TONES = [
  { id: 0, label: 'Default', mod: '', color: '#FFCC33' },
  { id: 1, label: 'Light', mod: '\u{1F3FB}', color: '#F7DCC4' },
  { id: 2, label: 'Medium light', mod: '\u{1F3FC}', color: '#E8BF98' },
  { id: 3, label: 'Medium', mod: '\u{1F3FD}', color: '#C69163' },
  { id: 4, label: 'Medium dark', mod: '\u{1F3FE}', color: '#8D5A36' },
  { id: 5, label: 'Dark', mod: '\u{1F3FF}', color: '#4B2E1E' },
];

// The code points that take a skin tone (Unicode's Emoji_Modifier_Base), as ranges.
const BASES = [
  [0x261d, 0x261d], [0x26f9, 0x26f9], [0x270a, 0x270d], [0x1f385, 0x1f385], [0x1f3c2, 0x1f3c4], [0x1f3c7, 0x1f3c7], [0x1f3ca, 0x1f3cc],
  [0x1f442, 0x1f443], [0x1f446, 0x1f450], [0x1f466, 0x1f478], [0x1f47c, 0x1f47c], [0x1f481, 0x1f483], [0x1f485, 0x1f487], [0x1f48f, 0x1f48f],
  [0x1f491, 0x1f491], [0x1f4aa, 0x1f4aa], [0x1f574, 0x1f575], [0x1f57a, 0x1f57a], [0x1f590, 0x1f590], [0x1f595, 0x1f596], [0x1f645, 0x1f647],
  [0x1f64b, 0x1f64f], [0x1f6a3, 0x1f6a3], [0x1f6b4, 0x1f6b6], [0x1f6c0, 0x1f6c0], [0x1f6cc, 0x1f6cc], [0x1f90c, 0x1f90c], [0x1f90f, 0x1f90f],
  [0x1f918, 0x1f91f], [0x1f926, 0x1f926], [0x1f930, 0x1f939], [0x1f93c, 0x1f93e], [0x1f977, 0x1f977], [0x1f9b5, 0x1f9b6], [0x1f9b8, 0x1f9b9],
  [0x1f9bb, 0x1f9bb], [0x1f9cd, 0x1f9cf], [0x1f9d1, 0x1f9dd], [0x1fac3, 0x1fac5], [0x1faf0, 0x1faf8],
];
const isBase = (ch) => {
  const cp = ch?.codePointAt(0) ?? 0;
  return BASES.some(([lo, hi]) => cp >= lo && cp <= hi);
};

/** Whether an emoji takes a skin tone: it has exactly one person or hand in it. */
export const takesTone = (emoji) => Array.from(emoji).filter(isBase).length === 1;

/** The emoji in a skin tone (0 is none): the modifier goes right after the person or hand. */
export function withTone(emoji, tone) {
  const mod = TONES[tone]?.mod;
  if (!mod || !takesTone(emoji)) return emoji;
  const out = [];
  let done = false;
  for (const c of Array.from(emoji)) {
    // A variation selector right after the base gives way to the modifier.
    if (done && c === '\uFE0F' && out[out.length - 1] === mod) continue;
    out.push(c);
    if (!done && isBase(c)) {
      out.push(mod);
      done = true;
    }
  }
  return out.join('');
}

// -------------------------------------------------------------------- people

// One entry per emoji: the emoji, then words to search it by.
const PEOPLE_TEXT = [
  '\u{1F44B} waving hand wave hello hi',
  '\u{1F91A} raised back of hand',
  '\u{1F590}\uFE0F hand with fingers splayed',
  '\u270B raised hand stop high five',
  '\u{1F596} vulcan salute spock',
  '\u{1FAF1} rightwards hand',
  '\u{1FAF2} leftwards hand',
  '\u{1FAF3} palm down hand',
  '\u{1FAF4} palm up hand',
  '\u{1F44C} ok hand perfect',
  '\u{1F90C} pinched fingers italian',
  '\u{1F90F} pinching hand small',
  '\u270C\uFE0F victory hand peace',
  '\u{1F91E} crossed fingers luck',
  '\u{1FAF0} hand with index finger and thumb crossed',
  '\u{1F91F} love you gesture',
  '\u{1F918} sign of the horns rock',
  '\u{1F919} call me hand',
  '\u{1F448} backhand index pointing left',
  '\u{1F449} backhand index pointing right',
  '\u{1F446} backhand index pointing up',
  '\u{1F595} middle finger',
  '\u{1F447} backhand index pointing down',
  '\u261D\uFE0F index pointing up',
  '\u{1FAF5} index pointing at the viewer',
  '\u{1F44D} thumbs up like yes',
  '\u{1F44E} thumbs down dislike no',
  '\u270A raised fist power',
  '\u{1F44A} oncoming fist punch',
  '\u{1F91B} left facing fist',
  '\u{1F91C} right facing fist',
  '\u{1F44F} clapping hands applause',
  '\u{1F64C} raising hands celebration praise',
  '\u{1FAF6} heart hands love',
  '\u{1F450} open hands',
  '\u{1F932} palms up together',
  '\u{1F91D} handshake deal',
  '\u{1F64F} folded hands please thank you pray',
  '\u270D\uFE0F writing hand',
  '\u{1F485} nail polish',
  '\u{1F933} selfie',
  '\u{1F4AA} flexed biceps strong muscle',
  '\u{1F9BE} mechanical arm',
  '\u{1F9B5} leg',
  '\u{1F9B6} foot',
  '\u{1F442} ear',
  '\u{1F9BB} ear with hearing aid',
  '\u{1F443} nose',
  '\u{1F9E0} brain',
  '\u{1FAC0} anatomical heart',
  '\u{1FAC1} lungs',
  '\u{1F9B7} tooth',
  '\u{1F9B4} bone',
  '\u{1F440} eyes look',
  '\u{1F441}\uFE0F eye',
  '\u{1F445} tongue',
  '\u{1F444} mouth lips',
  '\u{1F476} baby',
  '\u{1F9D2} child',
  '\u{1F466} boy',
  '\u{1F467} girl',
  '\u{1F9D1} person',
  '\u{1F471} person blond hair',
  '\u{1F468} man',
  '\u{1F9D4} person beard',
  '\u{1F469} woman',
  '\u{1F468}\u200D\u{1F9B1} man curly hair',
  '\u{1F469}\u200D\u{1F9B1} woman curly hair',
  '\u{1F468}\u200D\u{1F9B0} man red hair',
  '\u{1F469}\u200D\u{1F9B0} woman red hair',
  '\u{1F468}\u200D\u{1F9B3} man white hair',
  '\u{1F469}\u200D\u{1F9B3} woman white hair',
  '\u{1F468}\u200D\u{1F9B2} man bald',
  '\u{1F469}\u200D\u{1F9B2} woman bald',
  '\u{1F9D3} older person',
  '\u{1F474} old man',
  '\u{1F475} old woman',
  '\u{1F64D} person frowning',
  '\u{1F64E} person pouting',
  '\u{1F645} person gesturing no',
  '\u{1F646} person gesturing ok',
  '\u{1F481} person tipping hand',
  '\u{1F64B} person raising hand',
  '\u{1F9CF} deaf person',
  '\u{1F647} person bowing',
  '\u{1F926} person facepalming',
  '\u{1F937} person shrugging',
  '\u{1F46E} police officer',
  '\u{1F575}\uFE0F detective',
  '\u{1F482} guard',
  '\u{1F977} ninja',
  '\u{1F477} construction worker',
  '\u{1FAC5} person with crown',
  '\u{1F934} prince',
  '\u{1F478} princess',
  '\u{1F473} person wearing turban',
  '\u{1F472} person with skullcap',
  '\u{1F9D5} woman with headscarf',
  '\u{1F935} person in tuxedo',
  '\u{1F470} person with veil',
  '\u{1F930} pregnant woman',
  '\u{1FAC3} pregnant man',
  '\u{1FAC4} pregnant person',
  '\u{1F931} breast feeding',
  '\u{1F47C} baby angel',
  '\u{1F385} santa claus',
  '\u{1F936} mrs claus',
  '\u{1F9B8} superhero',
  '\u{1F9B9} supervillain',
  '\u{1F9D9} mage wizard',
  '\u{1F9DA} fairy',
  '\u{1F9DB} vampire',
  '\u{1F9DC} merperson',
  '\u{1F9DD} elf',
  '\u{1F9DE} genie',
  '\u{1F9DF} zombie',
  '\u{1F486} person getting massage',
  '\u{1F487} person getting haircut',
  '\u{1F6B6} person walking',
  '\u{1F9CD} person standing',
  '\u{1F9CE} person kneeling',
  '\u{1F3C3} person running',
  '\u{1F483} woman dancing',
  '\u{1F57A} man dancing',
  '\u{1F574}\uFE0F person in suit levitating',
  '\u{1F46F} people with bunny ears',
  '\u{1F9D6} person in steamy room',
  '\u{1F9D7} person climbing',
  '\u{1F93A} person fencing',
  '\u{1F3C7} horse racing',
  '\u26F7\uFE0F skier',
  '\u{1F3C2} snowboarder',
  '\u{1F3CC}\uFE0F person golfing',
  '\u{1F3C4} person surfing',
  '\u{1F6A3} person rowing boat',
  '\u{1F3CA} person swimming',
  '\u26F9\uFE0F person bouncing ball',
  '\u{1F3CB}\uFE0F person lifting weights gym',
  '\u{1F6B4} person biking',
  '\u{1F6B5} person mountain biking',
  '\u{1F938} person cartwheeling',
  '\u{1F93C} people wrestling',
  '\u{1F93D} person playing water polo',
  '\u{1F93E} person playing handball',
  '\u{1F939} person juggling',
  '\u{1F9D8} person in lotus position meditate',
  '\u{1F6C0} person taking bath',
  '\u{1F6CC} person in bed sleeping',
  '\u{1F9D1}\u200D\u2695\uFE0F health worker doctor nurse',
  '\u{1F468}\u200D\u2695\uFE0F man health worker doctor',
  '\u{1F469}\u200D\u2695\uFE0F woman health worker doctor',
  '\u{1F9D1}\u200D\u{1F393} student graduate',
  '\u{1F9D1}\u200D\u{1F3EB} teacher',
  '\u{1F9D1}\u200D\u2696\uFE0F judge',
  '\u{1F9D1}\u200D\u{1F33E} farmer',
  '\u{1F9D1}\u200D\u{1F373} cook chef',
  '\u{1F9D1}\u200D\u{1F527} mechanic',
  '\u{1F9D1}\u200D\u{1F3ED} factory worker',
  '\u{1F9D1}\u200D\u{1F4BC} office worker',
  '\u{1F9D1}\u200D\u{1F52C} scientist',
  '\u{1F9D1}\u200D\u{1F4BB} technologist developer',
  '\u{1F9D1}\u200D\u{1F3A4} singer rapper artist',
  '\u{1F9D1}\u200D\u{1F3A8} artist painter',
  '\u{1F9D1}\u200D\u2708\uFE0F pilot',
  '\u{1F9D1}\u200D\u{1F680} astronaut',
  '\u{1F9D1}\u200D\u{1F692} firefighter',
  '\u{1F46D} women holding hands',
  '\u{1F46B} woman and man holding hands',
  '\u{1F46C} men holding hands',
  '\u{1F48F} kiss',
  '\u{1F491} couple with heart',
  '\u{1F46A} family',
  '\u{1FAC2} people hugging',
  '\u{1F464} bust in silhouette',
  '\u{1F465} busts in silhouette',
  '\u{1F463} footprints',
];

export const PEOPLE = PEOPLE_TEXT.map((line) => {
  const i = line.indexOf(' ');
  return { emoji: line.slice(0, i), tags: line.slice(i + 1).split(' ') };
});

// --------------------------------------------------------------------- flags

const COUNTRIES = 'AC Ascension Island|AD Andorra|AE United Arab Emirates|AF Afghanistan|AG Antigua and Barbuda|AI Anguilla|AL Albania|AM Armenia|AO Angola|AQ Antarctica|AR Argentina|AS American Samoa|AT Austria|AU Australia|AW Aruba|AX Aland Islands|AZ Azerbaijan|BA Bosnia and Herzegovina|BB Barbados|BD Bangladesh|BE Belgium|BF Burkina Faso|BG Bulgaria|BH Bahrain|BI Burundi|BJ Benin|BL St Barthelemy|BM Bermuda|BN Brunei|BO Bolivia|BQ Caribbean Netherlands|BR Brazil|BS Bahamas|BT Bhutan|BV Bouvet Island|BW Botswana|BY Belarus|BZ Belize|CA Canada|CC Cocos Islands|CD Congo Kinshasa DR Congo|CF Central African Republic|CG Congo Brazzaville|CH Switzerland|CI Ivory Coast|CK Cook Islands|CL Chile|CM Cameroon|CN China|CO Colombia|CP Clipperton Island|CR Costa Rica|CU Cuba|CV Cape Verde|CW Curacao|CX Christmas Island|CY Cyprus|CZ Czechia Czech Republic|DE Germany|DG Diego Garcia|DJ Djibouti|DK Denmark|DM Dominica|DO Dominican Republic|DZ Algeria|EA Ceuta and Melilla|EC Ecuador|EE Estonia|EG Egypt|EH Western Sahara|ER Eritrea|ES Spain|ET Ethiopia|EU European Union|FI Finland|FJ Fiji|FK Falkland Islands|FM Micronesia|FO Faroe Islands|FR France|GA Gabon|GB United Kingdom UK Britain|GD Grenada|GE Georgia|GF French Guiana|GG Guernsey|GH Ghana|GI Gibraltar|GL Greenland|GM Gambia|GN Guinea|GP Guadeloupe|GQ Equatorial Guinea|GR Greece|GS South Georgia|GT Guatemala|GU Guam|GW Guinea-Bissau|GY Guyana|HK Hong Kong|HM Heard Island|HN Honduras|HR Croatia|HT Haiti|HU Hungary|IC Canary Islands|ID Indonesia|IE Ireland|IL Israel|IM Isle of Man|IN India|IO British Indian Ocean Territory|IQ Iraq|IR Iran|IS Iceland|IT Italy|JE Jersey|JM Jamaica|JO Jordan|JP Japan|KE Kenya|KG Kyrgyzstan|KH Cambodia|KI Kiribati|KM Comoros|KN St Kitts and Nevis|KP North Korea|KR South Korea|KW Kuwait|KY Cayman Islands|KZ Kazakhstan|LA Laos|LB Lebanon|LC St Lucia|LI Liechtenstein|LK Sri Lanka|LR Liberia|LS Lesotho|LT Lithuania|LU Luxembourg|LV Latvia|LY Libya|MA Morocco|MC Monaco|MD Moldova|ME Montenegro|MF St Martin|MG Madagascar|MH Marshall Islands|MK North Macedonia|ML Mali|MM Myanmar Burma|MN Mongolia|MO Macao|MP Northern Mariana Islands|MQ Martinique|MR Mauritania|MS Montserrat|MT Malta|MU Mauritius|MV Maldives|MW Malawi|MX Mexico|MY Malaysia|MZ Mozambique|NA Namibia|NC New Caledonia|NE Niger|NF Norfolk Island|NG Nigeria|NI Nicaragua|NL Netherlands Holland|NO Norway|NP Nepal|NR Nauru|NU Niue|NZ New Zealand|OM Oman|PA Panama|PE Peru|PF French Polynesia|PG Papua New Guinea|PH Philippines|PK Pakistan|PL Poland|PM St Pierre and Miquelon|PN Pitcairn Islands|PR Puerto Rico|PS Palestine|PT Portugal|PW Palau|PY Paraguay|QA Qatar|RE Reunion|RO Romania|RS Serbia|RU Russia|RW Rwanda|SA Saudi Arabia|SB Solomon Islands|SC Seychelles|SD Sudan|SE Sweden|SG Singapore|SH St Helena|SI Slovenia|SJ Svalbard and Jan Mayen|SK Slovakia|SL Sierra Leone|SM San Marino|SN Senegal|SO Somalia|SR Suriname|SS South Sudan|ST Sao Tome and Principe|SV El Salvador|SX Sint Maarten|SY Syria|SZ Eswatini Swaziland|TA Tristan da Cunha|TC Turks and Caicos Islands|TD Chad|TF French Southern Territories|TG Togo|TH Thailand|TJ Tajikistan|TK Tokelau|TL Timor-Leste|TM Turkmenistan|TN Tunisia|TO Tonga|TR Turkey Turkiye|TT Trinidad and Tobago|TV Tuvalu|TW Taiwan|TZ Tanzania|UA Ukraine|UG Uganda|UM US Outlying Islands|UN United Nations|US United States USA America|UY Uruguay|UZ Uzbekistan|VA Vatican City|VC St Vincent and Grenadines|VE Venezuela|VG British Virgin Islands|VI US Virgin Islands|VN Vietnam|VU Vanuatu|WF Wallis and Futuna|WS Samoa|XK Kosovo|YE Yemen|YT Mayotte|ZA South Africa|ZM Zambia|ZW Zimbabwe';

// A letter as its regional indicator, two of which make a flag.
const regional = (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65);

const countryFlags = COUNTRIES.split('|').map((entry) => {
  const code = entry.slice(0, 2);
  return { emoji: regional(code[0]) + regional(code[1]), tags: [code.toLowerCase(), ...entry.slice(3).toLowerCase().split(' ')] };
});

// England, Scotland and Wales are a black flag spelled out in tag letters.
const tagFlag = (name) => String.fromCodePoint(0x1f3f4, ...Array.from(name).map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f);

const SPECIAL = [
  { emoji: '\u{1F3C1}', tags: ['chequered', 'checkered', 'race', 'finish'] },
  { emoji: '\u{1F6A9}', tags: ['triangular', 'red', 'flag'] },
  { emoji: '\u{1F38C}', tags: ['crossed', 'flags', 'japan'] },
  { emoji: '\u{1F3F4}', tags: ['black', 'flag'] },
  { emoji: '\u{1F3F3}\uFE0F', tags: ['white', 'flag', 'surrender'] },
  { emoji: '\u{1F3F3}\uFE0F\u200D\u{1F308}', tags: ['rainbow', 'pride', 'flag'] },
  { emoji: '\u{1F3F3}\uFE0F\u200D\u26A7\uFE0F', tags: ['transgender', 'flag'] },
  { emoji: '\u{1F3F4}\u200D\u2620\uFE0F', tags: ['pirate', 'flag'] },
  { emoji: tagFlag('gbeng'), tags: ['england', 'english'] },
  { emoji: tagFlag('gbsct'), tags: ['scotland', 'scottish'] },
  { emoji: tagFlag('gbwls'), tags: ['wales', 'welsh'] },
];

// The UK and the flags of the places BOA's members come from first, then A to Z.
const FIRST = ['GB', 'NG', 'GH', 'JM', 'US', 'ZA', 'KE', 'TT', 'BB', 'SO', 'ET', 'ZW', 'UG', 'SL', 'CM', 'SN', 'CI', 'BR', 'CA', 'FR', 'DE', 'ES', 'PT', 'IT', 'IE'];
const firstFlags = FIRST.map((code) => countryFlags.find((f) => f.tags[0] === code.toLowerCase())).filter(Boolean);
export const FLAGS = [
  SPECIAL[8],
  SPECIAL[9],
  SPECIAL[10],
  ...firstFlags,
  ...countryFlags.filter((f) => !firstFlags.includes(f)),
  ...SPECIAL.slice(0, 8),
];
