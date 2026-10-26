import { check, need } from './posts';

// The Cipher: live audio rooms (listening parties, freestyles, jams) on
// the Hub. Free to join. The database holds the rooms and who's on stage
// (supabase/migrations: live_sessions, session_participants); only a
// room's host can bring someone up to the mic or end it.

export const ROOM_KINDS = [
  { id: 'listening_party', label: 'Listening party', icon: 'disc' },
  { id: 'freestyle', label: 'Freestyle', icon: 'mic' },
  { id: 'jam', label: 'Jam session', icon: 'musical-notes' },
  { id: 'premiere', label: 'Premiere', icon: 'sparkles' },
  { id: 'talk', label: 'Studio talk', icon: 'chatbubbles' },
];
export const kindOf = (id) => ROOM_KINDS.find((k) => k.id === id) ?? ROOM_KINDS[0];

export const MAX_SPEAKERS = 12;

/** Whether a room can be opened with this title: null if so, else why not. */
export function roomProblem({ title = '' } = {}) {
  const t = title.trim();
  if (t.length < 3) return 'Give the room a name (3 characters or more).';
  if (t.length > 80) return 'Keep the name under 80 characters.';
  return null;
}

/** Live rooms, newest first. */
export async function listLiveRooms(limit = 30) {
  return check(await need().from('live_sessions').select('*').eq('status', 'live').order('started_at', { ascending: false }).limit(limit)) ?? [];
}

/** How many people are in each of these rooms right now. */
export async function roomHeadcounts(ids) {
  if (!ids.length) return {};
  const rows = check(await need().from('session_participants').select('session_id').in('session_id', ids).is('left_at', null)) ?? [];
  return rows.reduce((acc, r) => ({ ...acc, [r.session_id]: (acc[r.session_id] ?? 0) + 1 }), {});
}

/** Opens a room with you as its host, already on the mic. */
export async function openRoom(userId, { title, kind = 'listening_party', description = '' }) {
  const problem = roomProblem({ title });
  if (problem) throw new Error(problem);
  const sb = need();
  const room = check(
    await sb
      .from('live_sessions')
      .insert({ host_id: userId, title: title.trim(), kind, description: description.trim().slice(0, 500) })
      .select('*')
      .single(),
  );
  check(await sb.from('session_participants').upsert({ session_id: room.id, user_id: userId, left_at: null, muted: false }, { onConflict: 'session_id,user_id' }));
  return room;
}

export async function getRoom(id) {
  return check(await need().from('live_sessions').select('*').eq('id', id).maybeSingle());
}

/** Takes a seat (as a listener, unless it's your room). */
export async function joinRoom(roomId, userId) {
  check(
    await need()
      .from('session_participants')
      .upsert({ session_id: roomId, user_id: userId, left_at: null, hand_raised: false, joined_at: new Date().toISOString() }, { onConflict: 'session_id,user_id' }),
  );
}

export async function leaveRoom(roomId, userId) {
  check(await need().from('session_participants').update({ left_at: new Date().toISOString(), hand_raised: false }).eq('session_id', roomId).eq('user_id', userId));
}

/** Everyone in the room now, host first, then speakers, then listeners. */
export async function listParticipants(roomId) {
  return check(await need().from('session_participants').select('*').eq('session_id', roomId).is('left_at', null).order('joined_at', { ascending: true })) ?? [];
}

const seat = (roomId, userId, patch) => need().from('session_participants').update(patch).eq('session_id', roomId).eq('user_id', userId);

export const raiseHand = async (roomId, userId, up = true) => check(await seat(roomId, userId, { hand_raised: up }));
export const setMuted = async (roomId, userId, muted) => check(await seat(roomId, userId, { muted }));
/** Host only (the database refuses anyone else): brings someone up to the mic, or back down. */
export const setRole = async (roomId, userId, role) => check(await seat(roomId, userId, { role, hand_raised: false, muted: true }));

export async function setNowSpinning(roomId, text) {
  check(await need().from('live_sessions').update({ now_playing: text.trim().slice(0, 120) || null }).eq('id', roomId));
}

export async function endRoom(roomId) {
  check(await need().from('live_sessions').update({ status: 'ended' }).eq('id', roomId));
}

const ORDER = { host: 0, speaker: 1, listener: 2 };

/** { stage, audience, hands } from a room's participants. */
export function arrange(participants) {
  const sorted = [...participants].sort((a, b) => ORDER[a.role] - ORDER[b.role] || new Date(a.joined_at) - new Date(b.joined_at));
  return {
    stage: sorted.filter((p) => p.role !== 'listener'),
    audience: sorted.filter((p) => p.role === 'listener'),
    hands: sorted.filter((p) => p.role === 'listener' && p.hand_raised),
  };
}

/** "Live for 12 min", "Live for 1 hr 5 min". */
export function liveFor(startedAt, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  if (mins < 1) return 'Just started';
  if (mins < 60) return `Live for ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Live for ${h} hr${m ? ` ${m} min` : ''}`;
}
