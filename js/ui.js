/**
 * KrakenScape UI Controller
 * Handles all UI interactions and updates
 */

class UIController {
    constructor() {
        this.elements = {};
        this.currentEditingLayerId = null;
        this.currentEditingOneShotId = null;
        this.wowImportCandidates = [];
        this.onWowImportRequested = null;

        // FontAwesome icons for picker
        this.availableIcons = [
            'fa-volume-up', 'fa-volume-down', 'fa-music', 'fa-bolt',
            'fa-bell', 'fa-broadcast-tower', 'fa-exclamation-triangle', 'fa-radiation',
            'fa-skull', 'fa-rocket', 'fa-satellite', 'fa-meteor',
            'fa-user-astronaut', 'fa-robot', 'fa-microchip', 'fa-atom',
            'fa-biohazard', 'fa-bug', 'fa-bomb', 'fa-fire',
            'fa-water', 'fa-wind', 'fa-cloud-rain', 'fa-snowflake'
        ];
    }

    _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    _safeIcon(icon, fallback = 'fa-volume-up') {
        const value = String(icon || '');
        return /^fa-[a-z0-9-]+$/.test(value) ? value : fallback;
    }

    /**
     * Initialize UI elements and event listeners
     */
    init() {
        this._cacheElements();
        this._bindEvents();
    }

    /**
     * Cache DOM elements for performance
     */
    _cacheElements() {
        this.elements = {
            // Header controls
            masterPlay: document.getElementById('masterPlay'),
            masterStop: document.getElementById('masterStop'),
            masterVolume: document.getElementById('masterVolume'),

            // Sidebars
            soundscapeList: document.getElementById('soundscapeList'),
            moodList: document.getElementById('moodList'),
            searchSoundscapes: document.getElementById('searchSoundscapes'),

            // Main panels
            soundLayers: document.getElementById('soundLayers'),
            oneShotGrid: document.getElementById('oneShotGrid'),

            // Buttons
            newSoundscape: document.getElementById('newSoundscape'),
            importWowAmbient: document.getElementById('importWowAmbient'),
            wowImportFolder: document.getElementById('wowImportFolder'),
            importSoundscape: document.getElementById('importSoundscape'),
            exportSoundscape: document.getElementById('exportSoundscape'),
            importFile: document.getElementById('importFile'),
            newMood: document.getElementById('newMood'),
            addLayer: document.getElementById('addLayer'),
            addOneShot: document.getElementById('addOneShot'),

            // Status bar
            activeSoundscape: document.getElementById('activeSoundscape'),
            activeMood: document.getElementById('activeMood'),
            layerCount: document.getElementById('layerCount'),

            // Layer modal
            layerModal: document.getElementById('layerModal'),
            layerName: document.getElementById('layerName'),
            layerFile: document.getElementById('layerFile'),
            browseFile: document.getElementById('browseFile'),
            fileName: document.getElementById('fileName'),
            crossfadeDuration: document.getElementById('crossfadeDuration'),
            minDelay: document.getElementById('minDelay'),
            maxDelay: document.getElementById('maxDelay'),
            minVolume: document.getElementById('minVolume'),
            maxVolume: document.getElementById('maxVolume'),
            fadeIn: document.getElementById('fadeIn'),
            fadeOut: document.getElementById('fadeOut'),
            layerVolume: document.getElementById('layerVolume'),
            layerVolumeValue: document.getElementById('layerVolumeValue'),
            loopOptions: document.getElementById('loopOptions'),
            intermittentOptions: document.getElementById('intermittentOptions'),
            playlistOptions: document.getElementById('playlistOptions'),
            playlistFilesGroup: document.getElementById('playlistFilesGroup'),
            singleFileGroup: document.getElementById('singleFileGroup'),
            layerBehaviorGroup: document.getElementById('layerBehaviorGroup'),
            playlistFiles: document.getElementById('playlistFiles'),
            browsePlaylistFiles: document.getElementById('browsePlaylistFiles'),
            browseMultipleFiles: document.getElementById('browseMultipleFiles'),
            playlistFileList: document.getElementById('playlistFileList'),
            playlistCrossfade: document.getElementById('playlistCrossfade'),
            playlistShuffle: document.getElementById('playlistShuffle'),
            playlistRepeat: document.getElementById('playlistRepeat'),
            layerEnabled: document.getElementById('layerEnabled'),
            layerAutoPlay: document.getElementById('layerAutoPlay'),
            loopRandomStart: document.getElementById('loopRandomStart'),
            randomizeDelay: document.getElementById('randomizeDelay'),
            randomizeVolume: document.getElementById('randomizeVolume'),
            cancelLayer: document.getElementById('cancelLayer'),
            saveLayer: document.getElementById('saveLayer'),

            // Soundscape modal
            soundscapeModal: document.getElementById('soundscapeModal'),
            soundscapeName: document.getElementById('soundscapeName'),
            createSoundscape: document.getElementById('createSoundscape'),

            // Mood modal
            moodModal: document.getElementById('moodModal'),
            moodName: document.getElementById('moodName'),
            createMood: document.getElementById('createMood'),

            // WoW import modal
            wowImportModal: document.getElementById('wowImportModal'),
            wowImportList: document.getElementById('wowImportList'),
            confirmWowImport: document.getElementById('confirmWowImport'),
            importAllWow: document.getElementById('importAllWow'),

            // Icon picker
            iconPickerGroup: document.getElementById('iconPickerGroup'),
            iconPicker: document.getElementById('iconPicker')
        };

        // Populate icon picker
        this._populateIconPicker();
    }

    _populateIconPicker() {
        this.elements.iconPicker.innerHTML = '';
        this.availableIcons.forEach(icon => {
            const btn = document.createElement('div');
            btn.className = 'icon-option';
            btn.innerHTML = `<i class="fas ${icon}"></i>`;
            btn.dataset.icon = icon;
            btn.addEventListener('click', () => {
                this.elements.iconPicker.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedIcon = icon;
            });
            this.elements.iconPicker.appendChild(btn);
        });
    }

