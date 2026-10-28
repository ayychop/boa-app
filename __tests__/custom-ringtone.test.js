// Your own song as the ringtone: chosen from the phone, copied into the
// app, rung instead of the built-in, and let go cleanly.

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
// A small file system that can copy: what's on the phone, by uri.
jest.mock('expo-file-system', () => {
  const files = new Set();
  const join = (...parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory {
    constructor(...parts) {
      this.uri = join(...parts);
    }
    create() {}
  }
  class File {
    constructor(...parts) {
      this.uri = join(...parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    copy(dest) {
      if (!files.has(this.uri)) throw new Error('no such file');
      files.add(dest.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' }, cache: { uri: 'file:///cache' } }, __files: files };
});

const DocumentPicker = require('expo-document-picker');
const { __files: files } = require('expo-file-system');
const { createAudioPlayer } = require('expo-audio');
const ringtone = require('../src/calls/ringtone');

const pickSong = (asset) => {
  if (asset) files.add(asset.uri);
  DocumentPicker.getDocumentAsync.mockResolvedValueOnce(asset ? { canceled: false, assets: [asset] } : { canceled: true, assets: null });
};

afterEach(async () => {
  ringtone.stopRingtone();
  await ringtone.setCustomRingtone(null);
});

test('a song from the phone is copied into BOA and rings instead of the built-in', async () => {
  pickSong({ uri: 'file:///picked/Midnight Drive.mp3', name: 'Midnight Drive.mp3', size: 4_000_000 });
  const song = await ringtone.pickCustomRingtone();
  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/*', copyToCacheDirectory: true }));
  expect(song.name).toBe('Midnight Drive');
  expect(song.uri).toMatch(/^file:\/\/\/docs\/ringtones\/custom-\d+\.mp3$/);
  expect(files.has(song.uri)).toBe(true);

  // The original can go: BOA has its own copy.
  files.delete('file:///picked/Midnight Drive.mp3');
  ringtone.startRingtone('rnb');
  expect(createAudioPlayer).toHaveBeenLastCalledWith({ uri: song.uri });
  ringtone.stopRingtone();

  // Previewing a built-in still plays the built-in.
  ringtone.previewRingtone('afrobeats');
  expect(createAudioPlayer).toHaveBeenLastCalledWith(ringtone.ringtoneById('afrobeats').asset);
  ringtone.stopPreview();
  ringtone.previewRingtone(ringtone.CUSTOM_RINGTONE);
  expect(createAudioPlayer).toHaveBeenLastCalledWith({ uri: song.uri });
  ringtone.stopPreview();
});

test('letting it go deletes the copy and the built-in rings again', async () => {
  pickSong({ uri: 'file:///picked/a.m4a', name: 'a.m4a', size: 1000 });
  const song = await ringtone.pickCustomRingtone();
  const heard = jest.fn();
  const off = ringtone.onCustomRingtone(heard);
  await ringtone.setCustomRingtone(null);
  off();
  expect(heard).toHaveBeenCalledWith(null);
  expect(files.has(song.uri)).toBe(false);
  ringtone.startRingtone('bashment');
  expect(createAudioPlayer).toHaveBeenLastCalledWith(ringtone.ringtoneById('bashment').asset);
});

test('backing out changes nothing; a huge file is turned away with a reason', async () => {
  pickSong(null);
  expect(await ringtone.pickCustomRingtone()).toBeNull();
  expect(ringtone.customRingtone()).toBeNull();

  pickSong({ uri: 'file:///picked/album.flac', name: 'album.flac', size: 400 * 1024 * 1024 });
  await expect(ringtone.pickCustomRingtone()).rejects.toThrow(/over 30 MB/);
  expect(ringtone.customRingtone()).toBeNull();
});

test('a song whose copy has gone missing falls back to the built-in, never silence', async () => {
  pickSong({ uri: 'file:///picked/b.mp3', name: 'b.mp3', size: 1000 });
  const song = await ringtone.pickCustomRingtone();
  files.delete(song.uri);
  expect(ringtone.customRingtone()).toBeNull();
  ringtone.startRingtone('hiphop');
  expect(createAudioPlayer).toHaveBeenLastCalledWith(ringtone.ringtoneById('hiphop').asset);
});
