// Client-side manager for the open-source Kokoro-82M neural TTS model.
// Downloads quantized ONNX weights (~86MB) into browser CacheStorage via Transformers.js,
// tracks download progress, and provides the active KokoroTTS inference instance.

export type KokoroModelStatus = 'unloaded' | 'downloading' | 'ready' | 'error';

export interface KokoroModelState {
  status: KokoroModelStatus;
  progress: number; // 0 - 100
  progressText: string;
  error: string | null;
}

export interface KokoroVoiceProfile {
  id: string;
  rawVoice: string;
  name: string;
  lang: string;
  gender: 'female' | 'male';
  accent: string;
  description: string;
}

export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const KOKORO_MODEL_SIZE = '~86 MB';

export const KOKORO_VOICES: KokoroVoiceProfile[] = [
  // American English
  {
    id: 'offline-kokoro:af_heart',
    rawVoice: 'af_heart',
    name: 'Heart',
    lang: 'en-US',
    gender: 'female',
    accent: 'American',
    description: 'Warm, expressive & natural (Top Audiobook Pick)',
  },
  {
    id: 'offline-kokoro:af_bella',
    rawVoice: 'af_bella',
    name: 'Bella',
    lang: 'en-US',
    gender: 'female',
    accent: 'American',
    description: 'Clear, bright & energetic',
  },
  {
    id: 'offline-kokoro:af_sarah',
    rawVoice: 'af_sarah',
    name: 'Sarah',
    lang: 'en-US',
    gender: 'female',
    accent: 'American',
    description: 'Calm, soft & contemplative',
  },
  {
    id: 'offline-kokoro:af_nicole',
    rawVoice: 'af_nicole',
    name: 'Nicole',
    lang: 'en-US',
    gender: 'female',
    accent: 'American',
    description: 'Crisp, engaging narrator',
  },
  {
    id: 'offline-kokoro:af_sky',
    rawVoice: 'af_sky',
    name: 'Sky',
    lang: 'en-US',
    gender: 'female',
    accent: 'American',
    description: 'Youthful & dynamic',
  },
  {
    id: 'offline-kokoro:am_adam',
    rawVoice: 'am_adam',
    name: 'Adam',
    lang: 'en-US',
    gender: 'male',
    accent: 'American',
    description: 'Deep, resonant & authoritative',
  },
  {
    id: 'offline-kokoro:am_michael',
    rawVoice: 'am_michael',
    name: 'Michael',
    lang: 'en-US',
    gender: 'male',
    accent: 'American',
    description: 'Friendly & conversational',
  },
  {
    id: 'offline-kokoro:am_eric',
    rawVoice: 'am_eric',
    name: 'Eric',
    lang: 'en-US',
    gender: 'male',
    accent: 'American',
    description: 'Smooth & relaxed',
  },
  {
    id: 'offline-kokoro:am_fenrir',
    rawVoice: 'am_fenrir',
    name: 'Fenrir',
    lang: 'en-US',
    gender: 'male',
    accent: 'American',
    description: 'Gravelly, dramatic & cinematic',
  },
  // British English
  {
    id: 'offline-kokoro:bf_emma',
    rawVoice: 'bf_emma',
    name: 'Emma',
    lang: 'en-GB',
    gender: 'female',
    accent: 'British',
    description: 'Eloquent, cultured British narrator',
  },
  {
    id: 'offline-kokoro:bf_isabella',
    rawVoice: 'bf_isabella',
    name: 'Isabella',
    lang: 'en-GB',
    gender: 'female',
    accent: 'British',
    description: 'Gentle, melodic British female',
  },
  {
    id: 'offline-kokoro:bm_george',
    rawVoice: 'bm_george',
    name: 'George',
    lang: 'en-GB',
    gender: 'male',
    accent: 'British',
    description: 'Distinguished, classic British narrator',
  },
  {
    id: 'offline-kokoro:bm_lewis',
    rawVoice: 'bm_lewis',
    name: 'Lewis',
    lang: 'en-GB',
    gender: 'male',
    accent: 'British',
    description: 'Relaxed, modern British male',
  },
  {
    id: 'offline-kokoro:bm_fable',
    rawVoice: 'bm_fable',
    name: 'Fable',
    lang: 'en-GB',
    gender: 'male',
    accent: 'British',
    description: 'Expressive storytelling voice',
  },
];

type Listener = (state: KokoroModelState) => void;

class KokoroModelManager {
  private static instance: KokoroModelManager | null = null;
  private state: KokoroModelState = {
    status: 'unloaded',
    progress: 0,
    progressText: '',
    error: null,
  };
  private listeners: Set<Listener> = new Set();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ttsInstance: any = null;
  private downloadPromise: Promise<boolean> | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.checkIfModelCached();
    }
  }

  static getInstance(): KokoroModelManager {
    if (!KokoroModelManager.instance) {
      KokoroModelManager.instance = new KokoroModelManager();
    }
    return KokoroModelManager.instance;
  }

  getState(): KokoroModelState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(s);
      } catch {
        /* ignore */
      }
    });
  }

  async checkIfModelCached(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof caches === 'undefined') {
      return false;
    }
    try {
      // Check transformers cache for kokoro onnx files
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes('transformers') || name.includes('onnx')) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          const hasKokoro = keys.some((req) => req.url.includes('Kokoro') || req.url.includes('kokoro'));
          if (hasKokoro) {
            this.state.status = 'ready';
            this.state.progress = 100;
            this.notify();
            return true;
          }
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async loadOrDownloadModel(): Promise<boolean> {
    if (this.state.status === 'ready' && this.ttsInstance) {
      return true;
    }

    if (this.downloadPromise) {
      return this.downloadPromise;
    }

    this.downloadPromise = (async () => {
      this.state.status = 'downloading';
      this.state.progress = 0;
      this.state.progressText = 'Initializing Kokoro neural engine...';
      this.state.error = null;
      this.notify();

      try {
        // Dynamically load kokoro-js
        const { KokoroTTS } = await import('kokoro-js');

        // Check if WebGPU is available, otherwise default to wasm
        let device: 'webgpu' | 'wasm' = 'wasm';
        if (typeof navigator !== 'undefined' && (navigator as { gpu?: unknown }).gpu) {
          device = 'webgpu';
        }

        this.ttsInstance = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
          dtype: 'q8',
          device,
          progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
            if (p.status === 'progress' && typeof p.progress === 'number') {
              this.state.progress = Math.min(99, Math.round(p.progress));
              this.state.progressText = `Downloading voice model: ${this.state.progress}%`;
              this.notify();
            } else if (p.status === 'done') {
              this.state.progress = 100;
              this.state.progressText = 'Model loaded successfully';
              this.notify();
            }
          },
        });

        this.state.status = 'ready';
        this.state.progress = 100;
        this.state.progressText = 'Ready';
        this.notify();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.state.status = 'error';
        this.state.error = msg;
        this.state.progressText = `Failed: ${msg}`;
        this.notify();
        return false;
      } finally {
        this.downloadPromise = null;
      }
    })();

    return this.downloadPromise;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTTS(): any | null {
    return this.ttsInstance;
  }

  async deleteModel(): Promise<void> {
    this.ttsInstance = null;
    if (typeof window !== 'undefined' && typeof caches !== 'undefined') {
      try {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (name.includes('transformers') || name.includes('onnx')) {
            await caches.delete(name);
          }
        }
      } catch {
        /* ignore */
      }
    }
    this.state = {
      status: 'unloaded',
      progress: 0,
      progressText: '',
      error: null,
    };
    this.notify();
  }
}

export const kokoroModelManager = KokoroModelManager.getInstance();
