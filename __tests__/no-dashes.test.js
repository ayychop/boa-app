// BOA's house rule: no hyphens or em dashes in the text people read, and the
// roster is Jeremy, Chan and the rest, without Tobi Adeyemi or Aaron Russell.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.join(__dirname, '..');

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

// Things that look like text but are not read by people: web addresses, licence
// and domain names, locale codes, headers, log lines, SVG paths and ids.
const NOT_TEXT = [/https?:/, /^\[/, /^url\(/, /^M[\d. -]/, /^l /i, /CC BY/, /en-GB/, /Open-Meteo/, /Icy-/, /^BOA-/, /autoplay/, /^-?\d/, /^[a-z0-9_.:/#-]+$/, /^AC Ascension/, /px -?\d/];
const DASH = /[A-Za-z0-9)]-[A-Za-z0-9(]|\s[-–—]\s|[–—]/;

function offenders() {
  const found = [];
  for (const f of [...files(path.join(ROOT, 'src')), path.join(ROOT, 'App.js')]) {
    const rel = path.relative(ROOT, f);
    const ast = parser.parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    const check = (value, line) => {
      const t = value.trim();
      if (!t || !DASH.test(t) || NOT_TEXT.some((r) => r.test(t))) return;
      found.push(`${rel}:${line} ${JSON.stringify(t.slice(0, 90))}`);
    };
    traverse(ast, {
      StringLiteral(p) {
        const parent = p.parent;
        if (parent.type === 'ImportDeclaration' || parent.type === 'ExportAllDeclaration' || parent.type === 'ExportNamedDeclaration') return;
        if (parent.type === 'CallExpression' && parent.callee.name === 'require') return;
        if (parent.type === 'ObjectProperty' && parent.key === p.node) return;
        if (parent.type === 'JSXAttribute' && ['testID', 'accessibilityRole', 'resizeMode', 'mode'].includes(parent.name.name)) return;
        check(p.node.value, p.node.loc.start.line);
      },
      TemplateElement: (p) => check(p.node.value.cooked || '', p.node.loc.start.line),
      JSXText: (p) => check(p.node.value, p.node.loc.start.line),
    });
  }
  return found;
}

describe('no hyphens or dashes in app text', () => {
  test('every string people can read is free of them', () => {
    // Ids, slugs and keys (kebab case with no spaces) are fine: nobody reads them.
    const real = offenders().filter((o) => !/^\S+ "[a-z0-9]+(-[a-z0-9]+)+"$/.test(o) && !/ "-"$/.test(o) && !/ "-\$?\{?/.test(o));
    expect(real).toEqual([]);
  });

  test('the bios and roles read cleanly', () => {
    const { talent, founders } = require('../src/data/boaContent');
    for (const p of [...talent, ...founders]) {
      expect(`${p.name} ${p.role} ${p.bio ?? ''}`).not.toMatch(/[-–—]/);
    }
  });

  test('plainText cleans what arrives from outside (radio station names)', () => {
    const { plainText } = require('../src/utils/plainText');
    expect(plainText('Love Radio - Reggae')).toBe('Love Radio, Reggae');
    expect(plainText('Radio Art — Smooth Jazz')).toBe('Radio Art, Smooth Jazz');
    expect(plainText('Hi-Fi Hip-Hop')).toBe('Hi Fi Hip Hop');
    expect(plainText('  BBC Radio 1  ')).toBe('BBC Radio 1');
  });
});

describe('the roster', () => {
  const { talent } = require('../src/data/boaContent');
  const all = JSON.stringify(talent);

  test('Tobi Adeyemi and Aaron Russell are gone', () => {
    expect(talent.map((t) => t.name)).not.toEqual(expect.arrayContaining(['Tobi Adeyemi']));
    expect(all).not.toMatch(/Tobi|Adeyemi|Aaron|Russell/i);
    expect(talent).toHaveLength(8);
  });

  test('nobody else in the source mentions them', () => {
    const hits = files(path.join(ROOT, 'src')).filter((f) => /tobi|adeyemi|aaron.?russell/i.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  test('photos stay for Rebecca, Sabeian, Jeremy Owusu and Chan Yel; initials for Jeremy Benson', () => {
    const by = (id) => talent.find((t) => t.id === id);
    expect(by('rebecca-soper').headshot).toBeTruthy();
    expect(by('sabeian-gilzene').headshot).toBeTruthy();
    expect(by('jeremy-owusu').headshot).toBeTruthy();
    expect(by('jeremy-benson').headshot).toBeNull();
    expect(by('chan-yel').headshot).toBeTruthy();
  });
});
