/**
 * KrakenScape Audio Engine
 * Handles all audio playback with Web Audio API
 * Supports looping ambient sounds and intermittent random sounds
 */

class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.masterAnalyser = null;
        this.layers = new Map(); // layerId -> LayerController
        this.oneShots = new Map(); // oneShotId -> buffer
        this.activeOneShotSources = new Set();
        this.isPlaying = false;
        this.masterVolume = 0.8;
    }

    /**
     * Initialize the audio context (must be called after user interaction)
     */
    async init() {
        if (this.audioContext) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create master analyser for level metering
        this.masterAnalyser = this.audioContext.createAnalyser();
        this.masterAnalyser.fftSize = 256;
        this.masterAnalyser.smoothingTimeConstant = 0.8;

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.masterVolume;

        // Connect: masterGain -> masterAnalyser -> destination
        this.masterGain.connect(this.masterAnalyser);
        this.masterAnalyser.connect(this.audioContext.destination);

        console.log('AudioEngine initialized');
    }

    /**
     * Get current master audio level (0-1)
     */
    getMasterLevel() {
        if (!this.masterAnalyser) return 0;

        const dataArray = new Uint8Array(this.masterAnalyser.frequencyBinCount);
        this.masterAnalyser.getByteFrequencyData(dataArray);

        // Calculate RMS (root mean square) for a better level reading
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Normalize to 0-1 range (255 is max for Uint8)
        return Math.min(rms / 128, 1);
    }

    /**
     * Resume audio context if suspended
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Set master volume
     */
    setMasterVolume(value) {
        this.masterVolume = Math.max(0, Math.min(1, value));
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.masterVolume, this.audioContext.currentTime, 0.1);
        }
    }

    /**
     * Load an audio file and return the buffer
     */
    async loadAudioBuffer(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }

    /**
     * Load audio from a File object
     */
    async loadAudioFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const buffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    resolve(buffer);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Create a new sound layer
     */
    createLayer(config) {
        let layer = null;
        if (config.type === 'playlist') {
            layer = new PlaylistController(this, config);
        } else {
            layer = new LayerController(this, config);
        }
        this.layers.set(config.id, layer);
        return layer;
    }

    /**
     * Remove a sound layer
     */
    removeLayer(layerId) {
        const layer = this.layers.get(layerId);
        if (layer) {
            if (typeof layer.destroy === 'function') {
                layer.destroy();
            } else {
                layer.stop();
            }
            this.layers.delete(layerId);
        }
    }

    /**
     * Get a layer by ID
     */
    getLayer(layerId) {
        return this.layers.get(layerId);
    }

    /**
     * Play all active layers
     */
    playAll() {
        this.isPlaying = true;
        this.layers.forEach(layer => {
            if (layer.config.enabled) {
                layer.play();
            }
        });
    }

    /**
     * Stop all layers
     */
    stopAll() {
        this.isPlaying = false;
        this.layers.forEach(layer => layer.stop());
        this.activeOneShotSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {}
        });
        this.activeOneShotSources.clear();
    }

    /**
     * Play a one-shot sound
     */
    playOneShot(buffer, volume = 1) {
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();

        source.buffer = buffer;
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(this.masterGain);

        this.activeOneShotSources.add(source);
        source.addEventListener('ended', () => {
            this.activeOneShotSources.delete(source);
        }, { once: true });

        source.start(0);

        return source;
    }

    /**
     * Export current state for saving
     */
    exportState() {
        const layerStates = [];
        this.layers.forEach((layer, id) => {
            layerStates.push({
                id,
                ...layer.config,
                volume: layer.volume
            });
        });
        return layerStates;
    }
}

/**
 * Create a persistent analyser at the output of one layer. Keeping it after
 * playback stops lets the visualizer decay naturally and avoids rebuilding the
 * audio graph for every intermittent sound.
 */
function createLayerAnalyser(engine) {
    const context = engine?.audioContext;
    if (!context || typeof context.createAnalyser !== 'function') return null;

    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -18;
    analyser.connect(engine.masterGain);
    return analyser;
}

