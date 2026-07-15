# KrakenScape Development Log

## Project Overview
A soundscape designer application inspired by Syrinscape, for creating ambient soundscapes for tabletop RPGs. Built with vanilla HTML/CSS/JavaScript using the Web Audio API.

---

## Version 0.7.0 - 2026-07-15

### Offline and safety maintenance

- Bundled Font Awesome locally and removed the final runtime internet dependency.
- Added a real `.gitignore`; local secrets are kept under `secrets/` and excluded from Git.
- Preserved exact 0% volumes for layers, playlists, intermittent ranges, and one-shots.
- Made the master Stop control stop currently playing one-shots as well as layers.
- Prevented playlist edits from deleting stored tracks when no replacement files are selected.
- Corrected single-track playlists with repeat disabled.
- Cleared stale playlist crossfade scheduling when Skip is used.
- Escaped imported and user-entered names before rendering them as HTML.
- Added dependency-free syntax, offline-asset, and audio regression checks through `npm test`.

---

## Session 1 - 2026-01-09

### Goals
- Create initial project structure
- Build Syrinscape-inspired UI
- Implement audio engine with support for looping and intermittent sounds
- Add profile/mood save system

### What Was Created

#### Version 0.1.0

**Files Created:**
1. `index.html` - Main application layout
   - Header with logo, master play/stop, volume controls
   - Left sidebar for soundscapes list with search
   - Second column for moods/presets
   - Center panel for sound layers with progress rings and volume sliders
   - Right sidebar for one-shot sound effects
   - Footer status bar
   - Modals for creating soundscapes, moods, and configuring layers

