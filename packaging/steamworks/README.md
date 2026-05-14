# MultiDeck Steamworks packaging

This directory contains everything needed to package MultiDeck as a Steamworks depot for distribution through the Steam Store. It produces a self-contained Linux tarball that runs inside the Steam Linux Runtime 3.0 ("sniper") container.

If you just want to install MultiDeck, this directory is not what you want — see `docs/INSTALL.md`.

---

## Status: Phase 2, scaffolding only

The build pipeline is implemented but **untested against a real Steamworks account.** Templates and the tarball builder are in place. Publishing to Steam requires:

1. A Steamworks Partner account ($100 one-time fee at https://partner.steamgames.com/)
2. A Steamworks AppID assigned to MultiDeck
3. Steam SDK installed locally (`steamcmd` for upload)
4. A test build pipeline to validate inside the Steam Runtime

Phase 2.5 will close the loop with a real Steamworks account once registered. Until then, this directory ships templates that demonstrate the intended shape and let interested forks pick up the work.

---

## Architecture

```
multideck-<version>/                  <- top of the tarball; "depot root"
  bin/
    multideck                         entry point; called by Steam launch option
    node                              bundled Node 22.x (statically linked or sniper-compatible)
    whisper-cli                       prebuilt for sniper container
    ffplay                            prebuilt ffmpeg/ffplay for sniper
  app/
    dashboard/                        server.cjs and assets
    personas/
    hooks/
    scripts/
    docs/
    README.txt                        in-game help pointer
  data/
    kokoro-venv/                      pre-built Python venv with CPU torch
    models/
      whisper-base.en.bin             pinned model
  share/
    multideck.desktop                 for Gaming Mode shortcut
    portraits/                        launcher art
```

The bundle is fully self-contained. No system-wide installs. User state goes to `${XDG_DATA_HOME}/multideck/` (Steam's home redirect handles this for sandboxed apps).

---

## Building the depot

```bash
./build-tarball.sh                    # full build (~6 GB output)
./build-tarball.sh --skip-models      # skip whisper model download (CI; supply via mounted volume)
./build-tarball.sh --skip-venv        # skip Python venv build (use prebuilt artifact)
./build-tarball.sh --output ../dist   # custom output dir
```

Output:
- `dist/multideck-<version>-linux-x64.tar.zst`
- `dist/multideck-<version>-linux-x64.tar.zst.sha256`
- `dist/multideck-<version>-manifest.txt`

The tar uses zstd compression. Typical size: ~2.5 GB compressed, ~6 GB extracted.

---

## Uploading to Steamworks

After you have a Partner account and AppID:

```bash
# Edit depot.vdf and app_build.vdf with your AppID and depot ID
cp depot.vdf.template depot.vdf
cp app_build.vdf.template app_build.vdf
$EDITOR depot.vdf app_build.vdf

# Stage the build for upload
./stage-steamworks-build.sh ../dist/multideck-X.Y.Z-linux-x64.tar.zst ./build-staging/

# Upload
steamcmd +login your_steamworks_username +run_app_build ./app_build.vdf +quit
```

See https://partner.steamgames.com/doc/sdk/uploading for the official Valve docs.

---

## Launch behavior on Steam Deck

When the user launches MultiDeck from Steam:

1. Steam mounts the depot read-only at `~/.steam/steam/steamapps/common/MultiDeck/`
2. Steam invokes the launch option (`bin/multideck`) inside the sniper runtime container
3. `bin/multideck` runs the universal installer in steamworks-mode for first-launch validation, then exec's `dashboard/server.cjs`
4. Server listens on a random localhost port, Chromium opens in app-mode pointing at it
5. User state writes go to `${STEAM_COMPAT_DATA_PATH}/pfx/drive_c/users/steamuser/AppData/...` if Steam Cloud sync is enabled, or `${XDG_DATA_HOME}/multideck/` if not

Phase 2.5 will pick the right path based on Steam Cloud configuration.

---

## Phase 2.5 work items

When a Steamworks account exists:

- [ ] Register AppID for MultiDeck, drop it into the .vdf templates
- [ ] Test build inside Steam Linux Runtime 3.0 sniper container (`steamrt:sniper` docker image)
- [ ] Validate Chromium app-mode bundling — likely need to ship our own chromium binary or use the sniper-included one
- [ ] Wire Steam Cloud paths (decide: cloud-sync transcripts? voice configs? jobs?)
- [ ] Test on Steam Deck OLED + LCD with the real depot
- [ ] Submit for Valve review
- [ ] Set up CI to build the tarball on every tagged release

---

## Why not Flatpak for Steam?

Steam Store does not accept Flatpaks. See `docs/DEPLOYMENT.md` for the full rationale. Flatpak remains the right path for Flathub distribution (phase 3); Steamworks depot is the right path for Steam Store distribution.