function readLayerSpectrum(controller) {
    if (!controller.analyser) return null;
    if (!controller.frequencyData ||
        controller.frequencyData.length !== controller.analyser.frequencyBinCount) {
        controller.frequencyData = new Uint8Array(controller.analyser.frequencyBinCount);
    }
    controller.analyser.getByteFrequencyData(controller.frequencyData);
    return controller.frequencyData;
}

/**
 * Controller for a single sound layer
 * Handles both looping and intermittent playback modes
 */
class LayerController {
    constructor(engine, config) {
        this.engine = engine;
        this.config = {
            id: config.id,
            name: config.name || 'Unnamed Layer',
            type: config.type || 'loop', // 'loop' or 'intermittent'
            enabled: config.enabled !== false,
            randomStart: config.randomStart === true,
            randomizeDelay: config.randomizeDelay !== false,
            randomizeVolume: config.randomizeVolume !== false,
            // Loop settings
            crossfadeDuration: config.crossfadeDuration ?? 2,
            // Intermittent settings
            minDelay: config.minDelay ?? 10,
            maxDelay: config.maxDelay ?? 60,
            minVolume: config.minVolume ?? 0.8,
            maxVolume: config.maxVolume ?? 1,
            fadeIn: config.fadeIn ?? 0.5,
            fadeOut: config.fadeOut ?? 1,
            // In-game variation (from WoW-Ambient). Pitch in semitones, pan spread 0-1,
            // first delay in seconds before the first intermittent play.
            pitchDown: Math.min(0, Number(config.pitchDown) || 0),
            pitchUp: Math.max(0, Number(config.pitchUp) || 0),
            panSpread: Math.max(0, Math.min(1, Number(config.panSpread) || 0)),
            firstDelayMin: Math.max(0, Number(config.firstDelayMin) || 0),
            firstDelayMax: Math.max(0, Number(config.firstDelayMax) || 0)
        };

        this.isFirstIntermittent = true;
        this.buffer = null;
        this.buffers = [];
        this.volume = Math.max(0, Math.min(1, config.volume ?? 0.7));
        this.isPlaying = false;
        this.currentSource = null;
        this.nextSource = null;
        this.gainNode = null;
        this.loopGainNode = null;
        this.analyser = createLayerAnalyser(engine);
        this.frequencyData = null;
        this.loopVoices = new Set();
        this.loopScheduler = null;
        this.loopNextStartTime = 0;
        this.loopInitialOffset = 0;
        this.loopStartedAt = 0;
        this.loopCrossfade = 0;
        this.loopFirstCycleDuration = 0;
        this.loopCycleDuration = 0;
        this.loopFadeInCurve = new Float32Array(64);
        this.loopFadeOutCurve = new Float32Array(64);
        for (let i = 0; i < this.loopFadeInCurve.length; i++) {
            const position = i / (this.loopFadeInCurve.length - 1);
            this.loopFadeInCurve[i] = Math.sin(position * Math.PI / 2);
            this.loopFadeOutCurve[i] = Math.cos(position * Math.PI / 2);
        }
        this.loopFadeInCurve[0] = 0;
        this.loopFadeInCurve[this.loopFadeInCurve.length - 1] = 1;
        this.loopFadeOutCurve[0] = 1;
        this.loopFadeOutCurve[this.loopFadeOutCurve.length - 1] = 0;
        this.intermittentTimeout = null;
        this.progress = 0;
        this.progressInterval = null;
        this.onProgressUpdate = null;
        this.onPlayStateChange = null;
    }

    /**
     * Load audio buffer for this layer
     */
    async loadBuffer(urlOrFile) {
        if (urlOrFile instanceof File) {
            this.buffer = await this.engine.loadAudioFromFile(urlOrFile);
        } else {
            this.buffer = await this.engine.loadAudioBuffer(urlOrFile);
        }
        this.buffers = this.buffer ? [this.buffer] : [];
        return this.buffer;
    }

    /**
     * Set the audio buffer directly
     */
    setBuffer(buffer) {
        this.buffer = buffer;
        this.buffers = buffer ? [buffer] : [];
    }

    /**
     * Set a pool of buffers for random intermittent playback
     */
    setBufferPool(buffers) {
        this.buffers = (buffers || []).filter(Boolean);
        this.buffer = this.buffers[0] || null;
    }

