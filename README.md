# Bass Hero 1.8

Android app for bass-guitar tab practice.

## Version 1.8
- Everything from v1.6: local MP3-to-bass-note estimation, tab player, Wait and Flow modes, microphone pitch detection, adaptive calibration, stats, and saved progress.
- Local tempo estimation from the audio envelope, with an optional manually supplied BPM.
- BPM can be changed after analysis while preserving note positions in real time.
- Global synchronization calibration and individual note timing offsets in milliseconds.
- Tap-to-edit notes: string, fret, technique, and timing.
- Tab zoom and adaptive bar widths to make dense fret numbers easier to read.
- Local tab review that repairs very short isolated pitch blips when surrounding notes agree, and flags suspicious notes for manual review.
- Heuristic technique suggestions, clearly marked as uncertain.
- Save edited projects and their audio locally on the device.

## Important limitations
- Audio analysis is on-device signal processing, not a trained neural-network source-separation model.
- It does not isolate a bass stem from a mixed recording. Drums, guitars, vocals, distortion, and harmonics can cause incorrect or missed notes.
- Technique suggestions are guesses from pitch and timing only. A pitch track cannot reliably tell whether a player used a slide, hammer-on, or pull-off.
- BPM detection is an estimate and can choose half-time or double-time. The tempo field and synchronization controls allow correction.
- Audio clips are limited to 6 minutes. Review and correct generated notes where needed.
- Imported audio remains local to the device. No audio is uploaded to a server.
- Built-in songs are original demo material. Commercial recordings and third-party copyrighted tabs are not bundled.


## Version 1.8
- Reworked the song screen so the tab and playback controls stay prominent, with advanced settings, microphone/volume, and tab editing grouped into collapsible sections.
- Added an option to show or hide beat numbers above each bar.
- Added a selectable microphone target: string E/A/D/G and fret 0-24.
- Improved bass pitch detection with a normalized periodicity check and multiple stable samples before accepting a note.
- The audio element is now the timing reference while a custom recording is playing, reducing drift between the recording, playhead, and tab.
- Bass Sync now plays the bass notes represented by the tab in time with the original recording, in addition to the beat cues.

## Version 1.8 note
Bass Sync plays the bass line represented by the generated or edited tab over the original mix. It does not separate a clean bass stem from a mixed recording, so errors in automatic pitch detection may still need manual correction.
