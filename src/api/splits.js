import { check, need } from './posts';

// Splits: digital split sheets (who owns what share of a song, beat or
// video) and invoices for the work. The database keeps a signed sheet
// signed (supabase/migrations: split_sheets, split_parties, invoices):
// changing a share clears everyone's agreement, and the last party to
// agree signs it.

export const WORK_TYPES = [
  { id: 'song', label: 'Song' },
  { id: 'beat', label: 'Beat' },
  { id: 'video', label: 'Video' },
  { id: 'other', label: 'Other' },
];

export const SPLIT_ROLES = ['Producer', 'Songwriter', 'Vocalist', 'Featured artist', 'Engineer', 'Director', 'Editor', 'Composer'];

export const CURRENCIES = [
  { id: 'GBP', symbol: '£' },
  { id: 'USD', symbol: '$' },
  { id: 'EUR', symbol: '€' },
  { id: 'NGN', symbol: '₦' },
  { id: 'GHS', symbol: 'GH₵' },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** A share typed as "50", "50%" or "33.5" to a number (NaN if it isn't one). */
export const parseShare = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[%\s]/g, '')));

/** The shares added up, to 2 decimal places. */
export const totalShare = (parties) => round2(parties.reduce((sum, p) => sum + (parseShare(p.share) || 0), 0));

/** Whether a split sheet can be saved: null if so, else why not. */
export function splitProblem({ title = '', parties = [] }) {
  if (title.trim().length < 2) return 'Name the work this split is for.';
  if (parties.length < 2) return 'A split needs at least two people.';
  const ids = new Set();
  for (const p of parties) {
    if (!p.user_id) return 'Choose a Hub member for every line.';
    if (ids.has(p.user_id)) return 'Each person can only be on a split once.';
    ids.add(p.user_id);
    if (!p.role?.trim()) return 'Give everyone a role.';
    const share = parseShare(p.share);
    if (!Number.isFinite(share) || share <= 0 || share > 100) return 'Every share must be more than 0% and at most 100%.';
  }
  const total = totalShare(parties);
  if (total !== 100) return `The shares add up to ${total}%. They need to come to exactly 100%.`;
  return null;
}

/** Splits 100% evenly across n people, the rounding left on the first. */
export function evenShares(n) {
  if (n < 1) return [];
  const each = Math.floor((100 / n) * 100) / 100;
  const shares = Array(n).fill(each);
  shares[0] = round2(100 - each * (n - 1));
  return shares;
}

/** Your sheets (made by you or with you on them), newest first, each with its parties. */
export async function listSheets() {
  const sb = need();
  const sheets = check(await sb.from('split_sheets').select('*').order('updated_at', { ascending: false }).limit(100)) ?? [];
  if (!sheets.length) return [];
  const parties = check(await sb.from('split_parties').select('*').in('sheet_id', sheets.map((s) => s.id)).order('position')) ?? [];
  return sheets.map((s) => ({ ...s, parties: parties.filter((p) => p.sheet_id === s.id) }));
}

export async function getSheet(id) {
  const sb = need();
  const sheet = check(await sb.from('split_sheets').select('*').eq('id', id).maybeSingle());
  if (!sheet) return null;
  const parties = check(await sb.from('split_parties').select('*').eq('sheet_id', id).order('position')) ?? [];
  return { ...sheet, parties };
}

const partyRows = (sheetId, parties) =>
  parties.map((p, i) => ({ sheet_id: sheetId, user_id: p.user_id, role: p.role.trim().slice(0, 40), share: round2(parseShare(p.share)), position: i }));

/** Saves a new draft sheet with its parties. Throws if it doesn't add up. */
export async function createSheet(userId, { title, workType = 'song', notes = '', parties }) {
  const problem = splitProblem({ title, parties });
  if (problem) throw new Error(problem);
  const sb = need();
  const sheet = check(
    await sb.from('split_sheets').insert({ created_by: userId, title: title.trim(), work_type: workType, notes: notes.trim().slice(0, 1000) }).select('*').single(),
  );
  check(await sb.from('split_parties').insert(partyRows(sheet.id, parties)));
  return getSheet(sheet.id);
}