    /**
     * Set volume for this layer
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.loopGainNode && this.isPlaying) {
            this.loopGainNode.gain.setTargetAtTime(this.volume, this.engine.audioContext.currentTime, 0.1);
        }
        if (this.gainNode && this.isPlaying) {
            this.gainNode.gain.setTargetAtTime(this.volume, this.engine.audioContext.currentTime, 0.1);
        }
    }

    getFrequencyData() {
        return readLayerSpectrum(this);
    }

    destroy() {
        this.stop();
        if (this.analyser) {
            try { this.analyser.disconnect(); } catch (e) {}
            this.analyser = null;
        }
        this.frequencyData = null;
    }

    /**
     * Start playback
     */
    play() {
        if ((!this.buffer && this.buffers.length === 0) || this.isPlaying) return;

        this.isPlaying = true;
        this.isFirstIntermittent = true;

        if (this.config.type === 'loop') {
            this._playLoop();
        } else {
            this._scheduleIntermittent();
        }

        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }
    }

    /**
     * Stop playback
     */
    stop() {
        this.isPlaying = false;

        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {}
            this.currentSource = null;
        }

        if (this.nextSource) {
            try {
                this.nextSource.stop();
            } catch (e) {}
            this.nextSource = null;
        }

        if (this.loopScheduler) {
            clearInterval(this.loopScheduler);
            this.loopScheduler = null;
        }

        this.loopVoices.forEach(voice => {
            try {
                voice.source.stop();
            } catch (e) {}
            try {
                voice.source.disconnect();
                voice.gain.disconnect();
            } catch (e) {}
        });
        this.loopVoices.clear();
        this.loopGainNode = null;

        if (this.intermittentTimeout) {
            clearTimeout(this.intermittentTimeout);
            this.intermittentTimeout = null;
        }

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        this.progress = 0;

        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }

        if (this.onProgressUpdate) {
            this.onProgressUpdate(0);
        }
    }

    /**
     * Toggle playback
     */
    toggle() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    /**
     * Internal: Play looping sound with crossfade
     */
    _playLoop() {
        const ctx = this.engine.audioContext;
        const duration = this.buffer?.duration || 0;
        if (duration <= 0) {
            this.stop();
            return;
        }

        // A stable layer-level gain keeps the volume slider effective while
        // individual loop voices crossfade underneath it.
        this.loopGainNode = ctx.createGain();
        this.loopGainNode.gain.value = this.volume;
        this.loopGainNode.connect(this.analyser || this.engine.masterGain);

        const requestedCrossfade = Math.max(0, Number(this.config.crossfadeDuration) || 0);
        const crossfade = Math.min(requestedCrossfade, duration / 2);
        // Leave enough material on the first pass for a complete fade-in and
        // fade-out. Very short clips therefore start at zero rather than
        // creating a partial first seam.
        const maxOffset = Math.max(0, duration - (crossfade * 2));
        const offset = this.config.randomStart ? Math.random() * maxOffset : 0;

        this.loopInitialOffset = offset;
        this.loopStartedAt = ctx.currentTime;
        this.loopCrossfade = crossfade;
        this.loopFirstCycleDuration = duration - offset - crossfade;
        this.loopCycleDuration = duration - crossfade;

        if (crossfade === 0) {
            this.currentSource = ctx.createBufferSource();
            this.currentSource.buffer = this.buffer;
            this.currentSource.loop = true;
            this.currentSource.connect(this.loopGainNode);
            this.currentSource.start(0, offset);
            this._trackLoopProgress();
            return;
        }

        const firstDuration = duration - offset;
        this._scheduleLoopVoice(ctx.currentTime, offset, firstDuration, crossfade);
        this.loopNextStartTime = ctx.currentTime + firstDuration - crossfade;

        const scheduleAhead = () => {
            const horizon = ctx.currentTime + 10;
            while (this.isPlaying && this.loopNextStartTime <= horizon) {
                this._scheduleLoopVoice(this.loopNextStartTime, 0, duration, crossfade);
                this.loopNextStartTime += duration - crossfade;
            }
        };

        scheduleAhead();
        this.loopScheduler = setInterval(scheduleAhead, 1000);

        this._trackLoopProgress();
    }

    /**
     * Schedule one non-looping buffer voice with equal-power gain overlap.
     * The layer gain controls overall volume; voice gain only shapes the seam.
     */
    _scheduleLoopVoice(startTime, offset, playDuration, crossfade) {
        const ctx = this.engine.audioContext;
        const source = ctx.createBufferSource();
        const voiceGain = ctx.createGain();
        const endTime = startTime + playDuration;
        const fadeInEnd = Math.min(endTime, startTime + crossfade);
        const fadeOutStart = Math.max(fadeInEnd, endTime - crossfade);

        source.buffer = this.buffer;
        source.loop = false;
        voiceGain.gain.setValueAtTime(0, startTime);
        voiceGain.gain.setValueCurveAtTime(this.loopFadeInCurve, startTime, fadeInEnd - startTime);
        voiceGain.gain.setValueAtTime(1, fadeOutStart);
        voiceGain.gain.setValueCurveAtTime(this.loopFadeOutCurve, fadeOutStart, endTime - fadeOutStart);

        source.connect(voiceGain);
        voiceGain.connect(this.loopGainNode);

        const voice = { source, gain: voiceGain };
        this.loopVoices.add(voice);
        source.onended = () => {
            this.loopVoices.delete(voice);
            try {
                source.disconnect();
                voiceGain.disconnect();
            } catch (e) {}
        };

        source.start(startTime, offset);
        source.stop(endTime);
    }

    /**
     * Internal: Track loop progress for UI
     */
    _trackLoopProgress() {
        const duration = this.buffer.duration;
        const startTime = this.loopStartedAt;
        const initialOffset = this.loopInitialOffset;
        const crossfade = this.loopCrossfade;
        const firstCycleDuration = this.loopFirstCycleDuration;
        const cycleDuration = this.loopCycleDuration;

        this.progressInterval = setInterval(() => {
            if (!this.isPlaying) return;

            const elapsed = this.engine.audioContext.currentTime - startTime;
            if (crossfade > 0 && elapsed >= firstCycleDuration) {
                this.progress = ((elapsed - firstCycleDuration) % cycleDuration) / duration;
            } else {
                this.progress = ((initialOffset + elapsed) % duration) / duration;
            }

            if (this.onProgressUpdate) {
                this.onProgressUpdate(this.progress);
            }
        }, 50);
    }

    /**
     * Internal: Schedule intermittent playback
     */
    _scheduleIntermittent() {
        if (!this.isPlaying) return;

        // Calculate random delay
        const minDelay = Math.min(this.config.minDelay, this.config.maxDelay);
        const maxDelay = Math.max(this.config.minDelay, this.config.maxDelay);
        let delaySeconds = this.config.randomizeDelay
            ? this._randomBetween(minDelay, maxDelay)
            : minDelay;
        if (this.isFirstIntermittent && this.config.firstDelayMax > 0) {
            const firstMin = Math.min(this.config.firstDelayMin, this.config.firstDelayMax);
            delaySeconds = this._randomBetween(firstMin, this.config.firstDelayMax);
        }
        this.isFirstIntermittent = false;
        const delay = delaySeconds * 1000;

        this.intermittentTimeout = setTimeout(() => {
            if (!this.isPlaying) return;
            this._playIntermittentOnce();
        }, delay);
    }

    /**
     * Internal: Play one instance of intermittent sound
     */
    _playIntermittentOnce() {
        const buffer = this._pickIntermittentBuffer();
        if (!this.isPlaying || !buffer) return;

        const ctx = this.engine.audioContext;
        const now = ctx.currentTime;

        // Random volume within range
        const minVolume = Math.min(this.config.minVolume, this.config.maxVolume);
        const maxVolume = Math.max(this.config.minVolume, this.config.maxVolume);
        const randomVolume = this.config.randomizeVolume
            ? this._randomBetween(minVolume, maxVolume)
            : minVolume;
        const finalVolume = this.volume * randomVolume;

        // Pitch varies per play, as the game does. playbackRate also changes length.
        const rate = this._randomPlaybackRate();
        const playDuration = buffer.duration / rate;

        // Create nodes: source -> gain -> (panner) -> layer output
        const output = this.analyser || this.engine.masterGain;
        this.gainNode = ctx.createGain();
        const panner = this._createRandomPanner(ctx);
        if (panner) {
            this.gainNode.connect(panner);
            panner.connect(output);
        } else {
            this.gainNode.connect(output);
        }

        // Fade in
        const fadeIn = Math.min(this.config.fadeIn, playDuration / 2);
        const fadeOut = Math.min(this.config.fadeOut, playDuration / 2);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(finalVolume, now + fadeIn);

        // Fade out
        const fadeOutStart = Math.max(now + fadeIn, now + playDuration - fadeOut);
        this.gainNode.gain.setValueAtTime(finalVolume, fadeOutStart);
        this.gainNode.gain.linearRampToValueAtTime(0, now + playDuration);

        // Create and play source
        this.currentSource = ctx.createBufferSource();
        this.currentSource.buffer = buffer;
        this.currentSource.playbackRate.value = rate;
        this.currentSource.connect(this.gainNode);
        this.currentSource.start(now);
        const gainForCleanup = this.gainNode;

        // Track progress for this play
        this._trackIntermittentProgress(buffer, playDuration);

        // Schedule next play when this one ends
        this.currentSource.onended = () => {
            try {
                gainForCleanup.disconnect();
                if (panner) panner.disconnect();
            } catch (e) {}
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
            this.progress = 0;
            if (this.onProgressUpdate) {
                this.onProgressUpdate(0);
            }
            if (this.isPlaying) {
                this._scheduleIntermittent();
            }
        };
    }

    /**
     * Internal: Track intermittent sound progress
     */
    _trackIntermittentProgress(buffer, playDuration = null) {
        const duration = playDuration || buffer.duration;
        const startTime = this.engine.audioContext.currentTime;

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }

        this.progressInterval = setInterval(() => {
            if (!this.isPlaying) return;

            const elapsed = this.engine.audioContext.currentTime - startTime;
            this.progress = Math.min(elapsed / duration, 1);

            if (this.onProgressUpdate) {
                this.onProgressUpdate(this.progress);
            }
        }, 50);
    }

    /**
     * Pick one buffer for intermittent playback
     */
    _pickIntermittentBuffer() {
        if (this.buffers.length === 0) {
            return this.buffer;
        }
        if (this.buffers.length === 1) {
            return this.buffers[0];
        }
        const index = Math.floor(Math.random() * this.buffers.length);
        return this.buffers[index];
    }

    /**
     * Utility: Random number between min and max
     */
    _randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    /**
     * Playback rate for one play, from the pitch range in semitones (1 = unchanged).
     */
    _randomPlaybackRate() {
        const { pitchDown, pitchUp } = this.config;
        if (!pitchDown && !pitchUp) return 1;
        return Math.pow(2, this._randomBetween(pitchDown, pitchUp) / 12);
    }

    /**
     * A stereo panner at a random position within the pan spread, or null for centre.
     */
    _createRandomPanner(ctx) {
        const spread = this.config.panSpread;
        if (!spread || typeof ctx.createStereoPanner !== 'function') return null;
        const panner = ctx.createStereoPanner();
        panner.pan.value = this._randomBetween(-spread, spread);
        return panner;
    }

    /**
     * Export layer configuration
     */
    exportConfig() {
        return {
            ...this.config,
            volume: this.volume
        };
    }
}

