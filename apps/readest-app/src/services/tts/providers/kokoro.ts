import {
  SpeechProvider,
  SpeechSynthesisPermanentError,
  SpeechSynthesisRequest,
  SpeechSynthesisResult,
} from './types';
import { TTSVoicesGroup, TTSVoice } from '../types';
import {
  kokoroModelManager,
  KOKORO_VOICES,
  KokoroVoiceProfile,
} from '../kokoroModelManager';

// Convert Float32Array PCM samples (-1.0 to 1.0) into a standard 16-bit PCM WAV ArrayBuffer
export function float32ToWav(samples: Float32Array, sampleRate = 24000): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample (16)

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export class KokoroSpeechProvider implements SpeechProvider {
  readonly id = 'kokoro-tts';
  readonly label = 'Kokoro Neural (Offline)';

  async init(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    return kokoroModelManager.checkIfModelCached();
  }

  async getAllVoices(): Promise<TTSVoice[]> {
    return KOKORO_VOICES.map((v: KokoroVoiceProfile) => ({
      id: v.id,
      name: `${v.name} (${v.gender === 'female' ? 'Female' : 'Male'}) · ${v.description}`,
      lang: v.lang,
      variant: 'expressive' as const,
      disabled: false,
    }));
  }

  groupVoices(voices: TTSVoice[]): Omit<TTSVoicesGroup, 'disabled'>[] {
    const isModelReady = kokoroModelManager.getState().status === 'ready';
    const statusTag = isModelReady ? 'Ready' : 'Downloadable';

    const usVoices = voices.filter((v) => v.lang === 'en-US');
    const gbVoices = voices.filter((v) => v.lang === 'en-GB');

    const groups: Omit<TTSVoicesGroup, 'disabled'>[] = [];
    if (usVoices.length > 0) {
      groups.push({
        id: 'kokoro-us',
        name: `Neural Offline 🇺🇸 American (${statusTag})`,
        voices: usVoices,
      });
    }
    if (gbVoices.length > 0) {
      groups.push({
        id: 'kokoro-gb',
        name: `Neural Offline 🇬🇧 British (${statusTag})`,
        voices: gbVoices,
      });
    }
    return groups;
  }

  async synthesize(
    req: SpeechSynthesisRequest,
    _signal?: AbortSignal,
  ): Promise<SpeechSynthesisResult> {
    const text = req.text.trim();
    if (!text) {
      throw new SpeechSynthesisPermanentError('Empty text received for synthesis');
    }

    // Ensure model is loaded or downloaded
    let tts = kokoroModelManager.getTTS();
    if (!tts) {
      const success = await kokoroModelManager.loadOrDownloadModel();
      if (!success) {
        throw new Error(
          kokoroModelManager.getState().error || 'Failed to download Kokoro neural model',
        );
      }
      tts = kokoroModelManager.getTTS();
    }

    if (!tts) {
      throw new Error('Kokoro neural model is not initialized');
    }

    // Strip "offline-kokoro:" or "kokoro:" prefix if present
    const rawVoice = req.voice.replace(/^(offline-kokoro|kokoro):/, '');

    try {
      // Execute inference
      const rawAudio = await tts.generate(text, {
        voice: rawVoice,
        speed: 1.0, // Playout speed stretching is handled at the player level (WSOLA)
      });

      let audioBuffer: ArrayBuffer;
      if (rawAudio.audio instanceof Float32Array) {
        audioBuffer = float32ToWav(rawAudio.audio, rawAudio.sampling_rate || 24000);
      } else if (typeof rawAudio.toBlob === 'function') {
        const blob = rawAudio.toBlob();
        audioBuffer = await blob.arrayBuffer();
      } else {
        throw new Error('Unexpected audio format returned by Kokoro TTS');
      }

      return {
        audio: audioBuffer,
        boundaries: [], // Sentence-level tracking provided by BufferedTTSClient
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes('permanent')) {
        throw new SpeechSynthesisPermanentError(err.message, { cause: err });
      }
      throw err;
    }
  }

  pickDefaultVoice(voices: TTSVoice[]): string | undefined {
    const heart = voices.find((v) => v.id.includes('af_heart'));
    return heart?.id ?? voices[0]?.id;
  }
}
