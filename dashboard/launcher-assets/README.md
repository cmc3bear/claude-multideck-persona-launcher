# Launcher Assets

Place persona portraits, intro clips, and music beds here for the launcher UI.

## Expected structure

```
launcher-assets/
├── portraits/
│   └── <persona-key>.png       64x64 or 128x128 pixel art portrait
├── intros/
│   ├── <persona-key>.mp3       Short intro clip (2-4 seconds)
│   └── <persona-key>-deploy.mp3  Deploy confirmation clip
└── music/
    └── *.mp3                   Background tracks (auto-listed on /launcher/music)
```

## Notes

- Portraits are shown on the operative card in the launcher. Without a portrait, the launcher displays a glyph fallback.
- Intro clips play when a persona is selected. Deploy clips play when "JACK IN" fires.
- Music files in `music/` are auto-discovered by the `/launcher/music` API route and available in the launcher's music player.
- All assets are served via `/launcher/assets/*` with path traversal guards.
