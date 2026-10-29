import fs from 'fs';
import path from 'path';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// BOA Hi-Fi shapes the radio's sound with Android audio effects (modules/boa-eq)
// attached to the player by its audio session id. ExoPlayer reports that id
// as 0 until it actually starts its audio renderer, so reading it at player
// creation (as the engine used to) bound the equaliser to session 0, where
// modules/boa-eq does nothing, and the sliders had no effect however far they
// were pushed. The fix attaches once a real id appears. jest-expo mocks the
// native engine, so this is guarded at the source, as the Kotlin effects are.
describe('BOA Hi-Fi attaches to the player once it is really playing', () => {
  const src = read('src/audio/engine.native.js');

  test('the equaliser is attached by a guarded helper, only for a real session id', () => {
    // A single place that attaches, skipping the unset id (0) ExoPlayer reports
    // before playback, and skipping a re-attach of an id already in use.
    expect(src).toMatch(/function attachEq\(\)/);
    expect(src).toMatch(/const id = player\.audioSessionId/);
    expect(src).toMatch(/if \(id > 0 && id !== eqSession\)/);
    expect(src).toMatch(/eq\.setSession\(id\)/);
  });

  test('it attaches when playback starts, not only when the player is built', () => {
    // The old bug: eq.setSession(player.audioSessionId) ran once at creation,
    // when the id is still 0. It must never read the id straight into setSession.
    expect(src).not.toMatch(/eq\.setSession\(player\.audioSessionId\)/);
    // attachEq is called from the "playing" branch of the status handler, so a
    // real id is picked up the moment the stream is live.
    const playing = src.slice(src.indexOf('if (s.playing && !s.isBuffering)'));
    expect(playing).toMatch(/attachEq\(\)/);
  });
});
