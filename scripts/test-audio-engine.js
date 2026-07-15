const assert = require('node:assert/strict');

global.window = {};
global.File = class File {};
global.document = { addEventListener() {} };

require('../js/audio-engine.js');
require('../js/ui.js');
require('../js/app.js');

const {
    AudioEngine,
    LayerController,
    OneShotController,
    PlaylistController
} = window;
const { UIController } = window;
const { KrakenScapeApp } = window;

function makeEngineStub() {
    return {
        audioContext: {
            currentTime: 0
        },
        masterGain: {}
    };
}

function makeAudioParam(initialValue = 0) {
    return {
        value: initialValue,
        events: [],
        setValueAtTime(value, time) {
            this.events.push(['set', value, time]);
        },
        linearRampToValueAtTime(value, time) {
            this.events.push(['ramp', value, time]);
        },
        setValueCurveAtTime(curve, time, duration) {
            this.events.push(['curve', curve[0], curve[curve.length - 1], time, duration]);
        },
        setTargetAtTime(value, time, constant) {
            this.events.push(['target', value, time, constant]);
        }
    };
}

function testZeroVolumeIsPreserved() {
    const engine = makeEngineStub();
    const layer = new LayerController(engine, {
        id: 'layer-zero',
        volume: 0,
        minVolume: 0,
        maxVolume: 0,
        fadeIn: 0,
        fadeOut: 0,
        crossfadeDuration: 0
    });
    const oneShot = new OneShotController(engine, {
        id: 'oneshot-zero',
        volume: 0
    });
    const playlist = new PlaylistController(engine, {
        id: 'playlist-zero',
        volume: 0,
        crossfadeDuration: 0
    });

    assert.equal(layer.volume, 0);
    assert.equal(layer.config.minVolume, 0);
    assert.equal(layer.config.maxVolume, 0);
    assert.equal(layer.config.fadeIn, 0);
    assert.equal(layer.config.fadeOut, 0);
    assert.equal(layer.config.crossfadeDuration, 0);
    assert.equal(oneShot.volume, 0);
    assert.equal(playlist.volume, 0);
    assert.equal(playlist.config.crossfadeDuration, 0);
}

function testSingleTrackNoRepeatStops() {
    const playlist = new PlaylistController(makeEngineStub(), {
        id: 'single-track',
        shuffle: true,
        repeat: false
    });
    playlist.tracks = [{ name: 'Only Track' }];

    assert.equal(playlist._getNextTrackIndex(), 0);
    playlist.playedIndices.push(0);
    assert.equal(playlist._getNextTrackIndex(), -1);
}

function testLoopCrossfadeSchedulesAnOverlap() {
    const sources = [];
    const gains = [];
    const context = {
        currentTime: 0,
        createGain() {
            const gain = {
                gain: makeAudioParam(),
                connect() {},
                disconnect() {}
            };
            gains.push(gain);
            return gain;
        },
        createBufferSource() {
            const source = {
                loop: false,
                starts: [],
                stops: [],
                connect() {},
                disconnect() {},
                start(time, offset = 0) {
                    this.starts.push([time, offset]);
                },
                stop(time) {
                    this.stops.push(time);
                },
                onended: null
            };
            sources.push(source);
            return source;
        }
    };
    const layer = new LayerController({ audioContext: context, masterGain: {} }, {
        id: 'crossfade-loop',
        type: 'loop',
        volume: 0.25,
        crossfadeDuration: 2
    });
    layer.setBuffer({ duration: 10 });

    layer.play();

    assert.equal(sources.length, 2);
    assert.deepEqual(sources[0].starts[0], [0, 0]);
    assert.deepEqual(sources[1].starts[0], [8, 0]);
    assert.equal(sources[0].stops[0], 10);
    assert.equal(sources[1].stops[0], 18);
    assert.equal(gains[0].gain.value, 0.25);
    assert.deepEqual(gains[1].gain.events, [
        ['set', 0, 0],
        ['curve', 0, 1, 0, 2],
        ['set', 1, 8],
        ['curve', 1, 0, 8, 2]
    ]);

    layer.stop();
}

function testMasterStopStopsOneShots() {
    let stopped = false;
    let endedHandler = null;
    const source = {
        buffer: null,
        connect() {},
        start() {},
        stop() {
            stopped = true;
            if (endedHandler) endedHandler();
        },
        addEventListener(event, handler) {
            if (event === 'ended') endedHandler = handler;
        }
    };
    const gain = {
        gain: { value: 1 },
        connect() {}
    };
    const engine = new AudioEngine();
    engine.audioContext = {
        createBufferSource: () => source,
        createGain: () => gain
    };
    engine.masterGain = {};

    engine.playOneShot({}, 0);
    assert.equal(engine.activeOneShotSources.size, 1);
    assert.equal(gain.gain.value, 0);

    engine.stopAll();
    assert.equal(stopped, true);
    assert.equal(engine.activeOneShotSources.size, 0);
}

function testUserTextIsEscaped() {
    const ui = new UIController();
    assert.equal(
        ui._escapeHtml('<img src=x onerror="bad()">'),
        '&lt;img src=x onerror=&quot;bad()&quot;&gt;'
    );
    assert.equal(ui._safeIcon('fa-music'), 'fa-music');
    assert.equal(ui._safeIcon('fa-music" onload="bad()'), 'fa-volume-up');
}

async function testPlaylistEditPreservesStoredTracks() {
    const calls = [];
    const app = Object.create(KrakenScapeApp.prototype);
    app.currentSoundscape = {
        id: 'scene-1',
        layers: [],
        oneShots: [],
        moods: []
    };
    app.layerConfigs = new Map();
    app.historyManager = { saveState() {} };
    app.audioEngine = { init: async () => {} };
    app.audioStorage = {
        deleteAudio: async () => calls.push('deleteAudio'),
        deletePlaylistTracks: async () => calls.push('deletePlaylistTracks'),
        storePlaylistTracks: async () => calls.push('storePlaylistTracks')
    };
    app._createAudioLayer = () => ({
        clearTracks() {},
        addTracks: async () => {}
    });
    app._loadPlaylistTracksIntoLayer = async () => calls.push('loadExistingTracks');
    app._saveToStorage = () => {};
    app._renderAll = () => {};

    await app.saveLayer({
        id: 'playlist-1',
        name: 'Existing playlist',
        type: 'playlist',
        volume: 0.4,
        playlistFiles: [],
        playlistTrackNames: ['a.mp3', 'b.mp3'],
        playlistTrackCount: 2
    }, {
        skipHistory: true,
        skipPersist: true,
        skipRender: true
    });

    assert.deepEqual(calls, ['loadExistingTracks']);
    assert.equal(app.currentSoundscape.layers[0].playlistTrackCount, 2);
}

async function main() {
    testZeroVolumeIsPreserved();
    testSingleTrackNoRepeatStops();
    testLoopCrossfadeSchedulesAnOverlap();
    testMasterStopStopsOneShots();
    testUserTextIsEscaped();
    await testPlaylistEditPreservesStoredTracks();
    console.log('Audio engine regression tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
