// Client-side manager for the open-source Kokoro-82M neural TTS model.
// Supports Direct3D 12 WebGPU hardware acceleration for GPUs (such as AMD Radeon RX 570)
// using full precision FP32 ONNX weights (~325 MB), with an automatic fallback to
// quantized Q8 ONNX weights (~86 MB) running via WebAssembly on the CPU.
// Manages download progress, CacheStorage caching, and inference instances.

export type KokoroModelStatus = 'unloaded' | 'downloading' | 'ready' | 'error';
export type KokoroDeviceType = 'webgpu' | 'wasm';

export interface GPUInfo {
  available: boolean;
  adapterName: string;
  vendor?: string;
  architecture?: string;
}

export interface KokoroModelState {
  status: KokoroModelStatus;
  progress: number; // 0 - 100
  progressText: string;
  error: string | null;
  activeDevice: KokoroDeviceType | null;
  gpuInfo: GPUInfo | null;
  cachedModelType: 'gpu' | 'cpu' | 'both' | 'none';
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
export const KOKORO_CPU_MODEL_SIZE = '~86 MB (CPU)';
export const KOKORO_GPU_MODEL_SIZE = '~325 MB (GPU)';
export const KOKORO_MODEL_SIZE = '~86 MB'; // Compatibility export

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

export async function detectWebGPU(): Promise<GPUInfo> {
  if (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    (navigator as { gpu?: unknown }).gpu
  ) {
    try {
      const gpu = (
        navigator as unknown as { gpu: { requestAdapter: (opts?: unknown) => Promise<unknown> } }
      ).gpu;
      const adapter = (await gpu.requestAdapter({ powerPreference: 'high-performance' })) as {
        info?: { description?: string; device?: string; architecture?: string; vendor?: string };
        requestAdapterInfo?: () => Promise<{
          description?: string;
          device?: string;
          architecture?: string;
          vendor?: string;
        }>;
      } | null;
      if (adapter) {
        let name = 'Direct3D 12 GPU';
        let vendor = '';
        let architecture = '';
        if (adapter.info) {
          name =
            adapter.info.description || adapter.info.device || adapter.info.architecture || name;
          vendor = adapter.info.vendor || '';
          architecture = adapter.info.architecture || '';
        } else if (typeof adapter.requestAdapterInfo === 'function') {
          const info = await adapter.requestAdapterInfo();
          name = info.description || info.device || info.architecture || name;
          vendor = info.vendor || '';
          architecture = info.architecture || '';
        }
        return { available: true, adapterName: name, vendor, architecture };
      }
    } catch (e) {
      console.warn('[Kokoro] WebGPU detection error:', e);
    }
  }
  return { available: false, adapterName: 'CPU (WebAssembly)' };
}

type Listener = (state: KokoroModelState) => void;

class KokoroModelManager {
  private static instance: KokoroModelManager | null = null;
  private state: KokoroModelState = {
    status: 'unloaded',
    progress: 0,
    progressText: '',
    error: null,
    activeDevice: null,
    gpuInfo: null,
    cachedModelType: 'none',
  };
  private listeners: Set<Listener> = new Set();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ttsInstance: any = null;
  private downloadPromise: Promise<boolean> | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      void this.checkIfModelCached();
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
      if (!this.state.gpuInfo) {
        this.state.gpuInfo = await detectWebGPU();
      }
      const cacheNames = await caches.keys();
      let hasFp32 = false;
      let hasQ8 = false;
      for (const name of cacheNames) {
        if (name.includes('transformers') || name.includes('onnx')) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          for (const req of keys) {
            const url = req.url.toLowerCase();
            if (url.includes('kokoro')) {
              if (url.includes('model_quantized.onnx')) {
                hasQ8 = true;
              } else if (url.includes('model.onnx')) {
                hasFp32 = true;
              }
            }
          }
        }
      }

      if (hasFp32 && hasQ8) {
        this.state.cachedModelType = 'both';
      } else if (hasFp32) {
        this.state.cachedModelType = 'gpu';
      } else if (hasQ8) {
        this.state.cachedModelType = 'cpu';
      } else {
        this.state.cachedModelType = 'none';
      }

