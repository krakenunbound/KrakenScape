const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
let resolveAlert;
let alertMessage = '';
global.alert = message => {
    alertMessage = message;
    if (resolveAlert) resolveAlert();
};
global.FileReader = class TestFileReader {
    readAsText(file) {
        queueMicrotask(() => this.onload({ target: { result: file.contents } }));
    }
};
global.File = class TestFile {
    constructor(parts, name, options = {}) {
        this.parts = parts;
        this.name = name;
        this.type = options.type || '';
        this.size = parts.reduce((sum, part) => sum + part.byteLength, 0);
    }

    async arrayBuffer() {
        const buffers = this.parts.map(part => Buffer.from(part));
        return Uint8Array.from(Buffer.concat(buffers)).buffer;
    }
};

require('../js/data-manager.js');
const { DataManager } = window;

async function main() {
    const bundlePath = path.join(
        __dirname,
        '..',
        'sounds',
        'Spaceport Lounge',
        'Spaceport Lounge.krakenscape.json'
    );
    const bundleText = fs.readFileSync(bundlePath, 'utf8');
    const bundle = JSON.parse(bundleText);
    const stored = [];
    let selectedId = null;
    let saveCount = 0;
    const app = {
        soundscapes: [],
        currentSoundscape: null,
        audioStorage: {
            async storeAudio(id, soundscapeId, file, type) {
                stored.push({ id, soundscapeId, file, type, data: await file.arrayBuffer() });
            }
        },
        _saveToStorage() {
            saveCount += 1;
        },
        async selectSoundscape(id) {
            selectedId = id;
            this.currentSoundscape = this.soundscapes.find(scene => scene.id === id);
        }
    };

    const manager = new DataManager(app);
    const importFinished = new Promise(resolve => { resolveAlert = resolve; });
    manager.handleImportFile({ contents: bundleText });
    await importFinished;

    assert.equal(bundle.type, 'krakenscape_soundscape');
    assert.equal(bundle.version, '2.0.0');
    assert.equal(app.soundscapes.length, 1);
    assert.equal(app.currentSoundscape.name, 'Spaceport Lounge');
    assert.equal(app.currentSoundscape.layers.length, 6);
    assert.equal(stored.length, 6);
    assert.equal(saveCount, 1);
    assert.equal(selectedId, app.currentSoundscape.id);
    assert.deepEqual(
        stored.map(record => record.id),
        app.currentSoundscape.layers.map(layer => layer.id)
    );
    assert.ok(stored.every(record => record.soundscapeId === selectedId));
    assert.ok(stored.every(record => record.file.type === 'audio/mpeg'));
    assert.ok(stored.every(record => record.data.byteLength > 40000));
    assert.match(alertMessage, /Successfully imported "Spaceport Lounge" with 6 audio files/);

    console.log('Portable scene import test passed: 6 layers and 6 embedded audio files restored.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
