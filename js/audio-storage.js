/**
 * KrakenScape Audio Storage
 * Persists audio files in IndexedDB for cross-session access
 */

class AudioStorage {
    constructor() {
        this.dbName = 'KrakenScapeAudio';
        this.dbVersion = 1;
        this.storeName = 'audioFiles';
        this.db = null;
    }

    /**
     * Initialize the database connection
     */
    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('AudioStorage: IndexedDB connected');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store for audio files
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('soundscapeId', 'soundscapeId', { unique: false });
                    store.createIndex('layerId', 'layerId', { unique: false });
                    console.log('AudioStorage: Created object store');
                }
            };
        });
    }

    /**
     * Store an audio file
     * @param {string} id - Unique identifier (layer or oneshot ID)
     * @param {string} soundscapeId - Parent soundscape ID
     * @param {File} file - The audio file
     * @param {string} type - 'layer' or 'oneshot'
     */
    async storeAudio(id, soundscapeId, file, type = 'layer') {
        await this.init();

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        const record = {
            id: id,
            soundscapeId: soundscapeId,
            type: type,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            data: arrayBuffer,
            storedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(record);

            request.onsuccess = () => {
                console.log(`AudioStorage: Stored ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
                resolve(true);
            };

            request.onerror = () => {
                console.error('AudioStorage: Failed to store audio:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Store multiple audio files for a multi-track layer
     * @param {string} layerId - The layer ID
     * @param {string} soundscapeId - Parent soundscape ID
     * @param {File[]} files - Array of audio files
     * @param {string} type - Track record type
     */
    async storeLayerTracks(layerId, soundscapeId, files, type = 'layer_track') {
        const results = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const trackId = `${layerId}_track_${i}`;
            try {
                await this.storeAudio(trackId, soundscapeId, file, type);
                results.push({ file: file.name, success: true });
            } catch (err) {
                results.push({ file: file.name, success: false, error: err });
            }
        }
        return results;
    }

    /**
     * Store multiple audio files for a playlist
     * @param {string} playlistId - The playlist layer ID
     * @param {string} soundscapeId - Parent soundscape ID
     * @param {File[]} files - Array of audio files
     */
    async storePlaylistTracks(playlistId, soundscapeId, files) {
        return await this.storeLayerTracks(playlistId, soundscapeId, files, 'playlist_track');
    }

    /**
     * Retrieve an audio file's ArrayBuffer
     * @param {string} id - The layer/oneshot ID
     * @returns {Promise<{arrayBuffer: ArrayBuffer, fileName: string, mimeType: string}|null>}
     */
    async getAudio(id) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => {
                if (request.result) {
                    resolve({
                        arrayBuffer: request.result.data,
                        fileName: request.result.fileName,
                        mimeType: request.result.mimeType
                    });
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('AudioStorage: Failed to get audio:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get all stored tracks for a multi-track layer
     * @param {string} layerId - The layer ID
     * @returns {Promise<Array<{arrayBuffer: ArrayBuffer, fileName: string}>>}
     */
    async getLayerTracks(layerId) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();
            const tracks = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.id.startsWith(`${layerId}_track_`)) {
                        tracks.push({
                            id: cursor.value.id,
                            arrayBuffer: cursor.value.data,
                            fileName: cursor.value.fileName,
                            mimeType: cursor.value.mimeType
                        });
                    }
                    cursor.continue();
                } else {
                    // Sort by track number
                    tracks.sort((a, b) => {
                        const numA = parseInt(a.id.split('_track_')[1]);
                        const numB = parseInt(b.id.split('_track_')[1]);
                        return numA - numB;
                    });
                    resolve(tracks);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all playlist tracks for a playlist
     * @param {string} playlistId - The playlist layer ID
     * @returns {Promise<Array<{arrayBuffer: ArrayBuffer, fileName: string}>>}
     */
    async getPlaylistTracks(playlistId) {
        return await this.getLayerTracks(playlistId);
    }

    /**
     * Get all audio files for a soundscape
     * @param {string} soundscapeId - The soundscape ID
     * @returns {Promise<Array>}
     */
    async getAudioForSoundscape(soundscapeId) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('soundscapeId');
            const request = index.getAll(soundscapeId);

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Delete an audio file
     * @param {string} id - The layer/oneshot ID
     */
    async deleteAudio(id) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log(`AudioStorage: Deleted ${id}`);
                resolve(true);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Delete all stored tracks for a multi-track layer
     * @param {string} layerId - The layer ID
     */
    async deleteLayerTracks(layerId) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();
            const deletePromises = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.id.startsWith(`${layerId}_track_`)) {
                        deletePromises.push(
                            new Promise((res) => {
                                const delReq = cursor.delete();
                                delReq.onsuccess = () => res(true);
                                delReq.onerror = () => res(false);
                            })
                        );
                    }
                    cursor.continue();
                } else {
                    Promise.all(deletePromises).then(() => resolve(true));
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete all playlist tracks
     * @param {string} playlistId - The playlist layer ID
     */
    async deletePlaylistTracks(playlistId) {
        return await this.deleteLayerTracks(playlistId);
    }

    /**
     * Delete all audio for a soundscape
     * @param {string} soundscapeId - The soundscape ID
     */
    async deleteAudioForSoundscape(soundscapeId) {
        await this.init();

        const files = await this.getAudioForSoundscape(soundscapeId);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            let deleted = 0;
            if (files.length === 0) {
                resolve(0);
                return;
            }

            files.forEach(file => {
                const request = store.delete(file.id);
                request.onsuccess = () => {
                    deleted++;
                    if (deleted === files.length) {
                        console.log(`AudioStorage: Deleted ${deleted} files for soundscape ${soundscapeId}`);
                        resolve(deleted);
                    }
                };
            });
        });
    }

    /**
     * Check if audio exists for a given ID
     * @param {string} id - The layer/oneshot ID
     * @returns {Promise<boolean>}
     */
    async hasAudio(id) {
        const audio = await this.getAudio(id);
        return audio !== null;
    }

    /**
     * Get storage statistics
     * @returns {Promise<{count: number, totalSize: number}>}
     */
    async getStats() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();

            let count = 0;
            let totalSize = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    count++;
                    totalSize += cursor.value.size || 0;
                    cursor.continue();
                } else {
                    resolve({ count, totalSize });
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all stored audio
     */
    async clearAll() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('AudioStorage: Cleared all audio');
                resolve(true);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check storage quota and warn if approaching limit
     * @returns {Promise<{used: number, quota: number, percent: number, warning: boolean}>}
     */
    async checkQuota() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { used: 0, quota: 0, percent: 0, warning: false };
        }

        try {
            const estimate = await navigator.storage.estimate();
            const used = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const percent = quota > 0 ? (used / quota) * 100 : 0;
            const warning = percent > 80;

            if (warning) {
                console.warn(`AudioStorage: Storage usage at ${percent.toFixed(1)}% (${(used / 1024 / 1024).toFixed(1)}MB / ${(quota / 1024 / 1024).toFixed(1)}MB)`);
            }

            return { used, quota, percent, warning };
        } catch (err) {
            console.error('Failed to check storage quota:', err);
            return { used: 0, quota: 0, percent: 0, warning: false };
        }
    }
}

// Export for use in other modules
window.AudioStorage = AudioStorage;
