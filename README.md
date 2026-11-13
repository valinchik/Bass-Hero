# Bass Hero 1.6

Android app for bass-guitar tab practice.

## Version 1.6
- Everything from v1.5: full-song bass tabs, Wait and Flow modes, playback speed, Original and Bass Sync modes, microphone pitch detection, adaptive calibration, statistics, and saved progress.
- Local audio-to-tab prototype: import an MP3 or other supported audio file, analyze low-frequency pitch, and generate approximate bass notes with timestamps.
- Generated notes are mapped to standard bass strings and frets and synchronized to the imported audio by converting detected audio timestamps to beats.
- Imported audio can be stored in the phone's IndexedDB database and reused from the song library.

## Important limitations
- The audio analysis is an on-device signal-processing estimate, not a trained source-separation model.
- It does not isolate the bass stem from a mixed recording. Drums, guitars, vocals, distortion, and harmonics can cause incorrect or missed notes.
- The first version accepts audio clips up to 6 minutes and works best when the bass is clear in the mix. Review and correct generated notes where needed.
- Imported audio remains local to the device. No audio is uploaded to a server.
- Built-in songs are original demo material. Commercial recordings and third-party copyrighted tabs are not bundled.