/**
 * One-shot sound controller
 */
class OneShotController {
    constructor(engine, config) {
        this.engine = engine;
        this.config = {
            id: config.id,
            name: config.name || 'One-Shot',
            icon: config.icon || 'fa-volume-up'
        };
        this.buffer = null;
        this.volume = Math.max(0, Math.min(1, config.volume ?? 1));
        this.currentSource = null;
        this.isPlaying = false;
        this.onPlayStateChange = null;
    }

    /**
     * Load audio buffer
     */
    async loadBuffer(urlOrFile) {
        if (urlOrFile instanceof File) {
            this.buffer = await this.engine.loadAudioFromFile(urlOrFile);
        } else {
            this.buffer = await this.engine.loadAudioBuffer(urlOrFile);
        }
        return this.buffer;
    }

    /**
     * Set buffer directly
     */
    setBuffer(buffer) {
        this.buffer = buffer;
    }

    /**
     * Play the one-shot
     */
    play() {
        if (!this.buffer) return;

        // Stop any currently playing instance
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {}
        }

        this.isPlaying = true;
        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }

        const ctx = this.engine.audioContext;
        const gainNode = ctx.createGain();
        gainNode.gain.value = this.volume;
        gainNode.connect(this.engine.masterGain);

        this.currentSource = ctx.createBufferSource();
        this.currentSource.buffer = this.buffer;
        this.currentSource.connect(gainNode);
        this.currentSource.start(0);

        this.currentSource.onended = () => {
            this.isPlaying = false;
            this.currentSource = null;
            if (this.onPlayStateChange) {
                this.onPlayStateChange(false);
            }
        };
    }

    /**
     * Set volume
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
    }
}

/**
 * Playlist controller for music layers
 * Plays through multiple tracks with shuffle and crossfade
 */