      // Check if suitable model is cached
      if (this.state.gpuInfo.available && hasFp32) {
        this.state.status = 'ready';
        this.state.progress = 100;
        this.state.activeDevice = 'webgpu';
        this.state.progressText = `Ready on GPU (${this.state.gpuInfo.adapterName})`;
        this.notify();
        return true;
      } else if (hasQ8) {
        this.state.status = 'ready';
        this.state.progress = 100;
        this.state.activeDevice = 'wasm';
        this.state.progressText = this.state.gpuInfo.available
          ? `Ready on CPU (GPU model available for download)`
          : `Ready on CPU (WASM)`;
        this.notify();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async loadOrDownloadModel(preferredDevice?: KokoroDeviceType): Promise<boolean> {
    if (this.state.status === 'ready' && this.ttsInstance) {
      if (!preferredDevice || this.state.activeDevice === preferredDevice) {
        return true;
      }
    }

    if (this.downloadPromise) {
      return this.downloadPromise;
    }

    this.downloadPromise = (async () => {
      this.state.status = 'downloading';
      this.state.progress = 0;
      this.state.error = null;
      this.notify();

      try {
        const { KokoroTTS } = await import('kokoro-js');
        const { env: hfEnv } = await import('@huggingface/transformers');

        // Configure environment with local WASM paths
        if (typeof window !== 'undefined') {
          const ortPath = `${window.location.origin}/ort/`;
          const anyEnv = hfEnv as unknown as {
            allowLocalModels?: boolean;
            useBrowserCache?: boolean;
            backends?: {
              onnx?: {
                wasm?: { wasmPaths?: string; proxy?: boolean; numThreads?: number };
                webgpu?: { powerPreference?: string };
              };
            };
          };
          anyEnv.allowLocalModels = false;
          anyEnv.useBrowserCache = true;
          if (anyEnv.backends?.onnx) {
            if (anyEnv.backends.onnx.wasm) {
              anyEnv.backends.onnx.wasm.wasmPaths = ortPath;
              anyEnv.backends.onnx.wasm.proxy = false;
              if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
                anyEnv.backends.onnx.wasm.numThreads = Math.min(
                  4,
                  Math.max(1, navigator.hardwareConcurrency),
                );
              }
            }
            if (anyEnv.backends.onnx.webgpu) {
              anyEnv.backends.onnx.webgpu.powerPreference = 'high-performance';
            }
          }
        }

        // Preload default af_heart voice from local assets into CacheStorage so inference starts instantly offline
        if (typeof window !== 'undefined' && typeof caches !== 'undefined') {
          try {
            const cache = await caches.open('kokoro-voices');
            const hfUrl = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_heart.bin`;
            const cached = await cache.match(hfUrl);
            if (!cached) {
              const res = await fetch('/voices/af_heart.bin');
              if (res.ok) {
                const buf = await res.arrayBuffer();
                await cache.put(
                  hfUrl,
                  new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } }),
                );
              }
            }
          } catch (e) {
            console.warn('[Kokoro] Could not pre-cache default voice:', e);
          }
        }

        const gpuInfo = await detectWebGPU();
        this.state.gpuInfo = gpuInfo;

        const progressCb = (p: {
          status?: string;
          progress?: number;
          loaded?: number;
          total?: number;
          file?: string;
        }) => {
          if (p && typeof p.progress === 'number') {
            this.state.progress = Math.min(99, Math.round(p.progress));
            const fileName = p.file ? p.file.split('/').pop() : '';
            this.state.progressText = fileName
              ? `Downloading ${fileName}... ${this.state.progress}%`
              : `Downloading model... ${this.state.progress}%`;
            this.notify();
          } else if (p && p.status === 'done') {
            this.state.progress = 99;
            this.state.progressText = 'Loading neural weights into memory...';
            this.notify();
          }
        };

        let tts: unknown = null;
        let activeDevice: KokoroDeviceType = 'wasm';

        // Try WebGPU first if GPU is available and not explicitly forced to wasm
        if (gpuInfo.available && preferredDevice !== 'wasm') {
          try {
            this.state.progressText = `Initializing GPU acceleration (${gpuInfo.adapterName})...`;
            this.notify();

            tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
              dtype: 'fp32',
              device: 'webgpu',
              progress_callback: progressCb,
            });
            activeDevice = 'webgpu';
            console.log(`[Kokoro] Initialized WebGPU on ${gpuInfo.adapterName}`);
          } catch (gpuErr) {
            console.warn(
              '[Kokoro] WebGPU unavailable or failed, falling back to CPU (WASM):',
              gpuErr,
            );
            tts = null;
          }
        }

        // If WebGPU was unavailable, skipped, or failed: use CPU WASM
        if (!tts) {
          activeDevice = 'wasm';
          this.state.progressText = 'Starting on-device neural engine (CPU WASM)...';
          this.notify();

          tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
            dtype: 'q8',
            device: 'wasm',
            progress_callback: progressCb,
          });
          console.log('[Kokoro] Initialized CPU WASM engine');
        }

        this.ttsInstance = tts;
        this.state.activeDevice = activeDevice;
        this.state.status = 'ready';
        this.state.progress = 100;
        this.state.progressText =
          activeDevice === 'webgpu'
            ? `Ready on GPU (${gpuInfo.adapterName})`
            : 'Ready on CPU (WASM)';
        this.state.error = null;
        await this.checkIfModelCached();
        this.notify();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Kokoro] Model initialization failed:', err);
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
      activeDevice: null,
      gpuInfo: this.state.gpuInfo,
      cachedModelType: 'none',
    };
    this.notify();
  }
}

export const kokoroModelManager = KokoroModelManager.getInstance();
