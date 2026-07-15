# KrakenScape User Manual

## Overview
KrakenScape is a local-first ambient soundscape designer inspired by tools like Syrinscape. It allows you to mix looping background audio with intermittent (randomized) sound effects to create immersive environments for tabletop RPGs, writing, or relaxation.

KrakenScape's interface and existing soundscapes work fully offline. All interface icons are bundled with the project, and audio is stored locally in the browser's IndexedDB database.

## Features
- **Soundscapes**: Collections of audio layers and presets.
- **Moods**: Saved snapshots of volume levels and active layers.
- **Sound Layers**:
    - **Loops**: Continuous background tracks (e.g., Engine Hum, Rain).
    - **Intermittent**: Sounds that play at random intervals (e.g., Computer Beeps, Thunder).
    - **Playlist**: Music folders or multi-file selections with shuffle/repeat.
- **One-Shots**: Instant trigger buttons for sound effects (e.g., Laser Blast, Door Open).
- **Per-Sound Volume**: Individual volume sliders for layers and one-shots.
- **Playback Behavior**: Toggle master inclusion, auto-play, and randomization options per layer.
- **Export/Import**: Share your configurations or back them up.
- **WoW Ambient Import**: Import grouped zone bundles exported from WoW-Ambient directly into a new soundscape.

## Getting Started

### Creating a Soundscape
1. Click the **+** button in the **Soundscapes** panel (left sidebar).
2. Enter a name (e.g., "Starship Bridge") and click **Create**.

### Adding Sound Layers
1. Select a Soundscape.
2. Click the **+** button in the **Sound Layers** panel (center).
3. OR: Drag and drop an audio file directly into the center panel.
4. **Configure the Layer**:
    - **Name**: Give it a descriptive name.
    - **Sound Type**:
        - **Loop**: Plays continuously with crossfading looping.
        - **Intermittent**: Plays randomly. Set Min/Max Delay (seconds between sounds) and Min/Max Volume (randomized volume).
        - **Playlist**: Select a music folder or multiple files and set shuffle/repeat.
    - **File**: Select an audio file (MP3, WAV, OGG, etc.).
    - **Controls**: Adjust crossfade duration or fade times.
    - **Playback Behavior**:
        - **Include in Master Play**: Whether the layer plays when you hit master play.
        - **Auto-play when soundscape loads**: Start this layer automatically on load.
        - **Randomize start offset** (Loop): Start loops at random positions.
        - **Randomize delay / volume** (Intermittent): Enable or disable randomization.
5. Click **Save Layer**.

### Creating Moods
1. Set up your layers: play specific ones and adjust their volumes to create a desired atmosphere.
2. Click the **+** button in the **Moods** panel (left sidebar, bottom).
3. Name the mood (e.g., "Red Alert", "Night Shift").
4. Click **Create**.
5. **Tip**: Clicking a saved Mood later will instantly restore those layer settings.

### Using One-Shots
1. Click the **+** button in the **One-Shots** panel (right sidebar).
2. OR: Drag and drop an audio file into the right sidebar.
3. Configure the button:
    - **Name**: Label for the button.
    - **Icon**: Choose a visual icon (Spaceship, Skull, Fire, etc.) from the picker.
    - **File**: Select the sound effect.
4. Click the button to play the sound instantly.
5. **Per-sound volume**: Use the slider under each one-shot to set its loudness.

### Using Playlists
1. Click **+** in **Sound Layers** and choose **Playlist**.
2. Use **Select Folder** for a music folder or **Select Files** for a custom list.
3. Enable **Shuffle tracks** and **Repeat playlist** as needed.
4. Use the **Skip** button on the layer to jump to the next track.

## Import / Export

### Exporting
To save your configuration or share it with others:
1. Select the Soundscape you want to export.
2. Click the **Export** button (file with arrow out) in the Soundscapes header.
3. A JSON file (e.g., `starship_bridge_soundscape.json`) will be downloaded.
4. **Note**: This file contains the *configuration* (settings, volume, names), but **not** the audio files themselves. Because KrakenScape is a web app, audio files are stored in your browser's local database.

### Importing
1. Click the **Import** button (file with arrow in) in the Soundscapes header.
2. Select a `.json` soundscape file.
3. The Soundscape will be added to your list.
4. **Important**: Since audio files are not in the JSON, you may need to re-link audio files if they aren't already in your browser's storage. However, if you are importing on the same machine, it should link up automatically.

### Importing From WoW-Ambient
1. Export one or more zones from WoW-Ambient into a folder.
2. In KrakenScape, click the **folder tree** button in the Soundscapes header.
3. Select the exported WoW-Ambient folder.
4. Choose a detected zone bundle in the import dialog, or use **Import All**.
5. KrakenScape will create a new soundscape and turn the grouped WoW audio into playlist and ambient layers automatically.

## Troubleshooting
- **Audio not playing?** Click anywhere on the page to ensure the "Audio Context" is resumed (browser security policy).
- **Missing Audio?** If layers show but don't play after import, edit the layer and re-select the audio file.
