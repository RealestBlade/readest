import React, { useEffect, useState } from 'react';
import { PiCheckCircleFill, PiCloudArrowDown, PiPlay, PiSpinner, PiTrash } from 'react-icons/pi';
import { useTranslation } from '@/hooks/useTranslation';
import {
  kokoroModelManager,
  KokoroModelState,
  KOKORO_VOICES,
  KokoroVoiceProfile,
} from '@/services/tts/kokoroModelManager';
import { BoxedList } from './primitives';
import SubPageHeader from './SubPageHeader';

interface KokoroModelManagerViewProps {
  onBack: () => void;
}

const KokoroModelManagerView: React.FC<KokoroModelManagerViewProps> = ({ onBack }) => {
  const _ = useTranslation();
  const [modelState, setModelState] = useState<KokoroModelState>(kokoroModelManager.getState());
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = kokoroModelManager.subscribe((s) => setModelState(s));
    kokoroModelManager.checkIfModelCached();
    return () => unsubscribe();
  }, []);

  const handleDownload = async (dev?: 'webgpu' | 'wasm') => {
    await kokoroModelManager.loadOrDownloadModel(dev);
  };

  const handleDelete = async () => {
    if (window.confirm(_('Delete downloaded Kokoro voice model (~86 MB) from this device?'))) {
      await kokoroModelManager.deleteModel();
    }
  };

  const handlePreviewVoice = async (voice: KokoroVoiceProfile) => {
    if (modelState.status !== 'ready') {
      const ok = await kokoroModelManager.loadOrDownloadModel();
      if (!ok) return;
    }

    setPreviewingVoice(voice.id);
    try {
      const tts = kokoroModelManager.getTTS();
      if (!tts) return;

      const previewText =
        voice.lang === 'en-GB'
          ? `Hello, I am ${voice.name}. I look forward to reading your favourite stories with you.`
          : `Hello, I am ${voice.name}. I'm ready to read your favorite books with you!`;

      const rawAudio = await tts.generate(previewText, {
        voice: voice.rawVoice,
        speed: 1.0,
      });

      // Play sample using standard Web Audio
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const buffer = ctx.createBuffer(1, rawAudio.audio.length, rawAudio.sampling_rate || 24000);
      buffer.copyToChannel(rawAudio.audio, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setPreviewingVoice(null);
        void ctx.close();
      };
      source.start();
    } catch (err) {
      console.error('Failed to preview voice:', err);
      setPreviewingVoice(null);
    }
  };

  const isReady = modelState.status === 'ready';
  const isDownloading = modelState.status === 'downloading';

  return (
    <div className='my-4 w-full space-y-6'>
      <SubPageHeader
        parentLabel={_('TTS')}
        currentLabel={_('Offline Voice Models')}
        description={_(
          'Download high-quality neural voice models (Kokoro-82M) for studio-grade, human-like speech that works 100% offline without subscriptions or cloud keys.',
        )}
        onBack={onBack}
      />

      {/* Model Status Card */}
      <BoxedList title={_('Model Status')} cardClassName='overflow-hidden p-4 space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <div className='flex items-center gap-2 font-semibold text-base flex-wrap'>
              <span>Kokoro 82M Neural Engine</span>
              {modelState.activeDevice === 'webgpu' && (
                <span className='badge badge-sm badge-success gap-1'>
                  ⚡ GPU: {modelState.gpuInfo?.adapterName || 'Direct3D 12'}
                </span>
              )}
              {modelState.activeDevice === 'wasm' && (
                <span className='badge badge-sm badge-outline gap-1'>CPU Mode (WebAssembly)</span>
              )}
            </div>
            <div className='text-xs opacity-60 mt-0.5'>
              {modelState.gpuInfo?.available
                ? _('Hardware acceleration detected: {{gpu}}', {
                    gpu: modelState.gpuInfo.adapterName,
                  })
                : _('Open-source text-to-speech model with 15+ built-in human voice actors')}
            </div>
          </div>

          <div className='flex items-center gap-2'>
            {isReady && (
              <span className='badge badge-success gap-1 text-xs py-2.5 px-3'>
                <PiCheckCircleFill className='h-4 w-4' />
                {_('Installed & Ready')}
              </span>
            )}
            {isDownloading && (
              <span className='badge badge-info gap-1 text-xs py-2.5 px-3'>
                <PiSpinner className='h-4 w-4 animate-spin' />
                {_('Downloading...')}
              </span>
            )}
            {!isReady && !isDownloading && (
              <span className='badge badge-ghost text-xs py-2.5 px-3'>{_('Not Downloaded')}</span>
            )}
          </div>
        </div>

        {/* Download Progress Bar */}
        {isDownloading && (
          <div className='space-y-1.5'>
            <div className='flex justify-between text-xs font-medium'>
              <span>{modelState.progressText || _('Downloading voice model...')}</span>
              <span>{modelState.progress}%</span>
            </div>
            <progress
              className='progress progress-primary w-full'
              value={modelState.progress}
              max='100'
            />
          </div>
        )}

        {modelState.error && (
          <div className='text-xs text-error font-medium'>
            {_('Error: {{msg}}', { msg: modelState.error })}
          </div>
        )}

        {/* Action Buttons */}
        <div className='flex items-center gap-3 pt-1 flex-wrap'>
          {!isReady && !isDownloading && (
            <>
              {modelState.gpuInfo?.available ? (
                <button
                  type='button'
                  className='btn btn-primary btn-sm gap-2'
                  onClick={() => handleDownload('webgpu')}
                >
                  <PiCloudArrowDown className='h-4 w-4' />
                  {_('Download GPU Model (~325 MB)')}
                </button>
              ) : (
                <button
                  type='button'
                  className='btn btn-primary btn-sm gap-2'
                  onClick={() => handleDownload('wasm')}
                >
                  <PiCloudArrowDown className='h-4 w-4' />
                  {_('Download Voice Model (~86 MB)')}
                </button>
              )}
            </>
          )}

          {isReady && modelState.gpuInfo?.available && modelState.activeDevice === 'wasm' && (
            <button
              type='button'
              className='btn btn-success btn-sm gap-2'
              onClick={() => handleDownload('webgpu')}
            >
              ⚡ {_('Enable GPU Acceleration (~325 MB)')}
            </button>
          )}

          {isReady && (
            <button
              type='button'
              className='btn btn-ghost btn-sm text-error gap-1.5 hover:bg-error/10'
              onClick={handleDelete}
            >
              <PiTrash className='h-4 w-4' />
              {_('Delete Downloaded Model')}
            </button>
          )}
        </div>
      </BoxedList>

      {/* Voice Catalog */}
      <BoxedList
        title={_('Available Voice Actors')}
        cardClassName='overflow-hidden divide-y divide-base-300'
      >
        {KOKORO_VOICES.map((voice) => {
          const isPlayingThis = previewingVoice === voice.id;
          return (
            <div
              key={voice.id}
              className='flex items-center justify-between gap-3 px-4 py-3 hover:bg-base-200/50 transition-colors'
            >
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <span className='font-medium text-sm'>{voice.name}</span>
                  <span className='badge badge-xs badge-ghost uppercase'>{voice.accent}</span>
                  <span className='text-xs opacity-50 capitalize'>{voice.gender}</span>
                </div>
                <div className='text-xs opacity-60 truncate mt-0.5'>{voice.description}</div>
              </div>

              <button
                type='button'
                className='btn btn-ghost btn-xs gap-1.5 shrink-0'
                disabled={isDownloading || (previewingVoice !== null && !isPlayingThis)}
                onClick={() => handlePreviewVoice(voice)}
                title={_('Preview Voice')}
              >
                {isPlayingThis ? (
                  <>
                    <PiSpinner className='h-3.5 w-3.5 animate-spin text-primary' />
                    <span>{_('Playing...')}</span>
                  </>
                ) : (
                  <>
                    <PiPlay className='h-3.5 w-3.5' />
                    <span>{_('Preview')}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </BoxedList>
    </div>
  );
};

export default KokoroModelManagerView;
