// How BOA video calls look and sound. Models and creatives take these
// calls, so picture quality wins once the call is live: 1080p, a quality-first
// encoder, and Agora's clear-vision pipeline on in every call so a dim
// bedroom or a backlit window still looks good. While it rings the camera
// starts small (PREVIEW) so it comes on almost at once, then steps up to
// ENCODER when the call connects.
//
// Plain numbers (Agora's enum values, named beside each one) so this file
// loads anywhere, tests included; src/calls/media.native.js hands them to
// the engine.

/** 1080p at 30 fps for the live call. */
export const HD = Object.freeze({ width: 1920, height: 1080, fps: 30 });

/**
 * Heat steps. Pixels per second is what heats the camera, ISP and encoder
 * (the old 720p60 "cool" mode was 55M px/s against 1080p30's 62M: it barely
 * cooled anything, and a Flip 7's Exynos kept climbing, worst on a charger).
 * Each step now cuts the work hard:
 *   1080p30  62M px/s   NOMINAL
 *    720p30  28M px/s   FAIR     (the phone is getting warm, or charging hot)
 *    540p24  12M px/s   WARNING  (hot)
 *    360p15   3M px/s   CRITICAL (very hot: the call carries on, picture small)
 */
export const WARM = Object.freeze({ width: 1280, height: 720, fps: 30 });
export const COOL = Object.freeze({ width: 960, height: 540, fps: 24 });
export const COLD = Object.freeze({ width: 640, height: 360, fps: 15 });

/** setVideoEncoderConfiguration while it rings: 360p at 15 fps opens the camera fast. */
export const PREVIEW = Object.freeze({
  dimensions: { width: 640, height: 360 },
  frameRate: 15,
  bitrate: 0,
  minBitrate: -1,
  orientationMode: 0,
  degradationPreference: 0,
  advanceOptions: { compressionPreference: 1 },
  mirrorMode: 2, // VideoMirrorModeDisabled: see ENCODER
});

/** setVideoEncoderConfiguration once the call is connected. */
export const ENCODER = Object.freeze({
  dimensions: { width: HD.width, height: HD.height },
  frameRate: HD.fps,
  bitrate: 3150, // Kbps: Agora's figure for clean 1080p30
  minBitrate: -1, // DEFAULT_MIN_BITRATE
  orientationMode: 0, // OrientationModeAdaptive: portrait phones send portrait video
  // MaintainQuality: on a weak network keep the picture sharp and give up
  // frames first. A slightly lower frame rate reads far better on a face
  // than a soft, blocky one.
  degradationPreference: 0,
  advanceOptions: { compressionPreference: 1 }, // PreferQuality
  // VideoMirrorModeDisabled: they see you the right way round (text on your
  // shirt reads), while your own preview is mirrored like a mirror
  // (LocalVideo's canvas).
  mirrorMode: 2,
});

/**
 * The live encoders for a warm, hot and very hot phone. Frames are given up
 * before faces: MaintainFramerate keeps motion smooth at the lower size, and
 * the hottest step is a small, light picture so the phone can cool while the
 * call carries on.
 */
const cooler = (size, bitrate) =>
  Object.freeze({
    dimensions: { width: size.width, height: size.height },
    frameRate: size.fps,
    bitrate, // Kbps
    minBitrate: -1,
    orientationMode: 0,
    degradationPreference: 1, // MaintainFramerate
    advanceOptions: { compressionPreference: 0 }, // PreferFrameRate: the lightest encode
    mirrorMode: 2,
  });
export const WARM_ENCODER = cooler(WARM, 1500); // FAIR
export const COOL_ENCODER = cooler(COOL, 800); // WARNING
export const COLD_ENCODER = cooler(COLD, 400); // CRITICAL

/** The live encoder for this thermal state: lighter at every step up in heat. */
export function encoderForThermal(state) {
  switch (state) {
    case 'FAIR':
      return WARM_ENCODER;
    case 'WARNING':
      return COOL_ENCODER;
    case 'CRITICAL':
      return COLD_ENCODER;
    default:
      return ENCODER;
  }
}

/** The preview's mirror (VideoCanvas.mirrorMode): mirrored for the front camera, true to life for the back. */
export const MIRROR_ON = 1; // VideoMirrorModeEnabled
export const MIRROR_OFF = 2; // VideoMirrorModeDisabled

/**
 * setCameraCapturerConfiguration: front camera. No fixed format, so the
 * camera captures at the encoder's size: small (PREVIEW) while it rings so
 * it opens at once, then 1080p (ENCODER) from the moment the call connects.
 * The filters run on those captured frames, before encoding.
 */
export const CAPTURE = Object.freeze({
  cameraDirection: 1, // CameraFront
  followEncodeDimensionRatio: true,
});

/** setCameraStabilizationMode: off. Stabilization delays the camera's first frames. */
export const STABILIZATION_OFF = -1; // CameraStabilizationModeOff

/**
 * Any light: high-quality noise reduction and low-light enhancement, both
 * in auto mode, so they only step in when the picture is actually noisy or
 * dark. Denoising every frame smeared fine detail (tattoos, hair, fabric)
 * in a well-lit room, so a clean picture is now left alone.
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
