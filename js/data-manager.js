/**
 * KrakenScape Data Manager
 * Handles Export/Import of Soundscape configurations
 */

class DataManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * Export a soundscape to a JSON file
     * Note: Does NOT export audio files, only configuration
     */
    exportSoundscape(soundscapeId) {
        const soundscape = this.app.soundscapes.find(s => s.id === soundscapeId);
        if (!soundscape) {
            console.error('Soundscape not found for export');
            return;
        }

        const exportData = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            type: 'krakenscape_soundscape',
            data: soundscape
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Sanitize filename
        const safeName = soundscape.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `${safeName}_soundscape.json`;

        this._triggerDownload(url, filename);
        URL.revokeObjectURL(url);
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
    importSoundscape(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);

            // Basic validation
            if (!parsed.type || parsed.type !== 'krakenscape_soundscape' || !parsed.data) {
                throw new Error('Invalid KrakenScape file format');
            }

            const importedSoundscape = parsed.data;

            // Generate new IDs to avoid collisions if importing same file
            // But keep original IDs for internal consistency within the soundscape
            const oldId = importedSoundscape.id;
            const newId = 'soundscape_' + Date.now();
            importedSoundscape.id = newId;
            importedSoundscape.name = importedSoundscape.name + ' (Imported)';

            // Add to app
            this.app.soundscapes.push(importedSoundscape);
            this.app._saveToStorage();
            this.app._renderAll();
            this.app.ui.renderSoundscapeList(this.app.soundscapes, this.app.currentSoundscape?.id);

            alert(`Successfully imported "${importedSoundscape.name}"`);
            
            // Switch to it
            this.app.selectSoundscape(newId);

        } catch (err) {
            console.error('Import failed:', err);
            alert('Failed to import soundscape: ' + err.message);
        }
    }

    /**
     * Handle file selection for import
     */
    handleImportFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.importSoundscape(e.target.result);
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
