// What the safety layer throws. `handled` means the person has already been
// told (the agreement or the "Content Violates Guidelines" card is on screen),
// so a screen should simply stop and not show a second alert.

export class SafetyError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'SafetyError';
    this.code = code; // 'terms_declined' | 'violation' | 'unavailable'
    this.safety = true;
    this.handled = code !== 'unavailable';
    Object.assign(this, extra);
  }
}

/** Whether the person has already been told why this stopped. */
export const isHandled = (err) => !!err && err.safety === true && err.handled === true;