class PlaylistController {
    constructor(engine, config) {
        this.engine = engine;
        this.config = {
            id: config.id,
            name: config.name || 'Music Playlist',
            type: 'playlist',
            enabled: config.enabled !== false,
            shuffle: config.shuffle !== false, // Default to shuffle on
            repeat: config.repeat !== false,
            crossfadeDuration: Math.max(0, config.crossfadeDuration ?? 3),
            // Silence between tracks, in seconds. WoW zone music waits minutes between
            // tracks. When set, tracks play to the end instead of crossfading.
            trackGapMin: Math.max(0, Number(config.trackGapMin) || 0),
            trackGapMax: Math.max(0, Number(config.trackGapMax) || 0)
        };
        this.gapTimeout = null;

        this.tracks = []; // Array of { name, buffer, file }
        this.volume = Math.max(0, Math.min(1, config.volume ?? 0.7));
        this.isPlaying = false;
        this.currentTrackIndex = -1;
        this.currentSource = null;
        this.nextSource = null;
        this.gainNode = null;
        this.nextGainNode = null;
        this.analyser = createLayerAnalyser(engine);
        this.frequencyData = null;
        this.progress = 0;
        this.progressInterval = null;
        this.crossfadeTimeout = null;
        this.playedIndices = []; // Track which songs have played for shuffle without repeat
        this.onProgressUpdate = null;
        this.onPlayStateChange = null;
        this.onTrackChange = null;
    }

