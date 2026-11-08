import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  float32ToWav,
  sanitizeAudioSamples,
  KokoroSpeechProvider,
} from '@/services/tts/providers/kokoro';
import { kokoroModelManager, KOKORO_VOICES } from '@/services/tts/kokoroModelManager';

describe('Kokoro Open-Source TTS Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('float32ToWav audio conversion', () => {
    test('produces valid 16-bit PCM WAV headers', () => {
      const sampleRate = 24000;
      const numSamples = 2400; // 0.1s
      const samples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      }

      const wavBuffer = float32ToWav(samples, sampleRate);
      expect(wavBuffer.byteLength).toBe(44 + numSamples * 2);

      const view = new DataView(wavBuffer);
      // Check RIFF header
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3),
      );
      expect(riff).toBe('RIFF');

      // Check WAVE identifier
      const wave = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11),
      );
      expect(wave).toBe('WAVE');

      // Check format (1 = PCM)
      expect(view.getUint16(20, true)).toBe(1);
      // Check channels (1 = mono)
      expect(view.getUint16(22, true)).toBe(1);
      // Check sample rate
      expect(view.getUint32(24, true)).toBe(sampleRate);
      // Check bits per sample (16)
      expect(view.getUint16(34, true)).toBe(16);
      // Check data chunk header
      const dataHeader = String.fromCharCode(
        view.getUint8(36),
        view.getUint8(37),
        view.getUint8(38),
        view.getUint8(39),
      );
      expect(dataHeader).toBe('data');
      expect(view.getUint32(40, true)).toBe(numSamples * 2);
    });

    test('sanitizeAudioSamples clamps NaNs and soft-normalizes spikes', () => {
      // Create noisy samples with NaNs, Infs, and huge vocoder spikes (e.g. 1000)
      const noisy = new Float32Array([NaN, Infinity, 0.5, -0.5, 1000, -500]);
      const clean = sanitizeAudioSamples(noisy);

      expect(clean[0]).toBe(0);
      expect(clean[1]).toBe(0);
      // All samples must be safely within [-1.0, 1.0]
      for (let i = 0; i < clean.length; i++) {
        expect(clean[i]).toBeGreaterThanOrEqual(-1.0);
        expect(clean[i]).toBeLessThanOrEqual(1.0);
        expect(isNaN(clean[i]!)).toBe(false);
      }
      // Peak sample should scale close to 0.95
      expect(clean[4]).toBeCloseTo(0.95, 2);
    });
  });

  describe('KokoroSpeechProvider', () => {
    test('has expected provider id and label', () => {
      const provider = new KokoroSpeechProvider();
      expect(provider.id).toBe('kokoro-tts');
      expect(provider.label).toContain('Kokoro');
    });

    test('getAllVoices returns catalog of neural voices with expressive variants', async () => {
      const provider = new KokoroSpeechProvider();
      const voices = await provider.getAllVoices();

      expect(voices.length).toBe(KOKORO_VOICES.length);
      expect(voices.some((v) => v.id.includes('af_heart'))).toBe(true);
      expect(voices.some((v) => v.id.includes('am_adam'))).toBe(true);
      expect(voices.some((v) => v.id.includes('bf_emma'))).toBe(true);

      // Verify all voices marked as expressive variant
      voices.forEach((v) => {
        expect(v.variant).toBe('expressive');
      });
    });

    test('groupVoices partitions voices by accent/region', async () => {
      const provider = new KokoroSpeechProvider();
      const voices = await provider.getAllVoices();
      const groups = provider.groupVoices(voices);

      expect(groups.length).toBe(2);
      const usGroup = groups.find((g) => g.id === 'kokoro-us');
      const gbGroup = groups.find((g) => g.id === 'kokoro-gb');

      expect(usGroup).toBeDefined();
      expect(gbGroup).toBeDefined();
      expect(usGroup!.voices.every((v) => v.lang === 'en-US')).toBe(true);
      expect(gbGroup!.voices.every((v) => v.lang === 'en-GB')).toBe(true);
    });

    test('pickDefaultVoice prioritizes Heart (top pick)', async () => {
      const provider = new KokoroSpeechProvider();
      const voices = await provider.getAllVoices();
      const defaultVoice = provider.pickDefaultVoice(voices);

      expect(defaultVoice).toBe('offline-kokoro:af_heart');
    });
  });

  describe('KokoroModelManager state and subscription', () => {
    test('notifies subscribers on state updates', () => {
      let notified = 0;
      const unsub = kokoroModelManager.subscribe(() => {
        notified++;
      });

      expect(notified).toBeGreaterThanOrEqual(1);
      unsub();
    });
  });
});
