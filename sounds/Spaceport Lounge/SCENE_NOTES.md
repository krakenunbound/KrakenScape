# Spaceport Lounge

An ElevenLabs API test scene for KrakenScape. The mix depicts a calm passenger departure lounge inside an orbital space station.

## Mix design

- **Life Support & Generator Hum** — continuous physical foundation.
- **Waiting Travelers** — quiet, unintelligible human presence.
- **Terminal Electronics** — subtle interface activity kept well behind the crowd.
- **Distant PA Announcement** — routine intermittent announcement every 45–100 seconds.
- **Distant Ship Docking** — structural event every 35–85 seconds.
- **Boarding Gate Chime** — gentle notification every 60–140 seconds.

The three event files were deliberately gain-reduced because their raw generations approached digital full scale. The crowd and machinery beds were raised to practical working levels. KrakenScape still applies the conservative per-layer volumes stored in `zone_manifest.json`.

## Files

- `audio/` contains gain-staged files intended for KrakenScape.
- `raw/` contains the untouched ElevenLabs API responses.
- `zone_manifest.json` lets KrakenScape import the entire folder as a six-layer soundscape.

## Generation

- Model: `eleven_text_to_sound_v2`
- Output: 44.1 kHz, 128 kbps stereo MP3
- Reported API usage: 620 units total
- ElevenLabs remains optional; KrakenScape playback is fully offline after import.

## Import

In KrakenScape, select the folder-tree import button and choose the `Spaceport Lounge` folder. Select the detected scene and import it, then press Master Play.
