// Tests for the WoW zone player features: per-play pitch and panning, the first
// intermittent delay, silence between music tracks, and Day/Night/weather moods.
const assert = require('node:assert/strict');

global.window = {};
global.File = class File {};
global.document = { addEventListener() {} };

require('../js/audio-engine.js');
const { wowRealism, buildWowMoods } = require('../js/app.js');
const { LayerController, PlaylistController } = window;

function param(value = 0) {
    return {
        value,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        setTargetAtTime() {}
    };
}

function node(extra = {}) {
    return { connect() {}, disconnect() {}, ...extra };
}

function makeEngine() {
    const created = { sources: [], panners: [] };
    const audioContext = {
        currentTime: 0,
        createGain: () => node({ gain: param(1) }),
        createStereoPanner: () => {
            const panner = node({ pan: param(0) });
            created.panners.push(panner);
            return panner;
        },
        createBufferSource: () => {
            const source = node({
                playbackRate: param(1),
                start() {},
                stop() {},
                onended: null
            });
            created.sources.push(source);
            return source;
        },
        createAnalyser: () => node({ frequencyBinCount: 32, getByteFrequencyData() {} })
    };
    return { engine: { audioContext, masterGain: node() }, created };
}

// Capture timers instead of waiting on them.
const timers = [];
global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
global.clearTimeout = () => {};
global.setInterval = () => 0;
global.clearInterval = () => {};

// 1) Pitch and pan stay inside the configured ranges on every play.
{
    const { engine, created } = makeEngine();
    const layer = new LayerController(engine, {
        id: 'detail', type: 'intermittent', volume: 1,
        minDelay: 5, maxDelay: 9, pitchDown: -2, pitchUp: 3, panSpread: 0.6
    });
    layer.setBuffer({ duration: 2 });
    layer.isPlaying = true;
    for (let i = 0; i < 200; i++) layer._playIntermittentOnce();
    const low = Math.pow(2, -2 / 12), high = Math.pow(2, 3 / 12);
    for (const source of created.sources) {
        assert.ok(source.playbackRate.value >= low - 1e-9 && source.playbackRate.value <= high + 1e-9);
    }
    for (const panner of created.panners) {
        assert.ok(Math.abs(panner.pan.value) <= 0.6 + 1e-9);
    }
    assert.equal(created.panners.length, 200);
    const rates = new Set(created.sources.map(source => source.playbackRate.value.toFixed(4)));
    assert.ok(rates.size > 50, 'pitch should vary between plays');
}

// 2) No variation configured: rate 1 and no panner, as before.
{
    const { engine, created } = makeEngine();
    const layer = new LayerController(engine, { id: 'plain', type: 'intermittent', volume: 1 });
    layer.setBuffer({ duration: 2 });
    layer.isPlaying = true;
    layer._playIntermittentOnce();
    assert.equal(created.sources[0].playbackRate.value, 1);
    assert.equal(created.panners.length, 0);
}

// 3) The first play waits the first-delay window, later plays the normal gap.
{
    const { engine } = makeEngine();
    const layer = new LayerController(engine, {
        id: 'first', type: 'intermittent', volume: 1,
        minDelay: 30, maxDelay: 40, firstDelayMin: 1, firstDelayMax: 2
    });
    layer.setBuffer({ duration: 1 });
    timers.length = 0;
    layer.play();
    assert.ok(timers[0].ms >= 1000 && timers[0].ms <= 2000, `first delay ${timers[0].ms}`);
    layer._scheduleIntermittent();
    assert.ok(timers[1].ms >= 30000 && timers[1].ms <= 40000, `later delay ${timers[1].ms}`);
}

// 4) A playlist with a track gap plays each track to the end, then waits.
{
    const { engine, created } = makeEngine();
    const playlist = new PlaylistController(engine, {
        id: 'music', volume: 1, shuffle: false, repeat: true,
        crossfadeDuration: 4, trackGapMin: 60, trackGapMax: 90
    });
    playlist.tracks = [{ name: 'a', buffer: { duration: 100 }, duration: 100 },
                       { name: 'b', buffer: { duration: 100 }, duration: 100 }];
    timers.length = 0;
    playlist.play();
    assert.equal(playlist.crossfadeTimeout, null, 'no crossfade when a gap is set');
    assert.equal(created.sources.length, 1);
    created.sources[0].onended();
    const gap = timers.find(timer => timer.ms >= 60000);
    assert.ok(gap && gap.ms <= 90000, 'silence between tracks');
    gap.fn();
    assert.equal(created.sources.length, 2, 'next track starts after the gap');
    assert.equal(playlist.currentTrackIndex, 1);
    playlist.stop();
}

// 5) Moods: Day and Night pick their own layers, weather moods add the weather,
//    intro and transitions stay off.
{
    const layer = (id, role, timeOfDay, weather = '', transition = false) =>
        ({ config: { id, volume: 0.5 }, tags: { role, timeOfDay, weather, transition } });
    const entries = [
        layer('dayBed', 'Bed', 'Day'),
        layer('nightBed', 'Bed', 'Night'),
        layer('music', 'Music', 'Any'),
        layer('intro', 'Intro', 'Any'),
        layer('dusk', 'Detail', 'Night', '', true),
        layer('rain', 'Weather', 'Any', 'Rain (heavy)'),
        layer('thunder', 'Weather', 'Any', 'Thunderstorm')
    ];
    const moods = buildWowMoods(entries);
    const on = name => moods.find(mood => mood.name === name).layerSettings
        .filter(setting => setting.enabled).map(setting => setting.layerId).sort();
    assert.deepEqual(moods.map(mood => mood.name),
        ['Day', 'Night', 'Day · Rain (heavy)', 'Night · Rain (heavy)', 'Day · Thunderstorm', 'Night · Thunderstorm']);
    assert.deepEqual(on('Day'), ['dayBed', 'music']);
    assert.deepEqual(on('Night'), ['music', 'nightBed']);
    assert.deepEqual(on('Night · Rain (heavy)'), ['music', 'nightBed', 'rain']);
    assert.deepEqual(on('Day · Thunderstorm'), ['dayBed', 'music', 'thunder']);
    assert.deepEqual(buildWowMoods([{ config: { id: 'x' }, tags: {} }]), [], 'old bundles get no moods');
}

// 6) Realism settings read from import_defaults; old bundles give null.
{
    assert.equal(wowRealism({ type: 'loop', volume: 0.5 }), null);
    assert.deepEqual(wowRealism({ pitch_down: -2, pitch_up: 2, pan_spread: 0.5, track_gap_min: 60 }), {
        pitchDown: -2, pitchUp: 2, panSpread: 0.5,
        firstDelayMin: 0, firstDelayMax: 0, trackGapMin: 60, trackGapMax: 0
    });
}

console.log('WoW zone player tests passed.');
