/**
 * KrakenScape Data Manager
 * Handles Export/Import of Soundscape configurations
 */

class DataManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * Export a portable soundscape, including its locally stored audio.
     */
    async exportSoundscape(soundscapeId) {
        const soundscape = this.app.soundscapes.find(s => s.id === soundscapeId);
        if (!soundscape) {
            console.error('Soundscape not found for export');
            return;
        }

        try {
            const storedAudio = await this.app.audioStorage.getAudioForSoundscape(soundscapeId);
            const audio = storedAudio.map(record => ({
                id: record.id,
                type: record.type,
                fileName: record.fileName,
                mimeType: record.mimeType || 'audio/mpeg',
                dataBase64: this._arrayBufferToBase64(record.data)
            }));
            const exportData = {
                version: '2.0.0',
                exportedAt: new Date().toISOString(),
                type: 'krakenscape_soundscape',
                data: soundscape,
                audio
            };
            const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const safeName = soundscape.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            this._triggerDownload(url, `${safeName}.krakenscape.json`);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Failed to export soundscape: ' + err.message);
        }
    }

    /**
     * Trigger file download
     */
    _triggerDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    /**
     * Import a soundscape from JSON string
     */
    async importSoundscape(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);

            // Basic validation
            if (!parsed.type || parsed.type !== 'krakenscape_soundscape' || !parsed.data) {
                throw new Error('Invalid KrakenScape file format');
            }

            const importedSoundscape = JSON.parse(JSON.stringify(parsed.data));
            const idMap = this._remapSoundscapeIds(importedSoundscape);
            const newId = importedSoundscape.id;
            const audioRecords = Array.isArray(parsed.audio) ? parsed.audio : [];

            for (const record of audioRecords) {
                if (!record?.id || !record?.dataBase64) continue;
                const bytes = this._base64ToArrayBuffer(record.dataBase64);
                const file = new File([bytes], record.fileName || 'imported-audio', {
                    type: record.mimeType || 'audio/mpeg'
                });
                await this.app.audioStorage.storeAudio(
                    this._remapAudioId(record.id, idMap),
                    newId,
                    file,
                    record.type || 'layer'
                );
            }

            // Add to app
            this.app.soundscapes.push(importedSoundscape);
            this.app._saveToStorage();
            await this.app.selectSoundscape(newId);
            const detail = audioRecords.length > 0
                ? ` with ${audioRecords.length} audio file${audioRecords.length === 1 ? '' : 's'}`
                : ' (configuration only; this legacy file contains no audio)';
            alert(`Successfully imported "${importedSoundscape.name}"${detail}.`);

        } catch (err) {
            console.error('Import failed:', err);
            alert('Failed to import soundscape: ' + err.message);
        }
    }

    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
    }

    _base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    _remapSoundscapeIds(soundscape) {
        const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const idMap = new Map();
        soundscape.id = `soundscape_${stamp}`;
        for (const layer of soundscape.layers || []) {
            const oldId = layer.id;
            layer.id = `layer_${stamp}_${idMap.size}`;
            idMap.set(oldId, layer.id);
        }
        for (const oneShot of soundscape.oneShots || []) {
            const oldId = oneShot.id;
            oneShot.id = `oneshot_${stamp}_${idMap.size}`;
            idMap.set(oldId, oneShot.id);
        }
        for (const mood of soundscape.moods || []) {
            mood.id = `mood_${stamp}_${Math.random().toString(36).slice(2, 5)}`;
            for (const setting of mood.layerSettings || []) {
                setting.layerId = idMap.get(setting.layerId) || setting.layerId;
            }
        }
        return idMap;
    }

    _remapAudioId(oldAudioId, idMap) {
        if (idMap.has(oldAudioId)) return idMap.get(oldAudioId);
        for (const [oldId, newId] of idMap) {
            if (oldAudioId.startsWith(`${oldId}_track_`)) {
                return newId + oldAudioId.slice(oldId.length);
            }
        }
        return oldAudioId;
    }

    /**
     * Handle file selection for import
     */
    handleImportFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            await this.importSoundscape(e.target.result);
        };
        reader.onerror = (err) => {
            console.error('Error reading file:', err);
            alert('Error reading file');
        };
        reader.readAsText(file);
    }

    /**
     * Normalize a relative path from directory uploads
     */
    _normalizeRelativePath(path) {
        return String(path || '')
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/\/+/g, '/');
    }

    /**
     * Parse a JSON file
     */
    async _readJsonFile(file) {
        const text = await file.text();
        return JSON.parse(text);
    }

    /**
     * Handle a WoW ambient folder import
     */
    async handleWowFolderImport(files) {
        const inputFiles = Array.from(files || []);
        if (inputFiles.length === 0) {
            return;
        }

        try {
            const manifestFiles = inputFiles.filter(file => file.name === 'zone_manifest.json');
            if (manifestFiles.length === 0) {
                throw new Error('No zone bundle manifests were found. Select a folder exported by WoW-Ambient.');
            }

            const candidates = [];
            for (const manifestFile of manifestFiles) {
                const manifest = await this._readJsonFile(manifestFile);
                if (manifest?.type !== 'wow_zone_audio_bundle') {
                    continue;
                }

                const manifestPath = this._normalizeRelativePath(manifestFile.webkitRelativePath || manifestFile.name);
                const manifestDir = manifestPath.includes('/')
                    ? manifestPath.slice(0, manifestPath.lastIndexOf('/'))
                    : '';
                const filesByRelativePath = new Map();

                for (const file of inputFiles) {
                    const absoluteRelativePath = this._normalizeRelativePath(file.webkitRelativePath || file.name);
                    if (manifestDir && !absoluteRelativePath.startsWith(manifestDir + '/')) {
                        continue;
                    }

                    const localRelativePath = manifestDir
                        ? absoluteRelativePath.slice(manifestDir.length + 1)
                        : absoluteRelativePath;
                    filesByRelativePath.set(localRelativePath, file);
                }

                candidates.push({
                    id: manifestPath,
                    manifest,
                    filesByRelativePath,
                    zoneName: manifest.zone?.name || 'Unknown Zone',
                    familyName: manifest.zone?.family_name || '',
                    clipCount: manifest.summary?.clip_count || 0,
                    groupCount: manifest.summary?.group_count || 0
                });
            }

            if (candidates.length === 0) {
                throw new Error('The selected folder does not contain a compatible WoW zone bundle.');
            }

            candidates.sort((a, b) => {
                const familyCompare = (a.familyName || '').localeCompare(b.familyName || '');
                if (familyCompare !== 0) {
                    return familyCompare;
                }
                return a.zoneName.localeCompare(b.zoneName);
            });

            this.app.ui.showWowImportModal(
                candidates,
                async (selectedCandidates) => {
                    await this._importWowCandidates(selectedCandidates);
                }
            );
        } catch (err) {
            console.error('WoW import failed:', err);
            alert('Failed to read WoW-Ambient folder: ' + err.message);
        }
    }

    /**
     * Import one or more parsed WoW candidates
     */
    async _importWowCandidates(candidates) {
        const imported = [];
        const failures = [];

        for (const candidate of candidates) {
            try {
                const result = await this.app.importWowZoneBundle(candidate.manifest, candidate.filesByRelativePath);
                imported.push(result);
            } catch (err) {
                failures.push(`${candidate.zoneName}: ${err.message}`);
            }
        }

        if (imported.length > 0) {
            const lastImported = imported[imported.length - 1];
            await this.app.selectSoundscape(lastImported.soundscapeId);
        }

        const summaryParts = [];
        if (imported.length > 0) {
            const layerTotal = imported.reduce((sum, entry) => sum + (entry.importedCount || 0), 0);
            summaryParts.push(`Imported ${imported.length} soundscape${imported.length !== 1 ? 's' : ''} with ${layerTotal} layer${layerTotal !== 1 ? 's' : ''}.`);
        }
        if (failures.length > 0) {
            summaryParts.push(`Skipped ${failures.length} zone${failures.length !== 1 ? 's' : ''}: ${failures.join(' | ')}`);
        }

        if (summaryParts.length > 0) {
            alert(summaryParts.join(' '));
        }
    }
}

window.DataManager = DataManager;