    /**
     * Add a track to the playlist
     */
    async addTrack(file) {
        try {
            const buffer = await this.engine.loadAudioFromFile(file);
            this.tracks.push({
                name: file.name.replace(/\.[^/.]+$/, ''),
                fileName: file.name,
                buffer: buffer,
                duration: buffer.duration
            });
            return true;
        } catch (err) {
            console.error('Error loading track:', file.name, err);
            return false;
        }
    }

    /**
     * Add multiple tracks from files array
     */
    async addTracks(files) {
        const results = [];
        for (const file of files) {
            const success = await this.addTrack(file);
            results.push({ file: file.name, success });
        }
        return results;
    }

    /**
     * Set the buffer for a track directly (for pre-loaded buffers)
     */
    setTrackBuffer(index, buffer, name) {
        if (index < this.tracks.length) {
            this.tracks[index].buffer = buffer;
        } else {
            this.tracks.push({ name, buffer, duration: buffer.duration });
        }
    }

    /**
     * Clear all tracks
     */
    clearTracks() {
        this.stop();
        this.tracks = [];
        this.playedIndices = [];
        this.currentTrackIndex = -1;
    }

    /**
     * Set volume
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.gainNode && this.isPlaying) {
            this.gainNode.gain.setTargetAtTime(this.volume, this.engine.audioContext.currentTime, 0.1);
        }
    }

    getFrequencyData() {
        return readLayerSpectrum(this);
    }

    destroy() {
        this.stop();
        if (this.analyser) {
            try { this.analyser.disconnect(); } catch (e) {}
            this.analyser = null;
        }
        this.frequencyData = null;
    }

    /**
     * Get current track info
     */
    getCurrentTrack() {
        if (this.currentTrackIndex >= 0 && this.currentTrackIndex < this.tracks.length) {
            return this.tracks[this.currentTrackIndex];
        }
        return null;
    }