/** Rewrites a draft's details and parties (everyone's agreement clears). */
export async function updateSheet(sheetId, { title, workType, notes = '', parties }) {
  const problem = splitProblem({ title, parties });
  if (problem) throw new Error(problem);
  const sb = need();
  check(await sb.from('split_sheets').update({ title: title.trim(), work_type: workType, notes: notes.trim().slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', sheetId));
  check(await sb.from('split_parties').delete().eq('sheet_id', sheetId));
  check(await sb.from('split_parties').insert(partyRows(sheetId, parties)));
  return getSheet(sheetId);
}

/** You agree to the sheet as it stands. Returns { signed, waiting }. */
export async function agreeToSheet(sheetId) {
  return check(await need().rpc('agree_to_split', { sheet: sheetId }));
}

export async function deleteSheet(sheetId) {
  check(await need().from('split_sheets').delete().eq('id', sheetId));
}

/** 'signed', 'waiting on you', 'waiting on 2', or 'needs agreement'. */
export function sheetStatus(sheet, myId) {
  if (sheet.status === 'signed') return { tone: 'signed', label: 'Signed' };
  const waiting = sheet.parties.filter((p) => !p.agreed_at);
  if (waiting.some((p) => p.user_id === myId)) return { tone: 'you', label: 'Waiting on you' };
  if (waiting.length) return { tone: 'others', label: `Waiting on ${waiting.length}` };
  return { tone: 'others', label: 'Needs agreement' };
}

// ---------------------------------------------------------------- invoices

export const symbolOf = (currency) => CURRENCIES.find((c) => c.id === currency)?.symbol ?? '';

/** £1,250.00 */
export function money(amount, currency = 'GBP') {
  const n = round2(amount);
  return `${symbolOf(currency)}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const lineTotal = (item) => round2((Number(item.qty) || 0) * (Number(String(item.rate ?? '').replace(/[^0-9.]/g, '')) || 0));
export const invoiceTotal = (items) => round2(items.reduce((sum, i) => sum + lineTotal(i), 0));

/** Whether an invoice can be saved: null if so, else why not. */
export function invoiceProblem({ clientName = '', clientEmail = '', items = [] }) {
  if (!clientName.trim()) return 'Who is the invoice for?';
  if (clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) return "That email doesn't look right.";
  const real = items.filter((i) => i.description?.trim());
  if (!real.length) return 'Add at least one line: what the work was.';
  if (real.some((i) => !(Number(i.qty) > 0) || lineTotal(i) <= 0)) return 'Every line needs a quantity and a rate.';
  return null;
}

/** BOA-2026-0007: the year and your next number. */
export function nextInvoiceNumber(existing = [], year = new Date().getFullYear()) {
  const prefix = `BOA-${year}-`;
  const top = existing.map((i) => i.number).filter((n) => n?.startsWith(prefix)).map((n) => Number(n.slice(prefix.length)) || 0);
  return `${prefix}${String((top.length ? Math.max(...top) : 0) + 1).padStart(4, '0')}`;
}

export async function listInvoices() {
  return check(await need().from('invoices').select('*').order('created_at', { ascending: false }).limit(100)) ?? [];
}

export async function createInvoice(userId, { number, clientId = null, clientName, clientEmail = '', sheetId = null, items, currency = 'GBP', notes = '', dueDate = null }) {
  const problem = invoiceProblem({ clientName, clientEmail, items });
  if (problem) throw new Error(problem);
  const lines = items
    .filter((i) => i.description?.trim())
    .map((i) => ({ description: i.description.trim().slice(0, 200), qty: Number(i.qty), rate: round2(Number(String(i.rate).replace(/[^0-9.]/g, ''))) }));
  return check(
    await need()
      .from('invoices')
      .insert({
        number,
        issuer_id: userId,
        client_id: clientId,
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        sheet_id: sheetId,
        items: lines,
        currency,
        total: invoiceTotal(lines),
        notes: notes.trim().slice(0, 1000),
        due_date: dueDate,
      })
      .select('*')
      .single(),
  );
}

export async function setInvoiceStatus(id, status) {
  return check(await need().from('invoices').update({ status }).eq('id', id).select('*').single());
}

export async function deleteInvoice(id) {
  check(await need().from('invoices').delete().eq('id', id));
}

/** The invoice as plain text, for sharing by message or email. */
export function invoiceText(inv, issuer) {
  const lines = inv.items.map((i) => `${i.description}  ${i.qty} x ${money(i.rate, inv.currency)} = ${money(lineTotal(i), inv.currency)}`);
  return [
    `INVOICE ${inv.number}`,
    `From: ${issuer?.display_name || `@${issuer?.username ?? ''}`} (BOA HUB)`,
    `To: ${inv.client_name}${inv.client_email ? ` <${inv.client_email}>` : ''}`,
    inv.due_date ? `Due: ${inv.due_date}` : null,
    '',
    ...lines,
    '',
    `Total: ${money(inv.total, inv.currency)}`,
    inv.notes ? `\n${inv.notes}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}