    /**
     * Bind event listeners
     */
    _bindEvents() {
        // Master controls
        this.elements.masterVolume.addEventListener('input', (e) => {
            if (this.onMasterVolumeChange) {
                this.onMasterVolumeChange(e.target.value / 100);
            }
        });

        // Search
        this.elements.searchSoundscapes.addEventListener('input', (e) => {
            if (this.onSearch) {
                this.onSearch(e.target.value);
            }
        });

        // New buttons
        this.elements.newSoundscape.addEventListener('click', () => this.showSoundscapeModal());
        this.elements.importWowAmbient.addEventListener('click', () => {
            this.elements.wowImportFolder.click();
        });

        // Import/Export
        this.elements.exportSoundscape.addEventListener('click', () => {
            if (this.onExportSoundscape) {
                // Get active soundscape ID from the active list item
                const activeId = document.querySelector('#soundscapeList li.active')?.dataset.id;
                if (activeId) {
                    this.onExportSoundscape(activeId);
                } else {
                    alert('Please select a soundscape to export.');
                }
            }
        });

        this.elements.importSoundscape.addEventListener('click', () => {
            this.elements.importFile.click();
        });

        this.elements.importFile.addEventListener('change', (e) => {
            if (e.target.files.length > 0 && this.onImportFile) {
                this.onImportFile(e.target.files[0]);
                e.target.value = ''; // Reset
            }
        });

        this.elements.wowImportFolder.addEventListener('change', (e) => {
            if (e.target.files.length > 0 && this.onImportWowFolder) {
                this.onImportWowFolder(Array.from(e.target.files));
                e.target.value = '';
            }
        });
        this.elements.newMood.addEventListener('click', () => this.showMoodModal());
        this.elements.addLayer.addEventListener('click', () => this.showLayerModal());
        this.elements.addOneShot.addEventListener('click', () => this.showLayerModal(true));

        // File browse button
        this.elements.browseFile.addEventListener('click', () => {
            this.elements.layerFile.click();
        });

        // File selection
        this.elements.layerFile.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.elements.fileName.textContent = e.target.files[0].name;
            }
        });

        // Playlist file selection
        this.elements.browsePlaylistFiles.addEventListener('click', () => {
            this.elements.playlistFiles.setAttribute('webkitdirectory', '');
            this.elements.playlistFiles.multiple = true;
            this.elements.playlistFiles.click();
        });

        this.elements.browseMultipleFiles.addEventListener('click', () => {
            this.elements.playlistFiles.removeAttribute('webkitdirectory');
            this.elements.playlistFiles.multiple = true;
            this.elements.playlistFiles.click();
        });

        this.elements.playlistFiles.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            this.selectedPlaylistFiles = files;
            this._renderPlaylistFileList(files);
            e.target.value = '';
        });

        // Sound type radio buttons
        document.querySelectorAll('input[name="soundType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this._toggleSoundTypeOptions(e.target.value);
            });
        });

        // Layer volume slider
        this.elements.layerVolume.addEventListener('input', (e) => {
            this.elements.layerVolumeValue.textContent = e.target.value + '%';
        });

        this.elements.randomizeDelay.addEventListener('change', () => {
            this._toggleRandomDelayFields();
        });

        this.elements.randomizeVolume.addEventListener('change', () => {
            this._toggleRandomVolumeFields();
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        // Modal backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });

        // Save/Create buttons
        this.elements.saveLayer.addEventListener('click', () => this._handleSaveLayer());
        this.elements.createSoundscape.addEventListener('click', () => this._handleCreateSoundscape());
        this.elements.createMood.addEventListener('click', () => this._handleCreateMood());
        this.elements.cancelLayer.addEventListener('click', () => this.closeAllModals());
        this.elements.confirmWowImport.addEventListener('click', async () => {
            const selected = this._selectedWowImportCandidates(false);
            if (selected.length === 0) {
                alert('Please choose a WoW zone bundle to import.');
                return;
            }
            if (this.onWowImportRequested) {
                await this.onWowImportRequested(selected);
            }
            this.closeAllModals();
        });
        this.elements.importAllWow.addEventListener('click', async () => {
            const selected = this._selectedWowImportCandidates(true);
            if (selected.length === 0) {
                alert('No WoW zone bundles are available to import.');
                return;
            }
            if (this.onWowImportRequested) {
                await this.onWowImportRequested(selected);
            }
            this.closeAllModals();
        });

        // Submit modals with Enter in name fields
        this.elements.layerName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._handleSaveLayer();
            }
        });
        this.elements.soundscapeName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._handleCreateSoundscape();
            }
        });
        this.elements.moodName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._handleCreateMood();
            }
        });

        // Keyboard shortcuts
        this._setupKeyboardShortcuts();

        // Drag and drop for sound layers panel
        this._setupDragAndDrop();
    }

    /**
     * Setup drag and drop for importing sounds
     */
    _setupDragAndDrop() {
        const soundLayersPanel = this.elements.soundLayers;
        const oneShotGrid = this.elements.oneShotGrid;

        // Prevent default drag behaviors on the whole document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Sound layers drop zone
        this._makeDropZone(soundLayersPanel, (files) => {
            if (this.onFilesDropped) {
                this.onFilesDropped(files, 'layer');
            }
        });

        // One-shot grid drop zone
        this._makeDropZone(oneShotGrid, (files) => {
            if (this.onFilesDropped) {
                this.onFilesDropped(files, 'oneshot');
            }
        });
    }

    /**
     * Make an element a drop zone
     */
    _makeDropZone(element, onDrop) {
        let dragCounter = 0;
        const isLayerReorder = (e) =>
            Array.from(e.dataTransfer?.types || []).includes('application/x-krakenscape-layer');

        element.addEventListener('dragenter', (e) => {
            if (isLayerReorder(e)) return;
            dragCounter++;
            element.classList.add('drag-over');
        });

        element.addEventListener('dragleave', (e) => {
            if (isLayerReorder(e)) return;
            dragCounter--;
            if (dragCounter === 0) {
                element.classList.remove('drag-over');
            }
        });

        element.addEventListener('dragover', (e) => {
            if (isLayerReorder(e)) return;
            e.dataTransfer.dropEffect = 'copy';
        });

        element.addEventListener('drop', (e) => {
            if (isLayerReorder(e)) return;
            dragCounter = 0;
            element.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files).filter(file =>
                file.type.startsWith('audio/') ||
                file.name.match(/\.(mp3|wav|ogg|flac|m4a|aac|webm)$/i)
            );

            if (files.length > 0) {
                onDrop(files);
            }
        });
    }

    /**
     * Toggle between loop and intermittent options
     */
    _toggleSoundTypeOptions(type) {
        if (type === 'loop') {
            this.elements.loopOptions.style.display = 'block';
            this.elements.intermittentOptions.style.display = 'none';
            this.elements.playlistOptions.style.display = 'none';
            this.elements.singleFileGroup.style.display = 'block';
            this.elements.playlistFilesGroup.style.display = 'none';
        } else {
            this.elements.loopOptions.style.display = 'none';
            this.elements.intermittentOptions.style.display = type === 'intermittent' ? 'block' : 'none';
            this.elements.playlistOptions.style.display = type === 'playlist' ? 'block' : 'none';
            this.elements.singleFileGroup.style.display = type === 'playlist' ? 'none' : 'block';
            this.elements.playlistFilesGroup.style.display = type === 'playlist' ? 'block' : 'none';
        }

        if (type === 'playlist') {
            this._renderPlaylistFileList(this.selectedPlaylistFiles || []);
        }
    }

    _toggleRandomDelayFields() {
        const isRandom = this.elements.randomizeDelay.checked;
        this.elements.maxDelay.disabled = !isRandom;
    }

    _toggleRandomVolumeFields() {
        const isRandom = this.elements.randomizeVolume.checked;
        this.elements.maxVolume.disabled = !isRandom;
    }

    _renderPlaylistFileList(filesOrNames) {
        if (!filesOrNames || filesOrNames.length === 0) {
            this.elements.playlistFileList.innerHTML = '<span class="placeholder">No files selected</span>';
            return;
        }

        const names = filesOrNames.map(item => (typeof item === 'string' ? item : item.name));
        const items = names.map(name => `
            <div class="file-item">
                <i class="fas fa-music"></i>
                <span>${this._escapeHtml(name)}</span>
            </div>
        `).join('');

        this.elements.playlistFileList.innerHTML = `
            <div class="track-count">${names.length} track${names.length !== 1 ? 's' : ''}</div>
            ${items}
        `;
    }

    /**
     * Show the layer configuration modal
     */
    showLayerModal(isOneShot = false, existingConfig = null) {
        this.currentEditingLayerId = existingConfig?.id || null;
        this.currentEditingConfig = existingConfig || null;
        this.isEditingOneShot = isOneShot;
        this.selectedPlaylistFiles = [];
        const importedLayerLabel = existingConfig?.layerTrackCount
            ? `${existingConfig.layerTrackCount} imported files`
            : (existingConfig?.fileName || 'No file selected');

        // Reset form
        this.elements.layerName.value = existingConfig?.name || '';
        this.elements.fileName.textContent = importedLayerLabel;
        this.elements.layerFile.value = '';
        this.elements.layerVolume.value = (existingConfig?.volume || 0.7) * 100;
        this.elements.layerVolumeValue.textContent = this.elements.layerVolume.value + '%';
        this.elements.layerEnabled.checked = existingConfig?.enabled !== false;
        this.elements.layerAutoPlay.checked = existingConfig?.autoPlay === true;
        this.elements.loopRandomStart.checked = existingConfig?.randomStart === true;
        this.elements.randomizeDelay.checked = existingConfig?.randomizeDelay !== false;
        this.elements.randomizeVolume.checked = existingConfig?.randomizeVolume !== false;
        this._toggleRandomDelayFields();
        this._toggleRandomVolumeFields();

        if (!isOneShot) {
            // Set sound type
            const soundType = existingConfig?.type || 'loop';
            document.querySelector(`input[name="soundType"][value="${soundType}"]`).checked = true;
            this._toggleSoundTypeOptions(soundType);

            // Set values
            this.elements.crossfadeDuration.value = existingConfig?.crossfadeDuration || 2;
            this.elements.minDelay.value = existingConfig?.minDelay || 10;
            this.elements.maxDelay.value = existingConfig?.maxDelay || 60;
            this.elements.minVolume.value = (existingConfig?.minVolume || 0.8) * 100;
            this.elements.maxVolume.value = (existingConfig?.maxVolume || 1) * 100;
            this.elements.fadeIn.value = existingConfig?.fadeIn || 0.5;
            this.elements.fadeOut.value = existingConfig?.fadeOut || 1;
            this.elements.playlistCrossfade.value = existingConfig?.playlistCrossfade || 3;
            this.elements.playlistShuffle.checked = existingConfig?.playlistShuffle !== false;
            this.elements.playlistRepeat.checked = existingConfig?.playlistRepeat !== false;

            // Show type options
            document.querySelector('.radio-group-vertical').parentElement.style.display = 'block';
            this._toggleSoundTypeOptions(soundType);
            this.elements.iconPickerGroup.style.display = 'none';
            this.elements.layerBehaviorGroup.style.display = 'block';
            if (soundType === 'playlist') {
                const names = existingConfig?.playlistTrackNames || [];
                this._renderPlaylistFileList(names);
            } else {
                this._renderPlaylistFileList([]);
            }
        } else {
            // Hide type options for one-shots
            document.querySelector('.radio-group-vertical').parentElement.style.display = 'none';
            this.elements.loopOptions.style.display = 'none';
            this.elements.intermittentOptions.style.display = 'none';
            this.elements.playlistOptions.style.display = 'none';
            this.elements.playlistFilesGroup.style.display = 'none';
            this.elements.singleFileGroup.style.display = 'block';
            this.elements.layerBehaviorGroup.style.display = 'none';

            // Show icon picker
            this.elements.iconPickerGroup.style.display = 'block';

            // Select current icon
            const currentIcon = existingConfig?.icon || 'fa-volume-up';
            this.selectedIcon = currentIcon;
            this.elements.iconPicker.querySelectorAll('.icon-option').forEach(el => {
                if (el.dataset.icon === currentIcon) {
                    el.classList.add('selected');
                } else {
                    el.classList.remove('selected');
                }
            });
        }

        // Update modal title
        const title = isOneShot ? 'Configure One-Shot' : 'Configure Sound Layer';
        this.elements.layerModal.querySelector('h3').textContent = title;

        this.elements.layerModal.classList.add('active');
    }

    /**
     * Show soundscape creation modal
     */
    showSoundscapeModal() {
        this.elements.soundscapeName.value = '';
        this.elements.soundscapeModal.classList.add('active');
        this.elements.soundscapeName.focus();
    }

    /**
     * Show mood creation modal
     */
    showMoodModal() {
        this.elements.moodName.value = '';
        this.elements.moodModal.classList.add('active');
        this.elements.moodName.focus();
    }

    /**
     * Close all modals
     */
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        this.currentEditingLayerId = null;
        this.onWowImportRequested = null;
    }

    /**
     * Show the WoW ambient import modal
     */
    showWowImportModal(candidates, onImportRequested) {
        this.wowImportCandidates = candidates || [];
        this.onWowImportRequested = onImportRequested || null;

        if (!this.elements.wowImportList) {
            return;
        }

        if (this.wowImportCandidates.length === 0) {
            this.elements.wowImportList.innerHTML = `
                <div class="wow-import-empty">
                    <i class="fas fa-folder-open"></i>
                    <p>No compatible WoW zone bundles were detected.</p>
                </div>
            `;
        } else {
            this.elements.wowImportList.innerHTML = this.wowImportCandidates.map((candidate, index) => `
                <label class="wow-import-card">
                    <input
                        type="radio"
                        name="wowImportSelection"
                        value="${this._escapeHtml(candidate.id)}"
                        ${index === 0 ? 'checked' : ''}
                    >
                    <div class="wow-import-card-body">
                        <div class="wow-import-card-title">${this._escapeHtml(candidate.zoneName)}</div>
                        <div class="wow-import-card-subtitle">${this._escapeHtml(candidate.familyName || 'Standalone Zone')}</div>
                        <div class="wow-import-card-meta">
                            <span>${candidate.groupCount} group${candidate.groupCount !== 1 ? 's' : ''}</span>
                            <span>${candidate.clipCount} clip${candidate.clipCount !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                </label>
            `).join('');
        }

        this.elements.wowImportModal.classList.add('active');
    }

    /**
     * Get the selected WoW import candidates
     */
    _selectedWowImportCandidates(includeAll = false) {
        if (includeAll) {
            return this.wowImportCandidates.slice();
        }

        const selectedId = this.elements.wowImportList
            .querySelector('input[name="wowImportSelection"]:checked')
            ?.value;

        if (!selectedId) {
            return [];
        }

        return this.wowImportCandidates.filter(candidate => candidate.id === selectedId);
    }

    /**
     * Handle save layer button
     */
    _handleSaveLayer() {
        const name = this.elements.layerName.value.trim();
        const file = this.elements.layerFile.files[0];
        const soundType = document.querySelector('input[name="soundType"]:checked').value;

        if (!name) {
            alert('Please enter a name for the sound layer.');
            return;
        }

        // Validate file requirement based on sound type
        const isPlaylist = !this.isEditingOneShot && soundType === 'playlist';
        const hasPlaylistTracks = isPlaylist && (
            (this.selectedPlaylistFiles && this.selectedPlaylistFiles.length > 0) ||
            (this.currentEditingConfig?.playlistTrackNames?.length > 0)
        );
        const hasFile = file || this.currentEditingLayerId;

        if (isPlaylist && !hasPlaylistTracks && !this.currentEditingLayerId) {
            alert('Please select music files or a folder for the playlist.');
            return;
        }

        if (!isPlaylist && !hasFile) {
            alert('Please select a sound file.');
            return;
        }

        const config = {
            id: this.currentEditingLayerId || 'layer_' + Date.now(),
            name: name,
            type: this.isEditingOneShot ? 'oneshot' : soundType,
            icon: this.isEditingOneShot ? (this.selectedIcon || 'fa-volume-up') : null,
            volume: this.elements.layerVolume.value / 100,
            file: file,
            fileName: file?.name || this.elements.fileName.textContent,
            enabled: this.elements.layerEnabled.checked,
            autoPlay: this.elements.layerAutoPlay.checked,
            randomStart: this.elements.loopRandomStart.checked,
            randomizeDelay: this.elements.randomizeDelay.checked,
            randomizeVolume: this.elements.randomizeVolume.checked,
            // Loop settings
            crossfadeDuration: parseFloat(this.elements.crossfadeDuration.value),
            // Intermittent settings
            minDelay: parseInt(this.elements.minDelay.value),
            maxDelay: parseInt(this.elements.maxDelay.value),
            minVolume: this.elements.minVolume.value / 100,
            maxVolume: this.elements.maxVolume.value / 100,
            fadeIn: parseFloat(this.elements.fadeIn.value),
            fadeOut: parseFloat(this.elements.fadeOut.value),
            // Playlist settings
            playlistFiles: isPlaylist ? (this.selectedPlaylistFiles || []) : [],
            playlistTrackNames: this.currentEditingConfig?.playlistTrackNames || [],
            layerFiles: this.currentEditingConfig?.layerFiles || [],
            layerTrackNames: this.currentEditingConfig?.layerTrackNames || [],
            layerTrackCount: this.currentEditingConfig?.layerTrackCount || 0,
            playlistCrossfade: parseFloat(this.elements.playlistCrossfade.value),
            playlistShuffle: this.elements.playlistShuffle.checked,
            playlistRepeat: this.elements.playlistRepeat.checked,
            importSource: this.currentEditingConfig?.importSource || null,
            // Keep imported in-game variation (pitch, pan, delays) when a layer is edited.
            realism: this.currentEditingConfig?.realism || null
        };

        if (this.isEditingOneShot) {
            if (this.onOneShotSave) {
                this.onOneShotSave(config);
            }
        } else {
            if (this.onLayerSave) {
                this.onLayerSave(config);
            }
        }

        this.closeAllModals();
    }

    /**
     * Handle create soundscape button
     */
    _handleCreateSoundscape() {
        const name = this.elements.soundscapeName.value.trim();
        if (!name) {
            alert('Please enter a name for the soundscape.');
            return;
        }

        if (this.onSoundscapeCreate) {
            this.onSoundscapeCreate(name);
        }

        this.closeAllModals();
    }

    /**
     * Handle create mood button
     */
    _handleCreateMood() {
        const name = this.elements.moodName.value.trim();
        if (!name) {
            alert('Please enter a name for the mood.');
            return;
        }

        if (this.onMoodCreate) {
            this.onMoodCreate(name);
        }

        this.closeAllModals();
    }

    /**
     * Render soundscape list
     */
    renderSoundscapeList(soundscapes, activeId) {
        this.elements.soundscapeList.innerHTML = '';

        if (soundscapes.length === 0) {
            this.elements.soundscapeList.innerHTML = `
                <li class="empty-state" style="padding: 20px;">
                    <p>No soundscapes yet.<br>Click + or import a WoW folder.</p>
                </li>
            `;
            return;
        }

        soundscapes.forEach(soundscape => {
            const li = document.createElement('li');
            li.className = soundscape.id === activeId ? 'active' : '';
            li.dataset.id = soundscape.id;
            li.innerHTML = `
                <span class="item-icon"><i class="fas fa-music"></i></span>
                <span>${this._escapeHtml(soundscape.name)}</span>
            `;
            li.addEventListener('click', () => {
                if (this.onSoundscapeSelect) {
                    this.onSoundscapeSelect(soundscape.id);
                }
            });

            // Right-click context menu
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e.pageX, e.pageY, [
                    { label: 'Rename', icon: 'fa-edit', action: () => this.renameSoundscape(soundscape) },
                    { label: 'Duplicate', icon: 'fa-copy', action: () => this.duplicateSoundscape(soundscape) },
                    { divider: true },
                    { label: 'Delete', icon: 'fa-trash', danger: true, action: () => this.deleteSoundscape(soundscape) }
                ]);
            });

            this.elements.soundscapeList.appendChild(li);
        });
    }

    /**
     * Render mood list
     */
    renderMoodList(moods, activeId) {
        this.elements.moodList.innerHTML = '';

        if (moods.length === 0) {
            this.elements.moodList.innerHTML = `
                <li class="empty-state" style="padding: 20px;">
                    <p>No moods yet</p>
                </li>
            `;
            return;
        }

        moods.forEach(mood => {
            const li = document.createElement('li');
            li.className = mood.id === activeId ? 'active' : '';
            li.dataset.id = mood.id;
            li.innerHTML = `
                <span class="item-icon"><i class="fas fa-theater-masks"></i></span>
                <span>${this._escapeHtml(mood.name)}</span>
            `;
            li.addEventListener('click', () => {
                if (this.onMoodSelect) {
                    this.onMoodSelect(mood.id);
                }
            });

            // Right-click context menu
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e.pageX, e.pageY, [
                    { label: 'Rename', icon: 'fa-edit', action: () => this.renameMood(mood) },
                    { label: 'Update from Current', icon: 'fa-save', action: () => this.updateMoodFromCurrent(mood) },
                    { divider: true },
                    { label: 'Delete', icon: 'fa-trash', danger: true, action: () => this.deleteMood(mood) }
                ]);
            });

            this.elements.moodList.appendChild(li);
        });
    }

    /**
     * Render sound layers
     */
    renderSoundLayers(layers) {
        this.elements.soundLayers.innerHTML = '';
        this.updateLayerCount(layers.length);

        if (layers.length === 0) {
            this.elements.soundLayers.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <p>No sound layers yet.<br>Click +, drag audio files here, or import a WoW bundle.</p>
                </div>
            `;
            return;
        }

        layers.forEach((layer, index) => {
            const div = document.createElement('div');
            div.className = 'sound-layer';
            div.dataset.id = layer.id;
            div.dataset.index = index;
            div.draggable = false;

            const type = layer.type || 'loop';
            const typeLabel = type === 'loop'
                ? 'Loop'
                : type === 'intermittent'
                    ? 'Intermittent'
                    : 'Playlist';
            const typeClass = type;

            div.innerHTML = `
                <div class="layer-drag-handle" title="Drag to reorder">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="layer-play-btn">
                    <svg class="progress-ring" viewBox="0 0 50 50">
                        <circle cx="25" cy="25" r="22" />
                    </svg>
                    <button title="Play/Pause">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
                <div class="layer-info">
                    <div class="layer-name">${this._escapeHtml(layer.name)}</div>
                    <div class="layer-type ${typeClass}">${typeLabel}</div>
                    <div class="layer-source">${this._escapeHtml(this._describeLayerSource(layer))}</div>
                    <div class="layer-track"></div>
                </div>
                <div class="layer-visualizer" title="Live frequency spectrum">
                    <canvas aria-hidden="true"></canvas>
                </div>
                <div class="layer-volume">
                    <input type="range" min="0" max="100" value="${Math.round(layer.volume * 100)}" title="Volume">
                    <span class="volume-value">${Math.round(layer.volume * 100)}%</span>
                </div>
                <div class="layer-actions">
                    ${type === 'playlist' ? '<button class="skip" title="Skip Track"><i class="fas fa-forward"></i></button>' : ''}
                    <button class="edit" title="Edit"><i class="fas fa-cog"></i></button>
                    <button class="delete" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            `;

            // Drag and drop reordering
            const dragHandle = div.querySelector('.layer-drag-handle');
            if (dragHandle) {
                dragHandle.draggable = true;
            }
            this._setupLayerDragReorder(div, dragHandle);

            // Play button
            const playBtn = div.querySelector('.layer-play-btn button');
            playBtn.addEventListener('click', () => {
                if (this.onLayerToggle) {
                    this.onLayerToggle(layer.id);
                }
            });

            // Volume slider
            const volumeSlider = div.querySelector('input[type="range"]');
            const volumeValue = div.querySelector('.volume-value');
            volumeSlider.addEventListener('input', (e) => {
                volumeValue.textContent = e.target.value + '%';
                if (this.onLayerVolumeChange) {
                    this.onLayerVolumeChange(layer.id, e.target.value / 100);
                }
            });

            // Double-click to reset volume to 70%
            volumeSlider.addEventListener('dblclick', () => {
                volumeSlider.value = 70;
                volumeValue.textContent = '70%';
                if (this.onLayerVolumeChange) {
                    this.onLayerVolumeChange(layer.id, 0.7);
                }
            });

            volumeSlider.title = 'Volume (double-click to reset to 70%)';

            // Edit button
            div.querySelector('.edit').addEventListener('click', () => {
                if (this.onLayerEdit) {
                    this.onLayerEdit(layer.id);
                }
            });

            // Skip button (playlist)
            const skipBtn = div.querySelector('.skip');
            if (skipBtn) {
                skipBtn.addEventListener('click', () => {
                    if (this.onLayerSkip) {
                        this.onLayerSkip(layer.id);
                    }
                });
            }

            // Delete button
            div.querySelector('.delete').addEventListener('click', () => {
                if (confirm(`Delete "${layer.name}"?`)) {
                    if (this.onLayerDelete) {
                        this.onLayerDelete(layer.id);
                    }
                }
            });

            this.elements.soundLayers.appendChild(div);
        });

    }

    _describeLayerSource(layer) {
        if (layer.importSource?.groupName) {
            const clipCount = layer.importSource.clipCount || layer.layerTrackCount || layer.playlistTrackCount || 0;
            const sourceLabel = layer.importSource.sourceLabel || layer.importSource.category || 'Imported';
            return `${sourceLabel} • ${clipCount} clip${clipCount !== 1 ? 's' : ''}`;
        }

        if (layer.type === 'playlist' && layer.playlistTrackCount) {
            return `${layer.playlistTrackCount} track${layer.playlistTrackCount !== 1 ? 's' : ''}`;
        }

        if (layer.layerTrackCount) {
            return `${layer.layerTrackCount} alternate clip${layer.layerTrackCount !== 1 ? 's' : ''}`;
        }

        return '';
    }

    /**
     * Update a single layer's play state
     */
    updateLayerPlayState(layerId, isPlaying) {
        const layerEl = this.elements.soundLayers.querySelector(`[data-id="${layerId}"]`);
        if (!layerEl) return;

        const playBtn = layerEl.querySelector('.layer-play-btn button i');

        if (isPlaying) {
            layerEl.classList.add('playing');
            playBtn.className = 'fas fa-pause';
        } else {
            layerEl.classList.remove('playing');
            playBtn.className = 'fas fa-play';
        }
    }

    /**
     * Update a layer's progress ring
     */
    updateLayerProgress(layerId, progress) {
        const layerEl = this.elements.soundLayers.querySelector(`[data-id="${layerId}"]`);
        if (!layerEl) return;

        const circle = layerEl.querySelector('.progress-ring circle');
        if (circle) {
            // Circumference = 2 * PI * r = 2 * PI * 22 ≈ 138.2
            const circumference = 138.2;
            const offset = circumference - (progress * circumference);
            circle.style.strokeDashoffset = offset;
        }
    }

    /**
     * Update playlist track info for a layer
     */
    updateLayerTrackInfo(layerId, trackName) {
        const layerEl = this.elements.soundLayers.querySelector(`[data-id="${layerId}"]`);
        if (!layerEl) return;

        const trackEl = layerEl.querySelector('.layer-track');
        if (trackEl) {
            trackEl.textContent = trackName ? `Now: ${trackName}` : '';
        }
    }

    /**
     * Update layer volume slider
     */
    updateLayerVolume(layerId, volume) {
        const layerEl = this.elements.soundLayers.querySelector(`[data-id="${layerId}"]`);
        if (!layerEl) return;

        const slider = layerEl.querySelector('input[type="range"]');
        const valueEl = layerEl.querySelector('.volume-value');

        if (slider) slider.value = Math.round(volume * 100);
        if (valueEl) valueEl.textContent = Math.round(volume * 100) + '%';
    }

    /**
     * Draw live frequency spectra for all visible sound layers.
     */
    updateLayerVisualizers(audioEngine) {
        if (!audioEngine) return;

        this.elements.soundLayers.querySelectorAll('.sound-layer').forEach(layerEl => {
            const canvas = layerEl.querySelector('.layer-visualizer canvas');
            if (!canvas) return;

            const layer = audioEngine.getLayer(layerEl.dataset.id);
            const spectrum = layer?.getFrequencyData?.();
            const width = Math.max(1, Math.round(canvas.clientWidth));
            const height = Math.max(1, Math.round(canvas.clientHeight));
            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            if (canvas.width !== Math.round(width * dpr) ||
                canvas.height !== Math.round(height * dpr)) {
                canvas.width = Math.round(width * dpr);
                canvas.height = Math.round(height * dpr);
            }

            const context = canvas.getContext('2d');
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            context.clearRect(0, 0, width, height);

            const barCount = 24;
            const gap = 2;
            const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
            const playing = Boolean(layer?.isPlaying);
            const gradient = context.createLinearGradient(0, height, 0, 0);
            gradient.addColorStop(0, 'rgba(0, 212, 255, 0.28)');
            gradient.addColorStop(0.55, '#00d4ff');
            gradient.addColorStop(1, '#52f7d4');
            context.fillStyle = gradient;

            for (let index = 0; index < barCount; index++) {
                const spectrumIndex = spectrum
                    ? Math.min(spectrum.length - 1, Math.floor(index * spectrum.length / barCount))
                    : 0;
                const amplitude = spectrum ? spectrum[spectrumIndex] / 255 : 0;
                const target = playing ? Math.max(0.04, amplitude) : 0.025;
                const barHeight = Math.max(1, target * height);
                const x = index * (barWidth + gap);
                context.globalAlpha = playing ? 0.9 : 0.24;
                context.fillRect(x, height - barHeight, barWidth, barHeight);
            }
            context.globalAlpha = 1;
        });
    }

    /**
     * Update mute state visual
     */
    updateMuteState(isMuted) {
        const volumeControl = document.querySelector('.volume-control');
        if (volumeControl) {
            volumeControl.classList.toggle('muted', isMuted);
        }
        // Update the master volume icon if present
        const volumeIcon = document.querySelector('.volume-control i');
        if (volumeIcon) {
            volumeIcon.className = isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        }
    }

    /**
     * Render one-shot buttons
     */
    renderOneShots(oneShots) {
        this.elements.oneShotGrid.innerHTML = '';

        if (oneShots.length === 0) {
            this.elements.oneShotGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <i class="fas fa-bolt"></i>
                    <p>No one-shots yet.<br>Drag audio files here.</p>
                </div>
            `;
            return;
        }

        oneShots.forEach((oneShot, index) => {
            const card = document.createElement('div');
            card.className = 'oneshot-card';
            card.dataset.id = oneShot.id;

            // Show keyboard shortcut hint for first 9 one-shots
            const keyHint = index < 9 ? `data-key="${index + 1}"` : '';

            card.innerHTML = `
                <button class="oneshot-btn" ${keyHint}>
                    <i class="fas ${this._safeIcon(oneShot.icon)}"></i>
                    <span>${this._escapeHtml(oneShot.name)}</span>
                </button>
                <div class="oneshot-volume">
                    <input type="range" min="0" max="100" value="${Math.round((oneShot.volume ?? 1) * 100)}" title="Volume">
                    <span class="volume-value">${Math.round((oneShot.volume ?? 1) * 100)}%</span>
                </div>
            `;

            const btn = card.querySelector('.oneshot-btn');
            btn.addEventListener('click', () => {
                if (this.onOneShotPlay) {
                    this.onOneShotPlay(oneShot.id);
                }
            });

            // Volume slider
            const volumeSlider = card.querySelector('input[type="range"]');
            const volumeValue = card.querySelector('.volume-value');
            volumeSlider.addEventListener('input', (e) => {
                volumeValue.textContent = e.target.value + '%';
                if (this.onOneShotVolumeChange) {
                    this.onOneShotVolumeChange(oneShot.id, e.target.value / 100);
                }
            });

            // Double-click to reset volume to 100%
            volumeSlider.addEventListener('dblclick', () => {
                volumeSlider.value = 100;
                volumeValue.textContent = '100%';
                if (this.onOneShotVolumeChange) {
                    this.onOneShotVolumeChange(oneShot.id, 1);
                }
            });

            volumeSlider.title = 'Volume (double-click to reset to 100%)';

            // Right-click to edit/delete
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e.pageX, e.pageY, [
                    { label: 'Edit', icon: 'fa-edit', action: () => this.editOneShot(oneShot) },
                    { divider: true },
                    { label: 'Delete', icon: 'fa-trash', danger: true, action: () => this.deleteOneShot(oneShot) }
                ]);
            });

            this.elements.oneShotGrid.appendChild(card);
        });
    }

    /**
     * Update one-shot playing state
     */
    updateOneShotPlayState(oneShotId, isPlaying) {
        const card = this.elements.oneShotGrid.querySelector(`[data-id="${oneShotId}"]`);
        if (card) {
            const btn = card.querySelector('.oneshot-btn');
            if (isPlaying) {
                card.classList.add('playing');
                if (btn) btn.classList.add('playing');
            } else {
                card.classList.remove('playing');
                if (btn) btn.classList.remove('playing');
            }
        }
    }

    /**
     * Update status bar
     */
    updateStatus(soundscapeName, moodName) {
        this.elements.activeSoundscape.textContent = soundscapeName || 'No soundscape loaded';
        this.elements.activeMood.textContent = moodName || '-';
    }

    /**
     * Update layer count in status bar
     */
    updateLayerCount(count) {
        this.elements.layerCount.textContent = `${count} layer${count !== 1 ? 's' : ''}`;
    }

    /**
     * Update master play button state
     */
    updateMasterPlayState(isPlaying) {
        if (isPlaying) {
            this.elements.masterPlay.classList.add('active');
        } else {
            this.elements.masterPlay.classList.remove('active');
        }
    }

    /**
     * Show context menu
     */
    showContextMenu(x, y, items) {
        // Remove any existing context menu
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu active';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        items.forEach(item => {
            if (item.divider) {
                const divider = document.createElement('div');
                divider.className = 'context-menu-divider';
                menu.appendChild(divider);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item' + (item.danger ? ' danger' : '');
                menuItem.innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
                menuItem.addEventListener('click', () => {
                    item.action();
                    this.hideContextMenu();
                });
                menu.appendChild(menuItem);
            }
        });

        document.body.appendChild(menu);

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', this._contextMenuCloseHandler = () => {
                this.hideContextMenu();
            }, { once: true });
        }, 0);
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        const existing = document.querySelector('.context-menu');
        if (existing) {
            existing.remove();
        }
    }

    // Placeholder methods for context menu actions
    renameSoundscape(soundscape) {
        const newName = prompt('Enter new name:', soundscape.name);
        if (newName && this.onSoundscapeRename) {
            this.onSoundscapeRename(soundscape.id, newName);
        }
    }

    duplicateSoundscape(soundscape) {
        if (this.onSoundscapeDuplicate) {
            this.onSoundscapeDuplicate(soundscape.id);
        }
    }

    deleteSoundscape(soundscape) {
        if (confirm(`Delete "${soundscape.name}"?`) && this.onSoundscapeDelete) {
            this.onSoundscapeDelete(soundscape.id);
        }
    }

    renameMood(mood) {
        const newName = prompt('Enter new name:', mood.name);
        if (newName && this.onMoodRename) {
            this.onMoodRename(mood.id, newName);
        }
    }

    updateMoodFromCurrent(mood) {
        if (this.onMoodUpdate) {
            this.onMoodUpdate(mood.id);
        }
    }

    deleteMood(mood) {
        if (confirm(`Delete "${mood.name}"?`) && this.onMoodDelete) {
            this.onMoodDelete(mood.id);
        }
    }

    editOneShot(oneShot) {
        if (this.onOneShotEdit) {
            this.onOneShotEdit(oneShot.id);
        }
    }

    deleteOneShot(oneShot) {
        if (confirm(`Delete "${oneShot.name}"?`) && this.onOneShotDelete) {
            this.onOneShotDelete(oneShot.id);
        }
    }

    /**
     * Setup keyboard shortcuts
     * Space: Toggle master play/stop
     * Escape: Close modals
     * 1-9: Trigger one-shots by position
     * M: Toggle mute
     */
    _setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                // Except Escape should still close modals
                if (e.key === 'Escape') {
                    this.closeAllModals();
                    e.target.blur();
                }
                return;
            }

            switch (e.key) {
                case ' ': // Space - toggle play/stop
                    e.preventDefault();
                    if (this.onMasterToggle) {
                        this.onMasterToggle();
                    }
                    break;

                case 'Escape':
                    this.closeAllModals();
                    break;

                case 'm':
                case 'M':
                    if (this.onMuteToggle) {
                        this.onMuteToggle();
                    }
                    break;

                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    // Trigger one-shot by position
                    const index = parseInt(e.key) - 1;
                    this._triggerOneShotByIndex(index);
                    break;

                case 'z':
                case 'Z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (this.onUndo) this.onUndo();
                    }
                    break;

                case 'y':
                case 'Y':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (this.onRedo) this.onRedo();
                    }
                    break;
            }
        });
    }

    /**
     * Trigger a one-shot by its index in the grid
     */
    _triggerOneShotByIndex(index) {
        const oneShots = this.elements.oneShotGrid.querySelectorAll('.oneshot-btn');
        if (index < oneShots.length) {
            const oneShotEl = oneShots[index];
            const id = oneShotEl.dataset.id;
            if (id && this.onOneShotPlay) {
                this.onOneShotPlay(id);
                // Visual feedback
                oneShotEl.classList.add('triggered');
                setTimeout(() => oneShotEl.classList.remove('triggered'), 200);
            }
        }
    }

    /**
     * Show storage warning banner
     */
    showStorageWarning(percent, used, quota) {
        const usedMB = (used / 1024 / 1024).toFixed(1);
        const quotaMB = (quota / 1024 / 1024).toFixed(1);

        const banner = document.createElement('div');
        banner.className = 'storage-warning';
        banner.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>Storage ${percent.toFixed(0)}% full (${usedMB}MB / ${quotaMB}MB). Consider deleting unused soundscapes.</span>
            <button class="dismiss-btn" title="Dismiss">
                <i class="fas fa-times"></i>
            </button>
        `;

        banner.querySelector('.dismiss-btn').addEventListener('click', () => {
            banner.remove();
        });

        document.body.insertBefore(banner, document.body.firstChild);
    }

    /**
     * Setup drag reorder for a layer element
     */
    _setupLayerDragReorder(layerEl, dragHandle) {
        const handle = dragHandle || layerEl;

        handle.addEventListener('dragstart', (e) => {
            layerEl.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-krakenscape-layer', layerEl.dataset.id);
            e.dataTransfer.setData('text/plain', layerEl.dataset.id);
        });

        handle.addEventListener('dragend', () => {
            layerEl.classList.remove('dragging');
            // Remove all drag-over indicators
            this.elements.soundLayers.querySelectorAll('.drag-over-layer').forEach(el => {
                el.classList.remove('drag-over-layer');
            });
        });

        layerEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const dragging = this.elements.soundLayers.querySelector('.dragging');
            if (dragging && dragging !== layerEl) {
                layerEl.classList.add('drag-over-layer');
            }
        });

        layerEl.addEventListener('dragleave', () => {
            layerEl.classList.remove('drag-over-layer');
        });

        layerEl.addEventListener('drop', (e) => {
            e.preventDefault();
            layerEl.classList.remove('drag-over-layer');

            const draggedId =
                e.dataTransfer.getData('application/x-krakenscape-layer') ||
                e.dataTransfer.getData('text/plain');
            const targetId = layerEl.dataset.id;

            if (draggedId && targetId && draggedId !== targetId && this.onLayerReorder) {
                this.onLayerReorder(draggedId, targetId);
            }
        });
    }
}

// Export for use in other modules
window.UIController = UIController;
