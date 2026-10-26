// How BOA video calls look and sound. Models and creatives take these
// calls, so picture quality wins once the call is live: HD, a quality-first
// encoder, and Agora's clear-vision pipeline on in every call so a dim
// bedroom or a backlit window still looks good. While it rings the camera
// starts small (PREVIEW) so it comes on almost at once, then steps up to
// ENCODER when the call connects.
//
// Plain numbers (Agora's enum values, named beside each one) so this file
// loads anywhere, tests included; src/calls/media.native.js hands them to
// the engine.

/** 720p at 30 fps for the live call. */
export const HD = Object.freeze({ width: 1280, height: 720, fps: 30 });

/** setVideoEncoderConfiguration while it rings: 360p at 15 fps opens the camera fast. */
export const PREVIEW = Object.freeze({
  dimensions: { width: 640, height: 360 },
  frameRate: 15,
  bitrate: 0,
  minBitrate: -1,
  orientationMode: 0,
  degradationPreference: 0,
  advanceOptions: { compressionPreference: 1 },
});

/** setVideoEncoderConfiguration once the call is connected. */
export const ENCODER = Object.freeze({
  dimensions: { width: HD.width, height: HD.height },
  frameRate: HD.fps,
  bitrate: 2000, // Kbps: steady, clean 720p30 for a face and a room
  minBitrate: -1, // DEFAULT_MIN_BITRATE
  orientationMode: 0, // OrientationModeAdaptive: portrait phones send portrait video
  // MaintainQuality: on a weak network keep the picture sharp and give up
  // frames first. A slightly lower frame rate reads far better on a face
  // than a soft, blocky one.
  degradationPreference: 0,
  advanceOptions: { compressionPreference: 1 }, // PreferQuality
});

/**
 * setCameraCapturerConfiguration: front camera. No fixed format, so the
 * camera opens at the encoder's size (PREVIEW, then ENCODER) instead of
 * spinning up full resolution before anyone has answered.
 */
export const CAPTURE = Object.freeze({
  cameraDirection: 1, // CameraFront
  followEncodeDimensionRatio: true,
});

/** setCameraStabilizationMode: off. Stabilization delays the camera's first frames. */
export const STABILIZATION_OFF = -1; // CameraStabilizationModeOff

/**
 * Any light: denoising and low-light enhancement both run in auto mode, so
 * they only work when the room is dark and leave a well-lit face alone.
 * High-quality low light needs high-quality denoising alongside it (Agora's
 * rule), so the two are always set as a pair.
 */
export const DENOISER = Object.freeze({ mode: 0, level: 0 }); // VideoDenoiserAuto, VideoDenoiserLevelHighQuality
export const LOW_LIGHT = Object.freeze({ mode: 0, level: 0 }); // LowLightEnhanceAuto, LowLightEnhanceLevelHighQuality

/**
 * 48 kHz voice (AudioProfileMusicStandard) in the chatroom scenario: calls
 * play on the loudspeaker, and chatroom uses the phone's in-call audio path,
 * which brings the hardware echo canceller in alongside Agora's own.
 */
export const AUDIO = Object.freeze({ profile: 2, scenario: 5 }); // AudioScenarioChatroom

/**
 * setParameters, before any join: Agora's echo cancellation (AEC), noise
 * suppression (ANS) and automatic gain control (AGC), switched on
 * explicitly so no device profile can leave one off. AI noise suppression
 * (setAINSMode) runs on top in balanced mode.
 */
export const AUDIO_PROCESSING = Object.freeze(['{"che.audio.aec.enable":true}', '{"che.audio.ans.enable":true}', '{"che.audio.agc.enable":true}']);
export const AINS_BALANCED = 0; // AinsModeBalanced

/**
 * setVideoScenario: ApplicationScenario1v1, Agora's tuning for two-person
 * calls (low latency, fast first frame). Dual stream stays off: with one
 * viewer there's no one to send a second, smaller stream to.
 */
export const VIDEO_SCENARIO = 2; // ApplicationScenario1v1
