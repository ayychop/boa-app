// How BOA video calls look and sound. Models and creatives take these
// calls, so picture quality wins over everything else: full HD from the
// camera, a quality-first encoder, and Agora's clear-vision pipeline on in
// every call so a dim bedroom or a backlit window still looks good.
//
// Plain numbers (Agora's enum values, named beside each one) so this file
// loads anywhere, tests included; src/calls/media.native.js hands them to
// the engine.

/** 1080p at 30 fps, the most a phone camera call carries well. */
export const HD = Object.freeze({ width: 1920, height: 1080, fps: 30 });

/** setVideoEncoderConfiguration. */
export const ENCODER = Object.freeze({
  dimensions: { width: HD.width, height: HD.height },
  frameRate: HD.fps,
  bitrate: 0, // STANDARD_BITRATE: Agora sizes it for the resolution and raises it on good networks
  minBitrate: -1, // DEFAULT_MIN_BITRATE
  orientationMode: 0, // OrientationModeAdaptive: portrait phones send portrait video
  // MaintainQuality: on a weak network keep the picture sharp and give up
  // frames first. A slightly lower frame rate reads far better on a face
  // than a soft, blocky one.
  degradationPreference: 0,
  advanceOptions: { compressionPreference: 1 }, // PreferQuality
});

/** setCameraCapturerConfiguration: capture at the size we send, front camera. */
export const CAPTURE = Object.freeze({
  cameraDirection: 1, // CameraFront
  format: { width: HD.width, height: HD.height, fps: HD.fps },
  followEncodeDimensionRatio: true,
});

/**
 * Any light: denoising and low-light enhancement both run in auto mode, so
 * they only work when the room is dark and leave a well-lit face alone.
 * High-quality low light needs high-quality denoising alongside it (Agora's
 * rule), so the two are always set as a pair.
 */
export const DENOISER = Object.freeze({ mode: 0, level: 0 }); // VideoDenoiserAuto, VideoDenoiserLevelHighQuality
export const LOW_LIGHT = Object.freeze({ mode: 0, level: 0 }); // LowLightEnhanceAuto, LowLightEnhanceLevelHighQuality

/** 48 kHz voice (AudioProfileMusicStandard) in the default call scenario. */
export const AUDIO = Object.freeze({ profile: 2, scenario: 0 });
