/**
 * KrakenScape Main Application
 * Ties together the audio engine and UI
 */

class KrakenScapeApp {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.ui = new UIController();

        // Data storage
        this.soundscapes = [];
        this.currentSoundscape = null;
        this.currentMood = null;

        // Layer data (separate from audio engine for persistence)
        this.layerConfigs = new Map();
        this.oneShotConfigs = new Map();

        // File storage for layers (since we can't persist File objects)
        this.audioBuffers = new Map();
    }

    /**
     * Initialize the application
     */
    async init() {
        // Initialize UI
        this.ui.init();

        // Bind UI callbacks
        this._bindUICallbacks();

        // Load saved data from localStorage
        this._loadFromStorage();

        // Render initial state
        this._renderAll();

        // Initialize audio on first user interaction
        document.addEventListener('click', async () => {
            await this.audioEngine.init();
            await this.audioEngine.resume();
        }, { once: true });

        console.log('KrakenScape initialized');
    }

    /**
     * Bind UI callbacks to app methods
     */
    _bindUICallbacks() {
        // Master controls
        this.ui.elements.masterPlay.addEventListener('click', () => this.playAll());
        this.ui.elements.masterStop.addEventListener('click', () => this.stopAll());
        this.ui.onMasterVolumeChange = (value) => this.audioEngine.setMasterVolume(value);

        // Soundscape callbacks
        this.ui.onSoundscapeCreate = (name) => this.createSoundscape(name);
        this.ui.onSoundscapeSelect = (id) => this.selectSoundscape(id);
        this.ui.onSoundscapeRename = (id, name) => this.renameSoundscape(id, name);
        this.ui.onSoundscapeDuplicate = (id) => this.duplicateSoundscape(id);
        this.ui.onSoundscapeDelete = (id) => this.deleteSoundscape(id);
        this.ui.onSearch = (query) => this.searchSoundscapes(query);

        // Mood callbacks
        this.ui.onMoodCreate = (name) => this.createMood(name);
        this.ui.onMoodSelect = (id) => this.selectMood(id);
        this.ui.onMoodRename = (id, name) => this.renameMood(id, name);
        this.ui.onMoodUpdate = (id) => this.updateMoodFromCurrent(id);
        this.ui.onMoodDelete = (id) => this.deleteMood(id);

        // Layer callbacks
        this.ui.onLayerSave = (config) => this.saveLayer(config);
        this.ui.onLayerToggle = (id) => this.toggleLayer(id);
        this.ui.onLayerVolumeChange = (id, value) => this.setLayerVolume(id, value);
        this.ui.onLayerEdit = (id) => this.editLayer(id);
        this.ui.onLayerDelete = (id) => this.deleteLayer(id);

        // One-shot callbacks
        this.ui.onOneShotSave = (config) => this.saveOneShot(config);
        this.ui.onOneShotPlay = (id) => this.playOneShot(id);
        this.ui.onOneShotEdit = (id) => this.editOneShot(id);
        this.ui.onOneShotDelete = (id) => this.deleteOneShot(id);
    }

    /**
     * Play all enabled layers
     */
    async playAll() {
        await this.audioEngine.init();
        await this.audioEngine.resume();

        this.layerConfigs.forEach((config, id) => {
            if (config.enabled !== false) {
                const layer = this.audioEngine.getLayer(id);
                if (layer && layer.buffer) {
                    layer.play();
                }
            }
        });

        this.ui.updateMasterPlayState(true);
    }

    /**
     * Stop all layers
     */
    stopAll() {
        this.audioEngine.stopAll();
        this.ui.updateMasterPlayState(false);

        // Update UI for all layers
        this.layerConfigs.forEach((config, id) => {
            this.ui.updateLayerPlayState(id, false);
            this.ui.updateLayerProgress(id, 0);
        });
    }

    // ==================== SOUNDSCAPE METHODS ====================

    /**
     * Create a new soundscape
     */
    createSoundscape(name) {
        const soundscape = {
            id: 'soundscape_' + Date.now(),
            name: name,
            moods: [],
            layers: [],
            oneShots: []
        };

        this.soundscapes.push(soundscape);
        this.selectSoundscape(soundscape.id);
        this._saveToStorage();
    }

    /**
     * Select a soundscape
     */
    selectSoundscape(id) {
        this.currentSoundscape = this.soundscapes.find(s => s.id === id);
        this.currentMood = null;

        if (this.currentSoundscape) {
            // Stop all current audio
            this.stopAll();

            // Clear current layers
            this.layerConfigs.clear();
            this.oneShotConfigs.clear();

            // Load soundscape layers
            this.currentSoundscape.layers.forEach(layerConfig => {
                this.layerConfigs.set(layerConfig.id, layerConfig);
                this._createAudioLayer(layerConfig);
            });

            // Load one-shots
            this.currentSoundscape.oneShots.forEach(oneShotConfig => {
                this.oneShotConfigs.set(oneShotConfig.id, oneShotConfig);
            });
        }

        this._renderAll();
    }

    /**
     * Rename a soundscape
     */
    renameSoundscape(id, newName) {
        const soundscape = this.soundscapes.find(s => s.id === id);
        if (soundscape) {
            soundscape.name = newName;
            this._saveToStorage();
            this._renderAll();
        }
    }

    /**
     * Duplicate a soundscape
     */
    duplicateSoundscape(id) {
        const original = this.soundscapes.find(s => s.id === id);
        if (original) {
            const copy = JSON.parse(JSON.stringify(original));
            copy.id = 'soundscape_' + Date.now();
            copy.name = original.name + ' (Copy)';

            // Update IDs for moods, layers, and oneshots
            copy.moods = copy.moods.map(m => ({ ...m, id: 'mood_' + Date.now() + Math.random() }));
            copy.layers = copy.layers.map(l => ({ ...l, id: 'layer_' + Date.now() + Math.random() }));
            copy.oneShots = copy.oneShots.map(o => ({ ...o, id: 'oneshot_' + Date.now() + Math.random() }));

            this.soundscapes.push(copy);
            this._saveToStorage();
            this._renderAll();
        }
    }

    /**
     * Delete a soundscape
     */
    deleteSoundscape(id) {
        const index = this.soundscapes.findIndex(s => s.id === id);
        if (index !== -1) {
            this.soundscapes.splice(index, 1);

            if (this.currentSoundscape?.id === id) {
                this.currentSoundscape = null;
                this.currentMood = null;
                this.stopAll();
                this.layerConfigs.clear();
                this.oneShotConfigs.clear();
            }

            this._saveToStorage();
            this._renderAll();
        }
    }

    /**
     * Search soundscapes
     */
    searchSoundscapes(query) {
        const filtered = query
            ? this.soundscapes.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
            : this.soundscapes;

        this.ui.renderSoundscapeList(filtered, this.currentSoundscape?.id);
    }

    // ==================== MOOD METHODS ====================

    /**
     * Create a new mood (snapshot of current layer settings)
     */
    createMood(name) {
        if (!this.currentSoundscape) {
            alert('Please select a soundscape first.');
            return;
        }

        const mood = {
            id: 'mood_' + Date.now(),
            name: name,
            layerSettings: this._captureLayerSettings()
        };

        this.currentSoundscape.moods.push(mood);
        this._saveToStorage();
        this._renderAll();
    }

    /**
     * Select and apply a mood
     */
    selectMood(id) {
        if (!this.currentSoundscape) return;

        const mood = this.currentSoundscape.moods.find(m => m.id === id);
        if (mood) {
            this.currentMood = mood;
            this._applyMoodSettings(mood.layerSettings);
            this._renderAll();
        }
    }

    /**
     * Rename a mood
     */
    renameMood(id, newName) {
        if (!this.currentSoundscape) return;

        const mood = this.currentSoundscape.moods.find(m => m.id === id);
        if (mood) {
            mood.name = newName;
            this._saveToStorage();
            this._renderAll();
        }
    }

    /**
     * Update mood from current settings
     */
    updateMoodFromCurrent(id) {
        if (!this.currentSoundscape) return;

        const mood = this.currentSoundscape.moods.find(m => m.id === id);
        if (mood) {
            mood.layerSettings = this._captureLayerSettings();
            this._saveToStorage();
        }
    }

    /**
     * Delete a mood
     */
    deleteMood(id) {
        if (!this.currentSoundscape) return;

        const index = this.currentSoundscape.moods.findIndex(m => m.id === id);
        if (index !== -1) {
            this.currentSoundscape.moods.splice(index, 1);

            if (this.currentMood?.id === id) {
                this.currentMood = null;
            }

            this._saveToStorage();
            this._renderAll();
        }
    }

    /**
     * Capture current layer settings for mood
     */
    _captureLayerSettings() {
        const settings = [];
        this.layerConfigs.forEach((config, id) => {
            const layer = this.audioEngine.getLayer(id);
            settings.push({
                layerId: id,
                volume: layer?.volume || config.volume,
                enabled: layer?.isPlaying || false
            });
        });
        return settings;
    }

    /**
     * Apply mood settings to layers
     */
    _applyMoodSettings(settings) {
        // First stop all layers
        this.audioEngine.layers.forEach(layer => layer.stop());

        // Apply settings
        settings.forEach(setting => {
            const layer = this.audioEngine.getLayer(setting.layerId);
            const config = this.layerConfigs.get(setting.layerId);

            if (layer) {
                layer.setVolume(setting.volume);
                this.ui.updateLayerVolume(setting.layerId, setting.volume);

                if (setting.enabled && layer.buffer) {
                    layer.play();
                }
            }

            if (config) {
                config.volume = setting.volume;
            }
        });
    }

    // ==================== LAYER METHODS ====================

    /**
     * Save a layer (create or update)
     */
    async saveLayer(config) {
        if (!this.currentSoundscape) {
            alert('Please select a soundscape first.');
            return;
        }

        await this.audioEngine.init();

        // Store config
        this.layerConfigs.set(config.id, config);

        // Load audio buffer if file provided
        if (config.file) {
            try {
                const buffer = await this.audioEngine.loadAudioFromFile(config.file);
                this.audioBuffers.set(config.id, buffer);

                // Create or update audio layer
                this._createAudioLayer(config, buffer);
            } catch (err) {
                console.error('Error loading audio file:', err);
                alert('Error loading audio file. Please try a different file.');
                return;
            }
        }

        // Update soundscape
        const existingIndex = this.currentSoundscape.layers.findIndex(l => l.id === config.id);
        const storableConfig = { ...config };
        delete storableConfig.file; // Don't store File object

        if (existingIndex !== -1) {
            this.currentSoundscape.layers[existingIndex] = storableConfig;
        } else {
            this.currentSoundscape.layers.push(storableConfig);
        }

        this._saveToStorage();
        this._renderAll();
    }

    /**
     * Create audio layer from config
     */
    _createAudioLayer(config, buffer = null) {
        // Remove existing layer if any
        this.audioEngine.removeLayer(config.id);

        // Create new layer
        const layer = this.audioEngine.createLayer({
            id: config.id,
            name: config.name,
            type: config.type,
            volume: config.volume,
            crossfadeDuration: config.crossfadeDuration,
            minDelay: config.minDelay,
            maxDelay: config.maxDelay,
            minVolume: config.minVolume,
            maxVolume: config.maxVolume,
            fadeIn: config.fadeIn,
            fadeOut: config.fadeOut
        });

        // Set buffer if provided
        if (buffer) {
            layer.setBuffer(buffer);
        } else if (this.audioBuffers.has(config.id)) {
            layer.setBuffer(this.audioBuffers.get(config.id));
        }

        // Bind progress callback
        layer.onProgressUpdate = (progress) => {
            this.ui.updateLayerProgress(config.id, progress);
        };

        layer.onPlayStateChange = (isPlaying) => {
            this.ui.updateLayerPlayState(config.id, isPlaying);
        };

        return layer;
    }

    /**
     * Toggle layer play/pause
     */
    async toggleLayer(id) {
        await this.audioEngine.init();
        await this.audioEngine.resume();

        const layer = this.audioEngine.getLayer(id);
        if (layer) {
            layer.toggle();
        }
    }

    /**
     * Set layer volume
     */
    setLayerVolume(id, value) {
        const layer = this.audioEngine.getLayer(id);
        if (layer) {
            layer.setVolume(value);
        }

        // Update config
        const config = this.layerConfigs.get(id);
        if (config) {
            config.volume = value;
        }
    }

    /**
     * Edit a layer
     */
    editLayer(id) {
        const config = this.layerConfigs.get(id);
        if (config) {
            this.ui.showLayerModal(false, config);
        }
    }

    /**
     * Delete a layer
     */
    deleteLayer(id) {
        // Remove from audio engine
        this.audioEngine.removeLayer(id);

        // Remove from configs
        this.layerConfigs.delete(id);
        this.audioBuffers.delete(id);

        // Remove from soundscape
        if (this.currentSoundscape) {
            const index = this.currentSoundscape.layers.findIndex(l => l.id === id);
            if (index !== -1) {
                this.currentSoundscape.layers.splice(index, 1);
            }
        }

        this._saveToStorage();
        this._renderAll();
    }

    // ==================== ONE-SHOT METHODS ====================

    /**
     * Save a one-shot
     */
    async saveOneShot(config) {
        if (!this.currentSoundscape) {
            alert('Please select a soundscape first.');
            return;
        }

        await this.audioEngine.init();

        // Store config
        this.oneShotConfigs.set(config.id, config);

        // Load audio buffer if file provided
        if (config.file) {
            try {
                const buffer = await this.audioEngine.loadAudioFromFile(config.file);
                this.audioBuffers.set(config.id, buffer);
            } catch (err) {
                console.error('Error loading audio file:', err);
                alert('Error loading audio file. Please try a different file.');
                return;
            }
        }

        // Update soundscape
        const existingIndex = this.currentSoundscape.oneShots.findIndex(o => o.id === config.id);
        const storableConfig = { ...config };
        delete storableConfig.file;

        if (existingIndex !== -1) {
            this.currentSoundscape.oneShots[existingIndex] = storableConfig;
        } else {
            this.currentSoundscape.oneShots.push(storableConfig);
        }

        this._saveToStorage();
        this._renderAll();
    }

    /**
     * Play a one-shot
     */
    async playOneShot(id) {
        await this.audioEngine.init();
        await this.audioEngine.resume();

        const buffer = this.audioBuffers.get(id);
        const config = this.oneShotConfigs.get(id);

        if (buffer) {
            this.ui.updateOneShotPlayState(id, true);

            const source = this.audioEngine.playOneShot(buffer, config?.volume || 1);

            source.onended = () => {
                this.ui.updateOneShotPlayState(id, false);
            };
        }
    }

    /**
     * Edit a one-shot
     */
    editOneShot(id) {
        const config = this.oneShotConfigs.get(id);
        if (config) {
            this.ui.showLayerModal(true, config);
        }
    }

    /**
     * Delete a one-shot
     */
    deleteOneShot(id) {
        this.oneShotConfigs.delete(id);
        this.audioBuffers.delete(id);

        if (this.currentSoundscape) {
            const index = this.currentSoundscape.oneShots.findIndex(o => o.id === id);
            if (index !== -1) {
                this.currentSoundscape.oneShots.splice(index, 1);
            }
        }

        this._saveToStorage();
        this._renderAll();
    }

    // ==================== STORAGE METHODS ====================

    /**
     * Save data to localStorage
     */
    _saveToStorage() {
        try {
            localStorage.setItem('krakenscape_soundscapes', JSON.stringify(this.soundscapes));
        } catch (err) {
            console.error('Error saving to localStorage:', err);
        }
    }

    /**
     * Load data from localStorage
     */
    _loadFromStorage() {
        try {
            const saved = localStorage.getItem('krakenscape_soundscapes');
            if (saved) {
                this.soundscapes = JSON.parse(saved);
            }
        } catch (err) {
            console.error('Error loading from localStorage:', err);
            this.soundscapes = [];
        }
    }

    // ==================== RENDER METHODS ====================

    /**
     * Render all UI components
     */
    _renderAll() {
        // Render soundscape list
        this.ui.renderSoundscapeList(this.soundscapes, this.currentSoundscape?.id);

        // Render mood list
        const moods = this.currentSoundscape?.moods || [];
        this.ui.renderMoodList(moods, this.currentMood?.id);

        // Render layers
        const layers = Array.from(this.layerConfigs.values());
        this.ui.renderSoundLayers(layers);

        // Render one-shots
        const oneShots = Array.from(this.oneShotConfigs.values());
        this.ui.renderOneShots(oneShots);

        // Update status
        this.ui.updateStatus(this.currentSoundscape?.name, this.currentMood?.name);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new KrakenScapeApp();
    window.app.init();
});