2. `css/styles.css` - Dark sci-fi themed styling
   - CSS variables for consistent theming
   - Cyan accent color (#00d4ff) matching Syrinscape aesthetic
   - Circular progress rings around play buttons
   - Styled range sliders for volume control
   - Modal dialogs for configuration
   - Context menus for right-click actions

3. `js/audio-engine.js` - Core audio functionality
   - `AudioEngine` class - manages Web Audio API context and master gain
   - `LayerController` class - handles individual sound layers
     - Loop mode: seamless looping with configurable crossfade
     - Intermittent mode: random delays, volume variance, fade in/out
   - `OneShotController` class - handles one-shot sound effects
   - Progress tracking for UI updates

4. `js/ui.js` - UI controller
   - DOM element caching
   - Event binding for all controls
   - Modal management
   - Render methods for lists, layers, and one-shots
   - Context menu support for right-click actions

5. `js/app.js` - Main application logic
   - Ties together audio engine and UI
   - Soundscape CRUD operations
   - Mood system (captures/applies layer settings)
   - Layer management
   - One-shot management
   - localStorage persistence

**Directory Structure:**
```
F:/KrakenScape/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── audio-engine.js
│   ├── ui.js
│   └── app.js
├── sounds/           (empty, for user sound files)
├── backups/          (for version backups)
└── DEVLOG.md         (this file)
```

### Key Design Decisions

1. **Vanilla JS over framework** - Keeps it simple, no build step required, easier to understand and modify

2. **Web Audio API** - Native browser support, powerful scheduling and mixing capabilities

3. **Two sound types:**
   - **Loop**: Continuous ambient sounds (engine hum, wind, rain)
   - **Intermittent**: Random one-off sounds with configurable delays (footsteps, beeps, comm chatter)

4. **Mood system**: Snapshots of layer settings (volume, enabled state) that can be saved and recalled

5. **localStorage persistence**: Simple storage for soundscapes and settings (note: audio files must be re-imported each session since File objects can't be persisted)

### Known Limitations (v0.1.0)

1. Audio files must be re-imported after browser refresh (Web Audio buffers are lost)
2. No export/import of soundscapes to file
3. No visual waveform display
4. One-shot icons are hardcoded (no icon picker yet)

---

#### Version 0.2.0

**Changes Made:**

1. **Added drag-and-drop sound import** (`js/ui.js`)
   - Added `_setupDragAndDrop()` method to initialize drop zones
   - Added `_makeDropZone()` helper to convert elements into drop zones
   - Sound layers panel and one-shot grid both accept dropped audio files
   - Files are filtered to only accept audio formats (mp3, wav, ogg, flac, m4a, aac, webm)
   - Visual feedback when dragging over drop zones

2. **Updated CSS for drag-over state** (`css/styles.css`)
   - Added `.drag-over` class styling for sound-layers and oneshot-grid
   - Dashed cyan border and subtle glow effect when dragging files

3. **Added file drop handler** (`js/app.js`)
   - Added `handleDroppedFiles()` method
   - Automatically creates layer or one-shot configs from dropped files
   - Uses filename (without extension) as the default name
   - Sets sensible defaults for all settings

4. **Updated empty state messages**
   - Sound layers: "No sound layers yet. Click + or drag audio files here."
   - One-shots: "No one-shots yet. Drag audio files here."

**What Works:**
- Dragging audio files onto the sound layers panel creates loop layers
- Dragging audio files onto the one-shot grid creates one-shot buttons
- Visual feedback (cyan dashed border) when dragging over valid drop zones
- Multiple files can be dropped at once

---

#### Version 0.3.0

**Changes Made:**

1. **Added PlaylistController class** (`js/audio-engine.js`)
   - New controller for music playlists with multiple tracks
   - Shuffle mode with smart no-repeat algorithm (plays all tracks before repeating)
   - Crossfade between tracks (configurable duration)
   - Skip track functionality
   - Track change notifications for UI updates
   - Progress tracking per track

2. **Updated HTML modal for playlist type** (`index.html`)
   - Added "Playlist (Music folder)" as third sound type option
   - Added playlist-specific file selection (folder or multiple files)
   - Added playlist options: crossfade duration, shuffle toggle
   - Added playlist file list display showing selected tracks

3. **Updated CSS for new elements** (`css/styles.css`)
   - Added `.radio-group-vertical` for stacked radio buttons
   - Added `.checkbox-label` styling
   - Added `.playlist-file-list` styling for track list display

4. **Planned UI updates** (`js/ui.js`)
   - Support for playlist type in layer rendering
   - Skip button for playlist layers
   - Track info display (current playing track)
   - Folder/multi-file selection handling

**How Playlists Work:**
- Select "Playlist" type when creating a layer
- Choose a folder of music files OR select multiple files
- Tracks play in shuffled order (no repeats until all played)
- Crossfade smoothly between tracks
- Skip button to jump to next track

**Audio Engine Features:**
- `PlaylistController.addTrack(file)` - Add single track
- `PlaylistController.addTracks(files)` - Add multiple tracks
- `PlaylistController.skip()` - Skip to next track
- `PlaylistController.config.shuffle` - Toggle shuffle mode
- `PlaylistController.onTrackChange` - Callback when track changes

### Next Steps for v0.5.0
- [ ] Complete UI integration for playlist type
- [ ] Add loading spinner during file import
- [ ] Add icon picker for one-shots
- [ ] Test with actual audio files and fix bugs
- [ ] Add export/import soundscape to file for backup

---

#### Version 0.3.1

**Bugfix:**

1. **Fixed null reference error in layer modal** (`js/ui.js`)
   - Bug: Clicking cog/edit button on sound layer threw error:
     `TypeError: Cannot read properties of null (reading 'parentElement')`
   - Cause: Code referenced `.radio-group` but HTML used `.radio-group-vertical`
   - Fix: Updated lines 272 and 278 to use `.radio-group-vertical` selector

**What Works:**
- Layer configuration modal now opens correctly when clicking cog button
- Sound type options (Loop, Intermittent, Playlist) are displayed properly

---

#### Version 0.4.0

**Major Feature: Persistent Audio Storage with IndexedDB**

Audio files now persist across browser sessions! No more re-dragging files after refresh.

**Files Created:**
1. `js/audio-storage.js` - IndexedDB wrapper for audio file persistence
   - `AudioStorage` class with full CRUD operations
   - Stores audio files as ArrayBuffers in browser database
   - Supports layers, one-shots, and playlist tracks
   - Automatic storage stats logging on startup

**Files Modified:**
1. `index.html` - Added audio-storage.js script include
2. `js/app.js` - Integrated IndexedDB storage throughout
   - Audio files stored in IndexedDB when dropped/imported
   - Audio auto-loads from IndexedDB when selecting a soundscape
   - Duplicate soundscape now copies audio files
   - Delete soundscape/layer/oneshot cleans up stored audio

**How It Works:**
- When you drop an audio file, it's stored in IndexedDB (browser database)
- When you select a soundscape, audio is loaded from IndexedDB automatically
- When you delete a layer/soundscape, audio is cleaned up from IndexedDB
- Storage persists even after closing the browser
- Console shows storage stats on startup (file count and total size)

**Storage Details:**
- Database name: `KrakenScapeAudio`
- Object store: `audioFiles`
- Indexed by: `id`, `soundscapeId`, `layerId`
- Stores: ArrayBuffer data, fileName, mimeType, size, timestamp

**What Works:**
- Audio files persist across browser refresh
- Audio files persist across browser close/reopen
- Automatic loading when selecting soundscapes
- Proper cleanup when deleting content
- Duplicating soundscapes copies audio files

**Known Limitations:**
- Browser storage limits apply (typically 50MB-2GB depending on browser)
- Cannot export audio files to backup (would need file download feature)

---

## Backup Log

| Version | Date | Backup Location | Notes |
|---------|------|-----------------|-------|
| 0.1.0 | 2026-01-09 | backups/v0.1.0/ | Initial version |
| 0.2.0 | 2026-01-09 | backups/v0.2.0/ | Added drag-and-drop import |
| 0.3.0 | 2026-01-09 | backups/v0.3.0/ | Added playlist/music folder support |

---
 
#### Version 0.5.0

**Features Added:**

1. **Per-sound volume controls** (`js/ui.js`, `js/app.js`, `css/styles.css`)
   - Inline volume sliders for one-shots
   - Layer volume updates now persist to localStorage

2. **Layer playback behavior toggles** (`index.html`, `js/ui.js`, `js/audio-engine.js`)
   - Include in master play, auto-play on load
   - Loop random start offset
   - Intermittent randomize delay and volume switches

3. **Playlist integration completed** (`js/app.js`, `js/ui.js`, `js/audio-engine.js`, `js/audio-storage.js`, `css/styles.css`)
   - Folder/multi-file selection in the layer modal
   - Shuffle and repeat controls
   - Track info display and skip button
   - Playlist tracks persisted in IndexedDB and loaded on soundscape select

**Notes:**
- One-shot volume uses the new slider per button.
- Playlist tracks are stored as per-track entries in IndexedDB.

---

#### Version 0.6.0

**Session 2 - Major UX Improvements**

**Bug Fixes:**

1. **Fixed unreachable code bug** (`js/app.js`)
   - `console.log` was after `return` statement - moved it before

2. **Fixed setBuffer error for playlists** (`js/app.js`)
   - Added check to skip setBuffer call for playlist layers (they use setTrackBuffer instead)

**New Features:**

1. **Keyboard Shortcuts** (`js/ui.js`, `js/app.js`)
   - `Space` - Toggle master play/stop
   - `Escape` - Close modals
   - `1-9` - Trigger one-shots by position (with visual key hints on buttons)
   - `M` - Toggle mute
   - `Ctrl+Z` - Undo
   - `Ctrl+Y` - Redo

2. **Drag to Reorder Layers** (`js/ui.js`, `js/app.js`, `css/styles.css`)
   - Drag handle on each layer (grip icon)
   - Visual feedback during drag
   - Order persists to storage

3. **Visual Audio Level Meter** (`js/audio-engine.js`, `js/app.js`, `index.html`, `css/styles.css`)
   - Real-time audio level display in header
   - Uses Web Audio API AnalyserNode for RMS calculation
   - Color gradient from green to yellow to red
   - Glow effect when loud/clipping

4. **Undo/Redo System** (`js/history-manager.js`, `js/app.js`, `index.html`, `css/styles.css`)
   - New `HistoryManager` class
   - Tracks state changes for layers, one-shots, moods
   - Up to 50 undo levels
   - Undo/redo buttons in header
   - Tooltips show what action will be undone/redone

5. **Quick Volume Presets** (`js/ui.js`)
   - Double-click layer volume slider to reset to 70%
   - Double-click one-shot volume slider to reset to 100%
   - Tooltips describe the feature

6. **Enhanced Now Playing Indicator** (`css/styles.css`)
   - Animated music note icon for playlist tracks
   - Pulsing animation while playing

7. **Storage Quota Warning** (`js/audio-storage.js`, `js/app.js`, `js/ui.js`, `css/styles.css`)
   - Checks browser storage quota on startup
   - Shows warning banner if over 80% full
   - Dismissible banner with usage stats

**Files Created:**
- `js/history-manager.js` - Undo/redo state management

**Files Modified:**
- `js/app.js` - Integrated all new features
- `js/ui.js` - Keyboard shortcuts, drag reorder, volume presets, storage warning
- `js/audio-engine.js` - Added master analyser for level metering
- `js/audio-storage.js` - Added quota checking
- `css/styles.css` - Styles for new features
- `index.html` - Undo/redo buttons, level meter, tooltips

**Keyboard Shortcuts Summary:**
| Key | Action |
|-----|--------|
| Space | Play/Stop all |
| Escape | Close modals |
| 1-9 | Play one-shot |
| M | Toggle mute |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