    /**
     * Start playback
     */
    play() {
        if (this.tracks.length === 0 || this.isPlaying) return;

        this.isPlaying = true;
        this._playNextTrack();

        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }
    }

    /**
     * Stop playback
     */
    stop() {
        this.isPlaying = false;

        if (this.currentSource) {
            try { this.currentSource.stop(); } catch (e) {}
            this.currentSource = null;
        }

        if (this.nextSource) {
            try { this.nextSource.stop(); } catch (e) {}
            this.nextSource = null;
        }

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        if (this.crossfadeTimeout) {
            clearTimeout(this.crossfadeTimeout);
            this.crossfadeTimeout = null;
        }

        if (this.gapTimeout) {
            clearTimeout(this.gapTimeout);
            this.gapTimeout = null;
        }

        this.progress = 0;
        this.playedIndices = [];

        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }

        if (this.onProgressUpdate) {
            this.onProgressUpdate(0);
        }
    }

    /**
     * Toggle playback
     */
    toggle() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    /**
     * Skip to next track
     */
    skip() {
        if (!this.isPlaying || this.tracks.length === 0) return;

        if (this.crossfadeTimeout) {
            clearTimeout(this.crossfadeTimeout);
            this.crossfadeTimeout = null;
        }

        if (this.gapTimeout) {
            clearTimeout(this.gapTimeout);
            this.gapTimeout = null;
        }

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        // Stop current track immediately with a quick fade
        const ctx = this.engine.audioContext;
        const sourceToStop = this.currentSource;
        if (this.gainNode) {
            this.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        }

        setTimeout(() => {
            if (sourceToStop) {
                sourceToStop.onended = null;
                try { sourceToStop.stop(); } catch (e) {}
            }
            if (this.isPlaying) {
                this._playNextTrack();
            }
        }, 500);
    }

    /**
     * Internal: Get next track index (handles shuffle)
     */
    _getNextTrackIndex() {
        if (this.tracks.length === 0) return -1;
        if (this.tracks.length === 1) {
            if (!this.config.repeat && this.playedIndices.includes(0)) {
                return -1;
            }
            return 0;
        }

        if (this.config.shuffle) {
            // Reset played indices if we've played all tracks
            if (this.playedIndices.length >= this.tracks.length) {
                if (!this.config.repeat) {
                    return -1;
                }
                this.playedIndices = [];
            }

            // Get available indices (not yet played)
            const available = [];
            for (let i = 0; i < this.tracks.length; i++) {
                if (!this.playedIndices.includes(i)) {
                    available.push(i);
                }
            }

            // Pick random from available
            const randomIndex = Math.floor(Math.random() * available.length);
            return available[randomIndex];
        } else {
            // Sequential playback
            if (!this.config.repeat && this.currentTrackIndex >= this.tracks.length - 1) {
                return -1;
            }
            return (this.currentTrackIndex + 1) % this.tracks.length;
        }
    }

    /**
     * Internal: Play the next track
     */
    _playNextTrack() {
        if (!this.isPlaying || this.tracks.length === 0) return;

        const nextIndex = this._getNextTrackIndex();
        if (nextIndex === -1) {
            this.stop();
            return;
        }

        this.currentTrackIndex = nextIndex;
        this.playedIndices.push(nextIndex);

        const track = this.tracks[nextIndex];
        const ctx = this.engine.audioContext;

        // Create gain node
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this.volume;
        this.gainNode.connect(this.analyser || this.engine.masterGain);

        // Create and start source
        this.currentSource = ctx.createBufferSource();
        this.currentSource.buffer = track.buffer;
        this.currentSource.connect(this.gainNode);
        this.currentSource.start(0);

        // Notify track change
        if (this.onTrackChange) {
            this.onTrackChange(track);
        }

        // Track progress
        this._trackProgress(track.duration);

        if (this._hasTrackGap()) {
            // Play to the end, then stay silent for the gap.
            const source = this.currentSource;
            source.onended = () => {
                if (!this.isPlaying || this.currentSource !== source) return;
                this.progress = 0;
                if (this.onProgressUpdate) this.onProgressUpdate(0);
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
                const gapMin = Math.min(this.config.trackGapMin, this.config.trackGapMax);
                const gapSeconds = Math.random() * (this.config.trackGapMax - gapMin) + gapMin;
                this.gapTimeout = setTimeout(() => {
                    this.gapTimeout = null;
                    this._playNextTrack();
                }, gapSeconds * 1000);
            };
            return;
        }

        // Schedule crossfade to next track before this one ends
        const crossfadeStart = (track.duration - this.config.crossfadeDuration) * 1000;
        if (crossfadeStart > 0) {
            this.crossfadeTimeout = setTimeout(() => {
                this._crossfadeToNext();
            }, crossfadeStart);
        }

        // Handle track end (backup in case crossfade didn't happen)
        this.currentSource.onended = () => {
            if (this.isPlaying && !this.crossfadeTimeout) {
                this._playNextTrack();
            }
        };
    }

    /**
     * True when this playlist waits in silence between tracks.
     */
    _hasTrackGap() {
        return this.config.trackGapMax > 0;
    }

    /**
     * Internal: Crossfade to next track
     */
    _crossfadeToNext() {
        if (!this.isPlaying || this.tracks.length === 0) return;

        this.crossfadeTimeout = null;

        const nextIndex = this._getNextTrackIndex();
        if (nextIndex === -1) {
            this.stop();
            return;
        }

        const ctx = this.engine.audioContext;
        const now = ctx.currentTime;
        const fadeDuration = this.config.crossfadeDuration;

        // Fade out current
        if (this.gainNode) {
            this.gainNode.gain.setValueAtTime(this.volume, now);
            this.gainNode.gain.linearRampToValueAtTime(0, now + fadeDuration);
        }

        // Prepare next track
        const oldSource = this.currentSource;
        const oldGain = this.gainNode;

        this.currentTrackIndex = nextIndex;
        this.playedIndices.push(nextIndex);

        const track = this.tracks[nextIndex];

        // Create new gain node with fade in
        this.gainNode = ctx.createGain();
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(this.volume, now + fadeDuration);
        this.gainNode.connect(this.analyser || this.engine.masterGain);

        // Create and start new source
        this.currentSource = ctx.createBufferSource();
        this.currentSource.buffer = track.buffer;
        this.currentSource.connect(this.gainNode);
        this.currentSource.start(now);

        // Notify track change
        if (this.onTrackChange) {
            this.onTrackChange(track);
        }

        // Stop old source after fade
        setTimeout(() => {
            if (oldSource) {
                try { oldSource.stop(); } catch (e) {}
            }
        }, fadeDuration * 1000 + 100);

        // Track progress for new track
        this._trackProgress(track.duration);

        // Schedule next crossfade
        const crossfadeStart = (track.duration - fadeDuration) * 1000;
        if (crossfadeStart > 0) {
            this.crossfadeTimeout = setTimeout(() => {
                this._crossfadeToNext();
            }, crossfadeStart);
        }

        // Handle track end
        this.currentSource.onended = () => {
            if (this.isPlaying && !this.crossfadeTimeout) {
                this._playNextTrack();
            }
        };
    }

    /**
     * Internal: Track playback progress
     */
    _trackProgress(duration) {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }

        const startTime = this.engine.audioContext.currentTime;

        this.progressInterval = setInterval(() => {
            if (!this.isPlaying) return;

            const elapsed = this.engine.audioContext.currentTime - startTime;
            this.progress = Math.min(elapsed / duration, 1);

            if (this.onProgressUpdate) {
                this.onProgressUpdate(this.progress);
            }
        }, 50);
    }

    /**
     * Export configuration
     */
    exportConfig() {
        return {
            ...this.config,
            volume: this.volume,
            trackCount: this.tracks.length,
            trackNames: this.tracks.map(t => t.name)
        };
    }
}

// Export for use in other modules
window.AudioEngine = AudioEngine;
window.LayerController = LayerController;
window.OneShotController = OneShotController;
window.PlaylistController = PlaylistController;
