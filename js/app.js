/**
 * KrakenScape Main Application
 * Ties together the audio engine and UI
 */

class KrakenScapeApp {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.audioStorage = new AudioStorage();
        this.dataManager = new DataManager(this);
        this.historyManager = new HistoryManager(this);
        this.ui = new UIController();

        // Data storage
        this.soundscapes = [];
        this.currentSoundscape = null;
        this.currentMood = null;

        // Layer data (separate from audio engine for persistence)
        this.layerConfigs = new Map();
        this.oneShotConfigs = new Map();

        // In-memory audio buffers (decoded from IndexedDB)
        this.audioBuffers = new Map();

        // Playback state
        this.isPlaying = false;
        this.isMuted = false;
        this.preMuteVolume = 0.8;
    }

    /**
     * Initialize the application
     */
    async init() {
        // Initialize audio storage (IndexedDB)
        await this.audioStorage.init();

        // Initialize UI
        this.ui.init();

        // Bind UI callbacks
        this._bindUICallbacks();

        // Load saved data from localStorage
        this._loadFromStorage();

        // Restore last session selection if available
        const restored = await this._restoreSession();
        if (!restored) {
            // Render initial state
            this._renderAll();
        }

        // Initialize audio on first user interaction
        document.addEventListener('click', async () => {
            await this.audioEngine.init();
            await this.audioEngine.resume();
            // Start level meter animation
            this._startLevelMeter();
        }, { once: true });

        // Show storage stats
        const stats = await this.audioStorage.getStats();
        console.log(`KrakenScape initialized - ${stats.count} audio files stored (${(stats.totalSize / 1024 / 1024).toFixed(1)} MB)`);

        // Check storage quota
        const quota = await this.audioStorage.checkQuota();
        if (quota.warning) {
            this.ui.showStorageWarning(quota.percent, quota.used, quota.quota);
        }

        window.addEventListener('beforeunload', () => {
            this._saveToStorage();
            this._saveSessionState();
        });
    }

    /**
     * Start the audio level meter animation loop
     */
    _startLevelMeter() {
        const levelMeterEl = document.getElementById('levelMeter');
        if (!levelMeterEl) return;

        const updateMeter = () => {
            const level = this.audioEngine.getMasterLevel();
            const percent = Math.round(level * 100);

            levelMeterEl.style.width = percent + '%';

            // Add visual classes based on level
            levelMeterEl.classList.remove('loud', 'clipping');
            if (level > 0.9) {
                levelMeterEl.classList.add('clipping');
            } else if (level > 0.7) {
                levelMeterEl.classList.add('loud');
            }

            requestAnimationFrame(updateMeter);
        };

        requestAnimationFrame(updateMeter);
    }

    /**
     * Bind UI callbacks to app methods
     */
    _bindUICallbacks() {
        // Master controls
        this.ui.elements.masterPlay.addEventListener('click', () => this.playAll());
        this.ui.elements.masterStop.addEventListener('click', () => this.stopAll());
        this.ui.onMasterVolumeChange = (value) => this.audioEngine.setMasterVolume(value);
        this.ui.onMasterToggle = () => this.toggleMasterPlayback();
        this.ui.onMuteToggle = () => this.toggleMute();

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
        this.ui.onLayerSkip = (id) => this.skipLayerTrack(id);
        this.ui.onLayerReorder = (draggedId, targetId) => this.reorderLayer(draggedId, targetId);

        // One-shot callbacks
        this.ui.onOneShotSave = (config) => this.saveOneShot(config);
        this.ui.onOneShotPlay = (id) => this.playOneShot(id);
        this.ui.onOneShotEdit = (id) => this.editOneShot(id);
        this.ui.onOneShotDelete = (id) => this.deleteOneShot(id);
        this.ui.onOneShotVolumeChange = (id, value) => this.setOneShotVolume(id, value);

        // Drag and drop callback
        this.ui.onFilesDropped = (files, type) => this.handleDroppedFiles(files, type);

        // Import/Export
        this.ui.onExportSoundscape = (id) => this.dataManager.exportSoundscape(id);
        this.ui.onImportFile = (file) => this.dataManager.handleImportFile(file);
        this.ui.onImportWowFolder = (files) => this.dataManager.handleWowFolderImport(files);

        // Undo/Redo buttons
        document.getElementById('undoBtn')?.addEventListener('click', () => this.historyManager.undo());
        document.getElementById('redoBtn')?.addEventListener('click', () => this.historyManager.redo());

        // Keyboard shortcuts for undo/redo
        this.ui.onUndo = () => this.historyManager.undo();
        this.ui.onRedo = () => this.historyManager.redo();
    }

    /**
     * Handle files dropped onto the UI
     */
    async handleDroppedFiles(files, type) {
        if (!this.currentSoundscape) {
            alert('Please select or create a soundscape first.');
            return;
        }

        await this.audioEngine.init();

        for (const file of files) {
            // Extract name from filename (without extension)
            const name = file.name.replace(/\.[^/.]+$/, '');

            const config = {
                id: (type === 'layer' ? 'layer_' : 'oneshot_') + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: name,
                type: type === 'layer' ? 'loop' : 'oneshot', // Default to loop for layers
                volume: 0.7,
                file: file,
                fileName: file.name,
                enabled: true,
                autoPlay: false,
                randomStart: false,
                randomizeDelay: true,
                randomizeVolume: true,
                // Default settings
                crossfadeDuration: 2,
                minDelay: 10,
                maxDelay: 60,
                minVolume: 0.8,
                maxVolume: 1,
                fadeIn: 0.5,
                fadeOut: 1
            };

            if (type === 'layer') {
                await this.saveLayer(config);
            } else {
                await this.saveOneShot(config);
            }
        }
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
                if (layer) {
                    layer.play();
                }
            }
        });

        this.isPlaying = true;
        this.ui.updateMasterPlayState(true);
    }

    /**
     * Stop all layers
     */
    stopAll() {
        this.isPlaying = false;
        this.audioEngine.stopAll();
        this.ui.updateMasterPlayState(false);

        // Update UI for all layers
        this.layerConfigs.forEach((config, id) => {
            this.ui.updateLayerPlayState(id, false);
            this.ui.updateLayerProgress(id, 0);
        });
    }

    /**
     * Toggle master playback (for keyboard shortcut)
     */
    toggleMasterPlayback() {
        if (this.isPlaying) {
            this.stopAll();
        } else {
            this.playAll();
        }
    }

    /**
     * Toggle mute (for keyboard shortcut)
     */
    toggleMute() {
        if (this.isMuted) {
            // Unmute - restore previous volume
            this.audioEngine.setMasterVolume(this.preMuteVolume);
            this.ui.elements.masterVolume.value = this.preMuteVolume * 100;
            this.isMuted = false;
            this.ui.updateMuteState(false);
        } else {
            // Mute - save current volume and set to 0
            this.preMuteVolume = this.ui.elements.masterVolume.value / 100;
            this.audioEngine.setMasterVolume(0);
            this.isMuted = true;
            this.ui.updateMuteState(true);
        }
    }

    // ==================== SOUNDSCAPE METHODS ====================

    /**
     * Create a new soundscape
     */
    createSoundscape(name) {
        const soundscape = this._createSoundscapeRecord(name);

        this.soundscapes.push(soundscape);
        this.selectSoundscape(soundscape.id);
        this._saveToStorage();
    }

    /**
     * Create a soundscape record
     */
    _createSoundscapeRecord(name, extra = {}) {
        return {
            id: 'soundscape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            name: name,
            moods: [],
            layers: [],
            oneShots: [],
            ...extra
        };
    }

    /**
     * Select a soundscape and load its audio from IndexedDB
     */
    async selectSoundscape(id) {
        this.currentSoundscape = this.soundscapes.find(s => s.id === id);
        this.currentMood = null;

        if (this.currentSoundscape) {
            // Stop all current audio
            this.stopAll();

            // Clear current layers
            this.layerConfigs.clear();
            this.oneShotConfigs.clear();
            this.audioBuffers.clear();

            // Initialize audio engine
            await this.audioEngine.init();

            // Load soundscape layers and their audio from IndexedDB
            for (const layerConfig of this.currentSoundscape.layers) {
                this.layerConfigs.set(layerConfig.id, layerConfig);
                const layer = await this._loadAndCreateLayer(layerConfig);
                if (layerConfig.autoPlay && layer) {
                    layer.play();
                }
            }

            // Load one-shots and their audio from IndexedDB
            for (const oneShotConfig of this.currentSoundscape.oneShots) {
                this.oneShotConfigs.set(oneShotConfig.id, oneShotConfig);
                await this._loadOneShotAudio(oneShotConfig.id);
            }
        }

        this._renderAll();
        this._saveSessionState();
    }

    /**
     * Load audio from IndexedDB and create layer
     */
    async _loadAndCreateLayer(config) {
        if (config.type === 'playlist') {
            return await this._loadAndCreatePlaylistLayer(config);
        }

        if ((config.layerTrackCount || 0) > 0 || (config.layerTrackNames && config.layerTrackNames.length > 0)) {
            const layer = this._createAudioLayer(config);
            await this._loadLayerTracksIntoLayer(layer, config);
            return layer;
        }

        // Check if audio exists in IndexedDB
        const stored = await this.audioStorage.getAudio(config.id);

        if (stored) {
            try {
                // Decode the stored ArrayBuffer
                const buffer = await this.audioEngine.audioContext.decodeAudioData(stored.arrayBuffer.slice(0));
                this.audioBuffers.set(config.id, buffer);
                console.log(`Loaded audio for layer: ${config.name}`);
                return this._createAudioLayer(config, buffer);
            } catch (err) {
                console.error(`Failed to decode audio for ${config.name}:`, err);
                return this._createAudioLayer(config, null);
            }
        } else {
            // No stored audio, create layer without buffer
            return this._createAudioLayer(config, null);
        }
    }

    /**
     * Load buffered tracks into a standard layer for random intermittent playback
     */
    async _loadLayerTracksIntoLayer(layer, config) {
        const tracks = await this.audioStorage.getLayerTracks(config.id);

        if (tracks.length > 0) {
            if (!config.layerTrackNames || config.layerTrackNames.length === 0) {
                config.layerTrackNames = tracks.map(track => track.fileName);
                config.layerTrackCount = tracks.length;
            }

            const decoded = [];
            for (const track of tracks) {
                try {
                    const buffer = await this.audioEngine.audioContext.decodeAudioData(track.arrayBuffer.slice(0));
                    decoded.push(buffer);
                } catch (err) {
                    console.error(`Failed to decode layer track ${track.fileName}:`, err);
                }
            }

            if (decoded.length > 0) {
                layer.setBufferPool(decoded);
            }
        }
    }

    /**
     * Load playlist tracks from IndexedDB and create playlist layer
     */
    async _loadAndCreatePlaylistLayer(config) {
        const layer = this._createAudioLayer(config);
        await this._loadPlaylistTracksIntoLayer(layer, config);
        return layer;
    }

    /**
     * Load playlist tracks into an existing playlist layer
     */
    async _loadPlaylistTracksIntoLayer(layer, config) {
        const tracks = await this.audioStorage.getPlaylistTracks(config.id);

        if (tracks.length > 0) {
            if (!config.playlistTrackNames || config.playlistTrackNames.length === 0) {
                config.playlistTrackNames = tracks.map(track => track.fileName);
                config.playlistTrackCount = tracks.length;
            }

            const decoded = [];
            for (const track of tracks) {
                try {
                    const buffer = await this.audioEngine.audioContext.decodeAudioData(track.arrayBuffer.slice(0));
                    decoded.push({ buffer, name: track.fileName });
                } catch (err) {
                    console.error(`Failed to decode playlist track ${track.fileName}:`, err);
                }
            }

            decoded.forEach((track, index) => {
                layer.setTrackBuffer(index, track.buffer, track.name);
            });
        }
    }

    /**
     * Load one-shot audio from IndexedDB
     */
    async _loadOneShotAudio(id) {
        const stored = await this.audioStorage.getAudio(id);

        if (stored) {
            try {
                await this.audioEngine.init();
                const buffer = await this.audioEngine.audioContext.decodeAudioData(stored.arrayBuffer.slice(0));
                this.audioBuffers.set(id, buffer);
                console.log(`Loaded audio for one-shot: ${id}`);
            } catch (err) {
                console.error(`Failed to decode one-shot audio ${id}:`, err);
            }
        }
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
     * Duplicate a soundscape (including audio files)
     */
    async duplicateSoundscape(id) {
        const original = this.soundscapes.find(s => s.id === id);
        if (original) {
            const copy = JSON.parse(JSON.stringify(original));
            const newSoundscapeId = 'soundscape_' + Date.now();
            copy.id = newSoundscapeId;
            copy.name = original.name + ' (Copy)';

            // Create ID mappings for layers and oneshots
            const layerIdMap = new Map();
            const oneShotIdMap = new Map();

            // Update layer IDs and copy audio
            for (let i = 0; i < copy.layers.length; i++) {
                const oldId = copy.layers[i].id;
                const newId = 'layer_' + Date.now() + '_' + i;
                layerIdMap.set(oldId, newId);
                copy.layers[i].id = newId;

                if (copy.layers[i].type === 'playlist') {
                    const tracks = await this.audioStorage.getPlaylistTracks(oldId);
                    for (let t = 0; t < tracks.length; t++) {
                        const track = tracks[t];
                        const blob = new Blob([track.arrayBuffer], { type: track.mimeType });
                        const file = new File([blob], track.fileName, { type: track.mimeType });
                        await this.audioStorage.storeAudio(`${newId}_track_${t}`, newSoundscapeId, file, 'playlist_track');
                    }
                    copy.layers[i].playlistTrackNames = tracks.map(t => t.fileName);
                    copy.layers[i].playlistTrackCount = tracks.length;
                } else if ((copy.layers[i].layerTrackCount || 0) > 0 || (copy.layers[i].layerTrackNames && copy.layers[i].layerTrackNames.length > 0)) {
                    const tracks = await this.audioStorage.getLayerTracks(oldId);
                    for (let t = 0; t < tracks.length; t++) {
                        const track = tracks[t];
                        const blob = new Blob([track.arrayBuffer], { type: track.mimeType });
                        const file = new File([blob], track.fileName, { type: track.mimeType });
                        await this.audioStorage.storeAudio(`${newId}_track_${t}`, newSoundscapeId, file, 'layer_track');
                    }
                    copy.layers[i].layerTrackNames = tracks.map(t => t.fileName);
                    copy.layers[i].layerTrackCount = tracks.length;
                } else {
                    // Copy audio from IndexedDB
                    const audio = await this.audioStorage.getAudio(oldId);
                    if (audio) {
                        // Create a fake File-like object to store
                        const blob = new Blob([audio.arrayBuffer], { type: audio.mimeType });
                        const file = new File([blob], audio.fileName, { type: audio.mimeType });
                        await this.audioStorage.storeAudio(newId, newSoundscapeId, file, 'layer');
                    }
                }
            }

            // Update one-shot IDs and copy audio
            for (let i = 0; i < copy.oneShots.length; i++) {
                const oldId = copy.oneShots[i].id;
                const newId = 'oneshot_' + Date.now() + '_' + i;
                oneShotIdMap.set(oldId, newId);
                copy.oneShots[i].id = newId;

                // Copy audio from IndexedDB
                const audio = await this.audioStorage.getAudio(oldId);
                if (audio) {
                    const blob = new Blob([audio.arrayBuffer], { type: audio.mimeType });
                    const file = new File([blob], audio.fileName, { type: audio.mimeType });
                    await this.audioStorage.storeAudio(newId, newSoundscapeId, file, 'oneshot');
                }
            }

            // Update mood references
            copy.moods = copy.moods.map(m => {
                const newMood = { ...m, id: 'mood_' + Date.now() + Math.random() };
                newMood.layerSettings = newMood.layerSettings.map(s => ({
                    ...s,
                    layerId: layerIdMap.get(s.layerId) || s.layerId
                }));
                return newMood;
            });

            this.soundscapes.push(copy);
            this._saveToStorage();
            this._renderAll();
        }
    }

    /**
     * Delete a soundscape (including audio files)
     */
    async deleteSoundscape(id) {
        const index = this.soundscapes.findIndex(s => s.id === id);
        if (index !== -1) {
            // Delete all audio files for this soundscape
            await this.audioStorage.deleteAudioForSoundscape(id);

            // Also delete individual layer/oneshot audio
            const soundscape = this.soundscapes[index];
            for (const layer of soundscape.layers) {
                await this.audioStorage.deleteAudio(layer.id);
            }
            for (const oneShot of soundscape.oneShots) {
                await this.audioStorage.deleteAudio(oneShot.id);
            }

            this.soundscapes.splice(index, 1);

            if (this.currentSoundscape?.id === id) {
                this.currentSoundscape = null;
                this.currentMood = null;
                this.stopAll();
                this.layerConfigs.clear();
                this.oneShotConfigs.clear();
                this.audioBuffers.clear();
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
            this._saveSessionState();
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

                if (setting.enabled) {
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
     * Save a layer (create or update) with IndexedDB audio storage
     */
    async saveLayer(config, options = {}) {
        if (!this.currentSoundscape) {
            alert('Please select a soundscape first.');
            return;
        }

        const {
            skipHistory = false,
            skipPersist = false,
            skipRender = false
        } = options;

        // Save state for undo
        const isNew = !this.layerConfigs.has(config.id);
        if (!skipHistory) {
            this.historyManager.saveState(isNew ? `Add layer "${config.name}"` : `Edit layer "${config.name}"`);
        }

        await this.audioEngine.init();

        // Store config
        this.layerConfigs.set(config.id, config);

        if (config.type === 'playlist') {
            config.layerTrackNames = [];
            config.layerTrackCount = 0;
            await this.audioStorage.deleteAudio(config.id);
            await this.audioStorage.deleteLayerTracks(config.id);
            if (config.playlistFiles && config.playlistFiles.length > 0) {
                await this.audioStorage.deletePlaylistTracks(config.id);
                await this.audioStorage.storePlaylistTracks(
                    config.id,
                    this.currentSoundscape.id,
                    config.playlistFiles
                );
                config.playlistTrackNames = config.playlistFiles.map(file => file.name);
                config.playlistTrackCount = config.playlistFiles.length;
            }

            const layer = this._createAudioLayer(config);
            if (config.playlistFiles && config.playlistFiles.length > 0) {
                layer.clearTracks();
                await layer.addTracks(config.playlistFiles);
            } else {
                await this._loadPlaylistTracksIntoLayer(layer, config);
            }

            const existingIndex = this.currentSoundscape.layers.findIndex(l => l.id === config.id);
            const storableConfig = { ...config };
            delete storableConfig.file;
            delete storableConfig.playlistFiles;

            if (existingIndex !== -1) {
                this.currentSoundscape.layers[existingIndex] = storableConfig;
            } else {
                this.currentSoundscape.layers.push(storableConfig);
            }

            if (!skipPersist) {
                this._saveToStorage();
            }
            if (!skipRender) {
                this._renderAll();
            }
            return;
        }

        if (config.layerFiles && config.layerFiles.length > 0) {
            try {
                await this.audioStorage.deleteAudio(config.id);
                await this.audioStorage.deleteLayerTracks(config.id);
                await this.audioStorage.storeLayerTracks(
                    config.id,
                    this.currentSoundscape.id,
                    config.layerFiles,
                    'layer_track'
                );

                const decoded = [];
                for (const file of config.layerFiles) {
                    const buffer = await this.audioEngine.loadAudioFromFile(file);
                    decoded.push(buffer);
                }

                config.layerTrackNames = config.layerFiles.map(file => file.name);
                config.layerTrackCount = config.layerFiles.length;

                const layer = this._createAudioLayer(config);
                layer.setBufferPool(decoded);
            } catch (err) {
                console.error('Error loading grouped audio files:', err);
                alert('Error loading grouped audio files. Please try a different folder.');
                return;
            }
        } else if (config.file) {
            await this.audioStorage.deleteLayerTracks(config.id);
            config.layerTrackNames = [];
            config.layerTrackCount = 0;

            try {
                // Store in IndexedDB for persistence
                await this.audioStorage.storeAudio(
                    config.id,
                    this.currentSoundscape.id,
                    config.file,
                    'layer'
                );

                // Decode for immediate use
                const buffer = await this.audioEngine.loadAudioFromFile(config.file);
                this.audioBuffers.set(config.id, buffer);

                // Create or update audio layer
                this._createAudioLayer(config, buffer);
            } catch (err) {
                console.error('Error loading audio file:', err);
                alert('Error loading audio file. Please try a different file.');
                return;
            }
        } else if ((config.layerTrackCount || 0) > 0 || (config.layerTrackNames && config.layerTrackNames.length > 0)) {
            const layer = this._createAudioLayer(config);
            await this._loadLayerTracksIntoLayer(layer, config);
        } else {
            const existingBuffer = this.audioBuffers.get(config.id) || null;
            this._createAudioLayer(config, existingBuffer);
        }

        // Update soundscape
        const existingIndex = this.currentSoundscape.layers.findIndex(l => l.id === config.id);
        const storableConfig = { ...config };
        delete storableConfig.file; // Don't store File object
        delete storableConfig.playlistFiles;
        delete storableConfig.layerFiles;

        if (existingIndex !== -1) {
            this.currentSoundscape.layers[existingIndex] = storableConfig;
        } else {
            this.currentSoundscape.layers.push(storableConfig);
        }

        if (!skipPersist) {
            this._saveToStorage();
        }
        if (!skipRender) {
            this._renderAll();
        }
    }

    /**
     * Create audio layer from config
     */
    _createAudioLayer(config, buffer = null, bufferPool = null) {
        // Remove existing layer if any
        this.audioEngine.removeLayer(config.id);

        let layer = null;

        if (config.type === 'playlist') {
            layer = this.audioEngine.createLayer({
                id: config.id,
                name: config.name,
                type: 'playlist',
                volume: config.volume,
                enabled: config.enabled,
                shuffle: config.playlistShuffle,
                repeat: config.playlistRepeat,
                crossfadeDuration: config.playlistCrossfade
            });

            layer.onTrackChange = (track) => {
                this.ui.updateLayerTrackInfo(config.id, track?.name);
            };
        } else {
            // Create new layer
            layer = this.audioEngine.createLayer({
                id: config.id,
                name: config.name,
                type: config.type,
                volume: config.volume,
                enabled: config.enabled,
                crossfadeDuration: config.crossfadeDuration,
                minDelay: config.minDelay,
                maxDelay: config.maxDelay,
                minVolume: config.minVolume,
                maxVolume: config.maxVolume,
                fadeIn: config.fadeIn,
                fadeOut: config.fadeOut,
                randomStart: config.randomStart,
                randomizeDelay: config.randomizeDelay,
                randomizeVolume: config.randomizeVolume
            });
        }

        // Set buffer if provided (only for non-playlist layers)
        if (config.type !== 'playlist') {
            if (bufferPool && bufferPool.length > 0) {
                layer.setBufferPool(bufferPool);
            } else if (buffer) {
                layer.setBuffer(buffer);
            } else if (this.audioBuffers.has(config.id)) {
                layer.setBuffer(this.audioBuffers.get(config.id));
            }
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
     * Skip to next track for playlist layers
     */
    skipLayerTrack(id) {
        const layer = this.audioEngine.getLayer(id);
        if (layer && typeof layer.skip === 'function') {
            layer.skip();
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
            if (this.currentSoundscape) {
                const index = this.currentSoundscape.layers.findIndex(l => l.id === id);
                if (index !== -1) {
                    this.currentSoundscape.layers[index].volume = value;
                }
            }
            this._saveToStorage();
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
     * Reorder a layer (drag and drop)
     */
    reorderLayer(draggedId, targetId) {
        if (!this.currentSoundscape) return;

        const layers = this.currentSoundscape.layers;
        const draggedIndex = layers.findIndex(l => l.id === draggedId);
        const targetIndex = layers.findIndex(l => l.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Save state for undo
        this.historyManager.saveState('Reorder layers');

        // Remove the dragged layer and insert it at the target position
        const [draggedLayer] = layers.splice(draggedIndex, 1);
        layers.splice(targetIndex, 0, draggedLayer);

        // Update layerConfigs Map to maintain order
        const newLayerConfigs = new Map();
        layers.forEach(layer => {
            newLayerConfigs.set(layer.id, this.layerConfigs.get(layer.id));
        });
        this.layerConfigs = newLayerConfigs;

        this._saveToStorage();
        this._renderAll();
    }

    /**
     * Delete a layer (including audio from IndexedDB)
     */
    async deleteLayer(id) {
        // Save state for undo
        const config = this.layerConfigs.get(id);
        this.historyManager.saveState(`Delete layer "${config?.name || id}"`);

        // Remove from audio engine
        this.audioEngine.removeLayer(id);

        // Remove audio from IndexedDB
        if (config?.type === 'playlist') {
            await this.audioStorage.deletePlaylistTracks(id);
        }
        if ((config?.layerTrackCount || 0) > 0 || (config?.layerTrackNames && config.layerTrackNames.length > 0)) {
            await this.audioStorage.deleteLayerTracks(id);
        }
        await this.audioStorage.deleteAudio(id);

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

    /**
     * Import one WoW zone bundle into a new soundscape
     */
    async importWowZoneBundle(bundle, filesByPath) {
        const zone = bundle?.zone || {};
        const soundscapeName = zone.family_name && zone.family_name !== zone.name
            ? `${zone.name} (${zone.family_name})`
            : (zone.name || 'WoW Ambient Import');

        const soundscape = this._createSoundscapeRecord(soundscapeName, {
            source: {
                type: bundle.type,
                version: bundle.version,
                generatedAt: bundle.generated_at || null,
                zoneId: zone.id || null,
                zoneName: zone.name || soundscapeName,
                familyName: zone.family_name || ''
            }
        });

        this.soundscapes.push(soundscape);
        await this.selectSoundscape(soundscape.id);

        let importedCount = 0;
        const groups = Array.isArray(bundle.groups) ? bundle.groups : [];

        for (const group of groups) {
            const files = (group.files || [])
                .map(file => filesByPath.get(file.relative_path))
                .filter(Boolean);

            if (files.length === 0) {
                continue;
            }

            const defaults = group.import_defaults || {};
            const requestedType = defaults.type || group.suggested_layer_type || 'loop';
            const usePlaylist = requestedType === 'playlist' || (requestedType === 'loop' && files.length > 1);
            const config = {
                id: 'layer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                name: group.name || 'Imported Layer',
                type: usePlaylist ? 'playlist' : requestedType,
                volume: defaults.volume ?? (group.category === 'music' ? 0.58 : 0.5),
                enabled: true,
                autoPlay: false,
                randomStart: false,
                randomizeDelay: defaults.randomize_delay !== false,
                randomizeVolume: defaults.randomize_volume !== false,
                crossfadeDuration: defaults.crossfade_duration ?? 4,
                minDelay: defaults.min_delay ?? 8,
                maxDelay: defaults.max_delay ?? 24,
                minVolume: defaults.min_volume ?? 0.75,
                maxVolume: defaults.max_volume ?? 1,
                fadeIn: defaults.fade_in ?? 0.15,
                fadeOut: defaults.fade_out ?? 0.65,
                playlistFiles: usePlaylist ? files : [],
                playlistTrackNames: usePlaylist ? files.map(file => file.name) : [],
                playlistCrossfade: defaults.crossfade_duration ?? 4,
                playlistShuffle: defaults.shuffle !== false,
                playlistRepeat: defaults.repeat !== false,
                layerFiles: !usePlaylist && files.length > 1 ? files : [],
                layerTrackNames: !usePlaylist && files.length > 1 ? files.map(file => file.name) : [],
                file: !usePlaylist && files.length === 1 ? files[0] : null,
                fileName: !usePlaylist && files.length === 1 ? files[0].name : `${files.length} imported files`,
                importSource: {
                    bundleType: bundle.type,
                    zoneId: zone.id || null,
                    zoneName: zone.name || '',
                    familyName: zone.family_name || '',
                    groupId: group.id || '',
                    groupName: group.name || '',
                    category: group.category || '',
                    sourceLabel: group.source_label || '',
                    clipCount: files.length
                }
            };

            await this.saveLayer(config, {
                skipHistory: true,
                skipPersist: true,
                skipRender: true
            });
            importedCount += 1;
        }

        if (importedCount === 0) {
            this.soundscapes = this.soundscapes.filter(entry => entry.id !== soundscape.id);
            if (this.currentSoundscape?.id === soundscape.id) {
                this.currentSoundscape = null;
                this.layerConfigs.clear();
                this.oneShotConfigs.clear();
                this.audioBuffers.clear();
            }
            this._saveToStorage();
            this._renderAll();
            throw new Error(`No importable audio files were found for "${soundscapeName}".`);
        }

        this._saveToStorage();
        this._renderAll();
        return {
            soundscapeId: soundscape.id,
            soundscapeName,
            importedCount
        };
    }

    // ==================== ONE-SHOT METHODS ====================

    /**
     * Save a one-shot with IndexedDB audio storage
     */
    async saveOneShot(config) {
        if (!this.currentSoundscape) {
            alert('Please select a soundscape first.');
            return;
        }

        // Save state for undo
        const isNew = !this.oneShotConfigs.has(config.id);
        this.historyManager.saveState(isNew ? `Add one-shot "${config.name}"` : `Edit one-shot "${config.name}"`);

        await this.audioEngine.init();

        // Store config
        this.oneShotConfigs.set(config.id, config);

        // Load audio buffer and store in IndexedDB if file provided
        if (config.file) {
            try {
                // Store in IndexedDB for persistence
                await this.audioStorage.storeAudio(
                    config.id,
                    this.currentSoundscape.id,
                    config.file,
                    'oneshot'
                );

                // Decode for immediate use
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
     * Set one-shot volume
     */
    setOneShotVolume(id, value) {
        const config = this.oneShotConfigs.get(id);
        if (config) {
            config.volume = value;
            if (this.currentSoundscape) {
                const index = this.currentSoundscape.oneShots.findIndex(o => o.id === id);
                if (index !== -1) {
                    this.currentSoundscape.oneShots[index].volume = value;
                }
            }
            this._saveToStorage();
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
     * Delete a one-shot (including audio from IndexedDB)
     */
    async deleteOneShot(id) {
        // Save state for undo
        const config = this.oneShotConfigs.get(id);
        this.historyManager.saveState(`Delete one-shot "${config?.name || id}"`);

        // Remove audio from IndexedDB
        await this.audioStorage.deleteAudio(id);

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
            this._saveSessionState();
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

    _saveSessionState() {
        try {
            const session = {
                activeSoundscapeId: this.currentSoundscape?.id || null,
                activeMoodId: this.currentMood?.id || null
            };
            localStorage.setItem('krakenscape_session', JSON.stringify(session));
        } catch (err) {
            console.error('Error saving session state:', err);
        }
    }

    async _restoreSession() {
        try {
            const sessionRaw = localStorage.getItem('krakenscape_session');
            if (!sessionRaw) {
                return false;
            }

            const session = JSON.parse(sessionRaw);
            if (!session?.activeSoundscapeId) {
                return false;
            }

            const hasSoundscape = this.soundscapes.some(s => s.id === session.activeSoundscapeId);
            if (!hasSoundscape) {
                return false;
            }

            await this.selectSoundscape(session.activeSoundscapeId);

            if (session.activeMoodId && this.currentSoundscape?.moods) {
                const hasMood = this.currentSoundscape.moods.some(m => m.id === session.activeMoodId);
                if (hasMood) {
                    this.selectMood(session.activeMoodId);
                }
            }

            return true;
        } catch (err) {
            console.error('Error restoring session state:', err);
            return false;
        }
    }

    // ==================== RENDER METHODS ====================

    /**
     * Render all UI components
     */
    _renderAll() {
        // Capture current play states before re-rendering
        const playStates = new Map();
        this.audioEngine.layers.forEach((layer, id) => {
            playStates.set(id, layer.isPlaying);
        });

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

        // Restore play states in UI after rendering
        playStates.forEach((isPlaying, id) => {
            if (isPlaying) {
                this.ui.updateLayerPlayState(id, true);
            }
        });

        // Update status
        this.ui.updateStatus(this.currentSoundscape?.name, this.currentMood?.name);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new KrakenScapeApp();
    window.app.init();
});
