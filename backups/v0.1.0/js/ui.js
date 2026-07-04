/**
 * KrakenScape UI Controller
 * Handles all UI interactions and updates
 */

class UIController {
    constructor() {
        this.elements = {};
        this.currentEditingLayerId = null;
        this.currentEditingOneShotId = null;
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
            cancelLayer: document.getElementById('cancelLayer'),
            saveLayer: document.getElementById('saveLayer'),

            // Soundscape modal
            soundscapeModal: document.getElementById('soundscapeModal'),
            soundscapeName: document.getElementById('soundscapeName'),
            createSoundscape: document.getElementById('createSoundscape'),

            // Mood modal
            moodModal: document.getElementById('moodModal'),
            moodName: document.getElementById('moodName'),
            createMood: document.getElementById('createMood')
        };
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
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
        } else {
            this.elements.loopOptions.style.display = 'none';
            this.elements.intermittentOptions.style.display = 'block';
        }
    }

    /**
     * Show the layer configuration modal
     */
    showLayerModal(isOneShot = false, existingConfig = null) {
        this.currentEditingLayerId = existingConfig?.id || null;
        this.isEditingOneShot = isOneShot;

        // Reset form
        this.elements.layerName.value = existingConfig?.name || '';
        this.elements.fileName.textContent = existingConfig?.fileName || 'No file selected';
        this.elements.layerFile.value = '';
        this.elements.layerVolume.value = (existingConfig?.volume || 0.7) * 100;
        this.elements.layerVolumeValue.textContent = this.elements.layerVolume.value + '%';

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

            // Show type options
            document.querySelector('.radio-group').parentElement.style.display = 'block';
            this.elements.loopOptions.parentElement.querySelectorAll('.type-options').forEach(el => {
                el.style.display = el.id === 'loopOptions' ? 'block' : 'none';
            });
        } else {
            // Hide type options for one-shots
            document.querySelector('.radio-group').parentElement.style.display = 'none';
            this.elements.loopOptions.style.display = 'none';
            this.elements.intermittentOptions.style.display = 'none';
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
    }

    /**
     * Handle save layer button
     */
    _handleSaveLayer() {
        const name = this.elements.layerName.value.trim();
        const file = this.elements.layerFile.files[0];

        if (!name) {
            alert('Please enter a name for the sound layer.');
            return;
        }

        if (!file && !this.currentEditingLayerId) {
            alert('Please select a sound file.');
            return;
        }

        const soundType = document.querySelector('input[name="soundType"]:checked').value;

        const config = {
            id: this.currentEditingLayerId || 'layer_' + Date.now(),
            name: name,
            type: this.isEditingOneShot ? 'oneshot' : soundType,
            volume: this.elements.layerVolume.value / 100,
            file: file,
            fileName: file?.name || this.elements.fileName.textContent,
            // Loop settings
            crossfadeDuration: parseFloat(this.elements.crossfadeDuration.value),
            // Intermittent settings
            minDelay: parseInt(this.elements.minDelay.value),
            maxDelay: parseInt(this.elements.maxDelay.value),
            minVolume: this.elements.minVolume.value / 100,
            maxVolume: this.elements.maxVolume.value / 100,
            fadeIn: parseFloat(this.elements.fadeIn.value),
            fadeOut: parseFloat(this.elements.fadeOut.value)
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
                    <p>No soundscapes yet.<br>Click + to create one.</p>
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
                <span>${soundscape.name}</span>
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
                <span>${mood.name}</span>
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

        if (layers.length === 0) {
            this.elements.soundLayers.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <p>No sound layers yet.<br>Click + to add a sound layer.</p>
                </div>
            `;
            return;
        }

        layers.forEach(layer => {
            const div = document.createElement('div');
            div.className = 'sound-layer';
            div.dataset.id = layer.id;

            div.innerHTML = `
                <div class="layer-play-btn">
                    <svg class="progress-ring" viewBox="0 0 50 50">
                        <circle cx="25" cy="25" r="22" />
                    </svg>
                    <button title="Play/Pause">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
                <div class="layer-info">
                    <div class="layer-name">${layer.name}</div>
                    <div class="layer-type ${layer.type}">${layer.type === 'loop' ? 'Loop' : 'Intermittent'}</div>
                </div>
                <div class="layer-volume">
                    <input type="range" min="0" max="100" value="${Math.round(layer.volume * 100)}" title="Volume">
                    <span class="volume-value">${Math.round(layer.volume * 100)}%</span>
                </div>
                <div class="layer-actions">
                    <button class="edit" title="Edit"><i class="fas fa-cog"></i></button>
                    <button class="delete" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            `;

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

            // Edit button
            div.querySelector('.edit').addEventListener('click', () => {
                if (this.onLayerEdit) {
                    this.onLayerEdit(layer.id);
                }
            });

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

        // Update layer count
        this.updateLayerCount(layers.length);
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
     * Render one-shot buttons
     */
    renderOneShots(oneShots) {
        this.elements.oneShotGrid.innerHTML = '';

        if (oneShots.length === 0) {
            this.elements.oneShotGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <i class="fas fa-bolt"></i>
                    <p>No one-shots yet</p>
                </div>
            `;
            return;
        }

        oneShots.forEach(oneShot => {
            const btn = document.createElement('button');
            btn.className = 'oneshot-btn';
            btn.dataset.id = oneShot.id;
            btn.innerHTML = `
                <i class="fas ${oneShot.icon || 'fa-volume-up'}"></i>
                <span>${oneShot.name}</span>
            `;

            btn.addEventListener('click', () => {
                if (this.onOneShotPlay) {
                    this.onOneShotPlay(oneShot.id);
                }
            });

            // Right-click to edit/delete
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e.pageX, e.pageY, [
                    { label: 'Edit', icon: 'fa-edit', action: () => this.editOneShot(oneShot) },
                    { divider: true },
                    { label: 'Delete', icon: 'fa-trash', danger: true, action: () => this.deleteOneShot(oneShot) }
                ]);
            });

            this.elements.oneShotGrid.appendChild(btn);
        });
    }

    /**
     * Update one-shot playing state
     */
    updateOneShotPlayState(oneShotId, isPlaying) {
        const btn = this.elements.oneShotGrid.querySelector(`[data-id="${oneShotId}"]`);
        if (btn) {
            if (isPlaying) {
                btn.classList.add('playing');
            } else {
                btn.classList.remove('playing');
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
        this.elements.layerCount.textContent = `${count} layer${count !== 1 ? 's' : ''} active`;
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
}

// Export for use in other modules
window.UIController = UIController;
