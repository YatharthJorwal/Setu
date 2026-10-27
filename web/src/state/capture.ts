// The 3D view registers a function that returns a picture of itself; the report asks for it when it is built.
let capture: (() => string) | null = null;

export function registerCapture(fn: (() => string) | null): void {
  capture = fn;
}

/** A JPEG data URL of the map as it looks now, or null if it cannot be captured. */
export function captureScreenshot(): string | null {
  try {
    return capture ? capture() : null;
  } catch {
    return null;
  }
}
