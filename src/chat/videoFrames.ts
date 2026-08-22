// wllama accepts image and audio parts, and nothing else - there is no
// video modality in the runtime. Video-capable models like SmolVLM2 are
// trained on sampled frame sequences anyway, so a video is decoded here and
// handed to the model as evenly spaced still frames. This is the same shape
// the model saw in training, not a workaround bolted on top of it.
//
// Decoding happens through an HTMLVideoElement against an object URL, so
// the browser streams the file rather than the app reading it into memory.

// Each frame costs image tokens, and these models run in an 8k window on a
// phone. Eight frames is the practical ceiling before the context fills
// with pictures and leaves no room for an answer.
const DEFAULT_FRAME_COUNT = 8;

// SmolVLM's vision tower works at 384px; sending anything larger just costs
// memory and encode time to be scaled back down inside the model.
const MAX_FRAME_EDGE = 384;
const JPEG_QUALITY = 0.8;

// A still-loading video that never fires its events would otherwise hang
// the composer forever.
const METADATA_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 10_000;

export interface VideoFrames {
  readonly frames: readonly ArrayBuffer[];
  readonly durationSeconds: number;
}

function waitForEvent(target: HTMLVideoElement, event: string, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject({ type: 'load', message: `This video could not be read (${label} timed out).` });
    }, timeoutMs);

    function onDone(): void {
      cleanup();
      resolve();
    }

    function onError(): void {
      cleanup();
      reject({ type: 'load', message: 'This video could not be decoded by this browser.' });
    }

    function cleanup(): void {
      clearTimeout(timer);
      target.removeEventListener(event, onDone);
      target.removeEventListener('error', onError);
    }

    target.addEventListener(event, onDone, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

function scaledSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_FRAME_EDGE) return { width, height };
  const ratio = MAX_FRAME_EDGE / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function canvasToArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject({ type: 'load', message: 'A video frame could not be captured.' });
          return;
        }
        blob.arrayBuffer().then(resolve).catch(() => {
          reject({ type: 'load', message: 'A video frame could not be captured.' });
        });
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export async function extractVideoFrames(file: File, frameCount = DEFAULT_FRAME_COUNT): Promise<VideoFrames> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  // Required for canvas capture: without it the first seek can resolve
  // before any pixel data exists and produce black frames.
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await waitForEvent(video, 'loadedmetadata', METADATA_TIMEOUT_MS, 'reading the video header');

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw { type: 'load', message: 'This video has no readable duration.' };
    }

    const { width, height } = scaledSize(video.videoWidth, video.videoHeight);
    if (width === 0 || height === 0) {
      throw { type: 'load', message: 'This video has no readable picture size.' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw { type: 'load', message: 'This browser could not prepare a canvas to read the video.' };
    }

    const frames: ArrayBuffer[] = [];
    // Sample at midpoints of equal slices rather than at 0 and the very
    // end: the first frame is often a black lead-in and seeking exactly to
    // duration frequently never fires 'seeked'.
    for (let index = 0; index < frameCount; index++) {
      const timestamp = (duration * (index + 0.5)) / frameCount;
      video.currentTime = Math.min(timestamp, Math.max(0, duration - 0.05));
      await waitForEvent(video, 'seeked', SEEK_TIMEOUT_MS, 'seeking');
      context.drawImage(video, 0, 0, width, height);
      frames.push(await canvasToArrayBuffer(canvas));
    }

    return { frames, durationSeconds: duration };
  } finally {
    // Order matters: drop the source before revoking, or the element can
    // keep a handle to a URL that no longer resolves.
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
