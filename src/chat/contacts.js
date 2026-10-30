import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The Contact Book: names you've given people, kept on this phone only (the
// other person never sees it, and it isn't sent anywhere). Save "7thDon" as
// "David" and the inbox, the chat header and the profile all say David.
//
// Stored as { [userId]: { name, handle, savedAt } }. `handle` is the @username
// at the time, so the book can still say who someone is if they rename.

const KEY = 'boa.contacts.v1';
export const NAME_MAX = 40;

let book = {};
let hydrated = false;
let loading = null;
const listeners = new Set();
let snapshot = { book, version: 0 };

const emit = () => {
  snapshot = { book, version: snapshot.version + 1 };
  listeners.forEach((l) => l());
};

/** A name as it will be saved: trimmed, single spaces, no control characters, at most NAME_MAX long. */
export function cleanAlias(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

/** Reads the book from the phone (once). Safe to call as often as you like. */
export function loadContacts() {
  if (hydrated) return Promise.resolve(book);
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : {};
        const next = {};
        if (saved && typeof saved === 'object') {
          for (const [id, c] of Object.entries(saved)) {
            const name = cleanAlias(c?.name);
            if (id && name) next[id] = { name, handle: typeof c?.handle === 'string' ? c.handle : '', savedAt: Number(c?.savedAt) || 0 };
          }
        }
        // Anything saved while it was loading wins.
        book = { ...next, ...book };
      })
      .catch(() => {})
      .then(() => {
        hydrated = true;
        emit();
        return book;
      });
  }
  return loading;
}

const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(book)).catch(() => {});

/** Saves (or renames) a contact. An empty name removes them. Returns the saved name, or null. */
export async function saveContact(id, name, handle = '') {
  if (!id) return null;
  await loadContacts();
  const clean = cleanAlias(name);
  if (!clean) {
    await removeContact(id);
    return null;
  }
  book = { ...book, [id]: { name: clean, handle: String(handle ?? '').replace(/^@/, ''), savedAt: Date.now() } };
  emit();
  await persist();
  return clean;
}

export async function removeContact(id) {
  await loadContacts();
  if (!(id in book)) return;
  const { [id]: _gone, ...rest } = book;
  book = rest;
  emit();
  await persist();
}

const subscribe = (listener) => {
  listeners.add(listener);
  loadContacts();
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;

/** The whole book, live: { [userId]: { name, handle, savedAt } }. */
export function useContactBook() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).book;
}

/** The name you've saved this person under, or null. */
export function useAlias(id) {
  return useContactBook()[id]?.name ?? null;
}

/** What to call someone: your saved name for them, else their display name, else @username. */
export function nameFor(person, alias, fallback = 'BOA HUB member') {
  return alias || person?.display_name || (person?.username ? `@${person.username}` : fallback);
}

/** Saved contacts as a list, A to Z. */
export const contactList = (b) =>
  Object.entries(b)
    .map(([id, c]) => ({ id, ...c }))
    .sort((x, y) => x.name.localeCompare(y.name));

/** Test helper. */
export function __reset() {
  book = {};
  hydrated = false;
  loading = null;
  snapshot = { book, version: snapshot.version + 1 };
}
