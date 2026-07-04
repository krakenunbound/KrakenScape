/**
 * KrakenScape Audio Engine
 * Handles all audio playback with Web Audio API
 * Supports looping ambient sounds and intermittent random sounds
 */

class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.layers = new Map(); // layerId -> LayerController
        this.oneShots = new Map(); // oneShotId -> buffer
        this.isPlaying = false;
        this.masterVolume = 0.8;
    }

    /**
     * Initialize the audio context (must be called after user interaction)
     */
    async init() {
        if (this.audioContext) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.masterGain.connect(this.audioContext.destination);

        console.log('AudioEngine initialized');
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
        const layer = new LayerController(this, config);
        this.layers.set(config.id, layer);
        return layer;
    }

    /**
     * Remove a sound layer
     */
    removeLayer(layerId) {
        const layer = this.layers.get(layerId);
        if (layer) {
            layer.stop();
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
            // Loop settings
            crossfadeDuration: config.crossfadeDuration || 2,
            // Intermittent settings
            minDelay: config.minDelay || 10,
            maxDelay: config.maxDelay || 60,
            minVolume: config.minVolume || 0.8,
            maxVolume: config.maxVolume || 1,
            fadeIn: config.fadeIn || 0.5,
            fadeOut: config.fadeOut || 1
        };

        this.buffer = null;
        this.volume = config.volume || 0.7;
        this.isPlaying = false;
        this.currentSource = null;
        this.nextSource = null;
        this.gainNode = null;
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
        return this.buffer;
    }

    /**
     * Set the audio buffer directly
     */
    setBuffer(buffer) {
        this.buffer = buffer;
    }

    /**
     * Set volume for this layer
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.gainNode && this.isPlaying) {
            this.gainNode.gain.setTargetAtTime(this.volume, this.engine.audioContext.currentTime, 0.1);
        }
    }

    /**
     * Start playback
     */
    play() {
        if (!this.buffer || this.isPlaying) return;

        this.isPlaying = true;

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

        // Create gain node for this layer
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this.volume;
        this.gainNode.connect(this.engine.masterGain);

        // Create and start the source
        this.currentSource = ctx.createBufferSource();
        this.currentSource.buffer = this.buffer;
        this.currentSource.loop = true;
        this.currentSource.connect(this.gainNode);
        this.currentSource.start(0);

        // Track progress
        this._trackLoopProgress();
    }

    /**
     * Internal: Track loop progress for UI
     */
    _trackLoopProgress() {
        const duration = this.buffer.duration;
        const startTime = this.engine.audioContext.currentTime;

        this.progressInterval = setInterval(() => {
            if (!this.isPlaying) return;

            const elapsed = this.engine.audioContext.currentTime - startTime;
            this.progress = (elapsed % duration) / duration;

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
        const delay = this._randomBetween(this.config.minDelay, this.config.maxDelay) * 1000;

        this.intermittentTimeout = setTimeout(() => {
            if (!this.isPlaying) return;
            this._playIntermittentOnce();
        }, delay);
    }

    /**
     * Internal: Play one instance of intermittent sound
     */
    _playIntermittentOnce() {
        if (!this.isPlaying || !this.buffer) return;

        const ctx = this.engine.audioContext;
        const now = ctx.currentTime;

        // Random volume within range
        const randomVolume = this._randomBetween(this.config.minVolume, this.config.maxVolume);
        const finalVolume = this.volume * randomVolume;

        // Create nodes
        this.gainNode = ctx.createGain();
        this.gainNode.connect(this.engine.masterGain);

        // Fade in
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(finalVolume, now + this.config.fadeIn);

        // Fade out
        const fadeOutStart = now + this.buffer.duration - this.config.fadeOut;
        this.gainNode.gain.setValueAtTime(finalVolume, fadeOutStart);
        this.gainNode.gain.linearRampToValueAtTime(0, now + this.buffer.duration);

        // Create and play source
        this.currentSource = ctx.createBufferSource();
        this.currentSource.buffer = this.buffer;
        this.currentSource.connect(this.gainNode);
        this.currentSource.start(now);

        // Track progress for this play
        this._trackIntermittentProgress();

        // Schedule next play when this one ends
        this.currentSource.onended = () => {
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
    _trackIntermittentProgress() {
        const duration = this.buffer.duration;
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
     * Utility: Random number between min and max
     */
    _randomBetween(min, max) {
        return Math.random() * (max - min) + min;
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
        this.volume = config.volume || 1;
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
            crossfadeDuration: config.crossfadeDuration || 3
        };

        this.tracks = []; // Array of { name, buffer, file }
        this.volume = config.volume || 0.7;
        this.isPlaying = false;
        this.currentTrackIndex = -1;
        this.currentSource = null;
        this.nextSource = null;
        this.gainNode = null;
        this.nextGainNode = null;
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

        // Stop current track immediately with a quick fade
        const ctx = this.engine.audioContext;
        if (this.gainNode) {
            this.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        }

        setTimeout(() => {
            if (this.currentSource) {
                try { this.currentSource.stop(); } catch (e) {}
            }
            this._playNextTrack();
        }, 500);
    }

    /**
     * Internal: Get next track index (handles shuffle)
     */
    _getNextTrackIndex() {
        if (this.tracks.length === 0) return -1;
        if (this.tracks.length === 1) return 0;

        if (this.config.shuffle) {
            // Reset played indices if we've played all tracks
            if (this.playedIndices.length >= this.tracks.length) {
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
            return (this.currentTrackIndex + 1) % this.tracks.length;
        }
    }

    /**
     * Internal: Play the next track
     */
    _playNextTrack() {
        if (!this.isPlaying || this.tracks.length === 0) return;

        const nextIndex = this._getNextTrackIndex();
        if (nextIndex === -1) return;

        this.currentTrackIndex = nextIndex;
        this.playedIndices.push(nextIndex);

        const track = this.tracks[nextIndex];
        const ctx = this.engine.audioContext;

        // Create gain node
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this.volume;
        this.gainNode.connect(this.engine.masterGain);

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
     * Internal: Crossfade to next track
     */
    _crossfadeToNext() {
        if (!this.isPlaying || this.tracks.length === 0) return;

        this.crossfadeTimeout = null;

        const nextIndex = this._getNextTrackIndex();
        if (nextIndex === -1) return;

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
        this.gainNode.connect(this.engine.masterGain);

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
