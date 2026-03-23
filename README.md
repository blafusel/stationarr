# Stationarr

A modern EPG-style web interface for Plex Media Server that displays your media library in a TV guide format.

## Features

- **EPG-Style Interface**: Browse your media in a familiar TV guide layout
- **Real-time Updates**: Auto-refresh content with configurable intervals
- **Video Playback**: Stream media directly in the browser with position memory and EPG-aware resume
- **Music Playback**: Plexamp-style audio player for music playlists with album artwork, blurred backdrop, seek bar, volume control, and mini-player
- **Global Shuffle**: ⇄ Shuffle button in the header instantly plays a random item from any visible channel; each subsequent track also plays randomly until turned off
- **Content Randomization**: ⇌ Randomize button re-shuffles the order of media content within all channels, creating a fresh EPG schedule while maintaining stable broadcast timing
- **Player Navigation**: Previous ⏮, Next ⏭, and Random ⇄ buttons skip through the channel schedule; also available in the mini-player and via ← / → arrow keys
- **Stable Broadcast Schedule**: deterministic, epoch-anchored schedule so the same content is always airing at the same time on every reload — just like a real TV channel
- **Comprehensive Content Types**: Libraries, video playlists, music playlists, categories, and collections
- **Media Artwork**: Plex poster integration in program bars and tooltips
- **Program Bars**: Uniform dark background for all bars; currently-airing items highlighted with the theme accent colour — opacity configurable via settings
- **Live Search**: Filter channels and media boxes in real-time from the header search bar
- **Channel Grouping**: Optional grouping of channels by type (Libraries, Video Playlists, Music Playlists, Categories, Collections) with collapsible sections, sorted alphabetically
- **Responsive Design**: Works on desktop and mobile devices
- **Enhanced Tooltips**: Detailed media information with poster artwork on hover
- **Synchronized Scrolling**: Vertical and horizontal scrolling perfectly aligned
- **TV Show Episode Expansion**: Automatically expands TV shows to individual episodes

## Screenshots

### EPG Guide
![EPG guide showing channels, program bars, and a media tooltip](screenshots/epg-guide.jpg)

### Video & Audio Player
https://github.com/user-attachments/assets/ca05939f-9e39-48a5-a2e6-aaf504bdbcf8

### Settings
https://github.com/user-attachments/assets/6796e319-1c27-4f54-a3cc-1fe641f53ac5

## Quick Start
https://github.com/user-attachments/assets/11e11ab0-94a4-4bff-8452-9776a61d5ba6

https://github.com/user-attachments/assets/6a44a4c5-011f-4800-bfb0-a0f8fc032292


### 1. Create your config file

Copy the example config and fill in your Plex details:

```bash
cp config.example.json config.json
```

Then edit `config.json`:

```json
{
  "plexUrl": "http://your-plex-server:32400",
  "plexToken": "your-plex-token-here"
}
```

> **`config.json` is gitignored and never committed.** It is the only file that should contain your Plex URL and token. To find your Plex token, see [Finding your Plex token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/).

### 2. Run the app

**Option A: Docker (Recommended)**

```bash
docker-compose up -d
```

📋 **For detailed Docker setup instructions, see [DOCKER-SETUP.md](DOCKER-SETUP.md)**

**Option B: Node.js**

```bash
npm install
npm start
```

### 3. Access the Interface

Open `http://localhost:3000` in your browser. Your Plex server will be pre-configured from `config.json`. You can also update the URL and token any time via the Settings (⚙️) panel.

## Usage

### EPG Time Scale
- **Drag Handle**: Click and drag the "⟺ Scale" handle on the left of the time bar — drag right to zoom in (15-min slots, taller bars), drag left to zoom out (60-min slots, shorter bars)
- **Settings Method**: Use the "EPG time scale" slider in Settings → Interface Settings
- Scale persists across page reloads (saved to localStorage)

### Content Types
- **Libraries**: Your Plex movie and TV libraries
- **Video Playlists**: Plex video playlists you've created
- **Music Playlists**: Plex music playlists (audio only)
- **Categories**: Genres from your Plex libraries (Action, Comedy, Biography, etc.) — merged across all library sections
- **Collections**: User-created movie/TV collections

### Channel Grouping
- Enabled by default; toggle via **Settings → Interface Settings → Group channels by type**
- Channels are grouped into collapsible bellows: Libraries, Video Playlists, Music Playlists, Categories, Collections
- Click a section header to collapse/expand it; the EPG grid stays in sync
- Channels within each section are sorted alphabetically by default
- **Drag to reorder**: hover a channel to reveal the grip handle (⠿), then drag it to a new position within its bellow — the EPG grid updates instantly and order is remembered across reloads
- Collapsed state is remembered across page reloads

### EPG-Aware Playback Resume
- Clicking a currently-airing media bar automatically seeks to the live broadcast position
- Toggle via **Settings → Playback Settings → Resume from current broadcast position**
- Falls back to last saved position if the setting is off or the program hasn't started yet

### Media Artwork
- Toggle poster display in Settings → Interface Settings
- Posters appear on the left side of program bars
- Enhanced tooltips show larger poster images with detailed info

### Header Controls
- **⇄ Shuffle**: Plays random content from any channel; continues randomly until turned off
- **⇌ Randomize**: Re-shuffles the order of content within channels for a fresh EPG schedule
- **⚙ Settings**: Opens configuration panel for all app settings
- **? Help**: Shows documentation and usage instructions

## Configuration

Use the settings panel (⚙️ button) to configure. The panel is organised into collapsible sections:

- **Server**: Plex URL, authentication token, and connection test
- **Content**: Hours to display; Libraries, Video Playlists, Music Playlists, Categories, and Collections — each list sorted alphabetically with All / None / Invert selection buttons
- **Display**: Theme accent colour, active media bar opacity, EPG time scale, channel grouping, posters, animations, tooltips, **notification position** (top-left, top-right, bottom-left, bottom-right)
- **Playback**: Stable broadcast schedule, broadcast-position resume, position memory, auto-play, notifications, volume
- **Auto-Refresh**: Toggle and interval (30 min, 1 hour, 4 hours default, 8 hours)
- **Advanced**: Content caching, low bandwidth mode, debug logging

### Settings Performance

**Fast Save (< 200ms)**: UI-only changes like notification position, tooltips, animations, playback preferences, and channel grouping apply instantly without reloading content.

**Full Reload (2-5 seconds)**: Only triggered when necessary for server changes (Plex URL/token) or channel selection changes (libraries, playlists, categories, collections).

## Technical Details

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Media Server**: Plex Media Server API integration
- **Video Streaming**: HTML5 video with HLS via hls.js (Chrome/Firefox) and native HLS (Safari); automatic H.264 transcode for MKV/HEVC content
- **Deployment**: Docker & Docker Compose ready
- **Architecture**: Lightweight, stateless, container-friendly

## File Structure

```
stationarr/
├── config.json                # Your Plex URL and token (gitignored — create from example)
├── config.example.json        # Config template — copy to config.json and fill in your details
├── favicon.svg                # App icon (TV play symbol, accent-coloured)
├── index.html                 # Main HTML structure
├── app.js                     # Core application logic
├── style.css                  # Styling and responsive design
├── server.js                  # Express server (serves /api/config to the frontend)
├── package.json               # NPM dependencies and scripts
├── Dockerfile                 # Docker container configuration
├── docker-compose.yml         # Docker Compose setup
├── create-docker-container.ps1 # PowerShell deployment automation script
├── .dockerignore              # Docker build exclusions
├── DOCKER-SETUP.md            # Docker deployment guide
└── README.md                  # This file
```

## Deployment Automation

For advanced users deploying to remote systems, the repository includes `create-docker-container.ps1`, a PowerShell automation script that:

- **Builds and exports** the Docker image to a tar file
- **Manages Docker Desktop** lifecycle (startup, health checks, cleanup)
- **Uploads** the container image to remote systems via SCP
- **Deploys** the container with automatic cleanup of previous versions

This script is particularly useful for deploying to NAS devices or remote Docker hosts where you want a single-command build-and-deploy workflow. It handles the complete cycle from source code to running container on a remote system.

## Development Status

This is an active development project with ongoing improvements:

- ✅ Core EPG functionality
- ✅ Video playback with position memory
- ✅ Settings management
- ✅ Auto-refresh
- ✅ Playlist support (video and music)
- ✅ Collections support
- ✅ Categories as library genres (Biography, Comedy, etc.) merged across sections
- ✅ Media artwork integration
- ✅ Interactive channel resizing
- ✅ Enhanced tooltips with posters
- ✅ TV show episode expansion
- ✅ Live search with clear button
- ✅ Interactive EPG time scale (drag handle + settings slider, persisted)
- ✅ Program bars: uniform dark background; currently-airing bar highlighted with warm yellow accent
- ✅ EPG-aware playback resume (seek to live position on click)
- ✅ Current time indicator aligned to time bar
- ✅ Channel grouping by type with collapsible sections (alphabetically sorted, state persisted)
- ✅ Show-type items auto-resolve to first episode for playback
- ✅ Settings panel redesigned with collapsible accordion sections and All/None/Invert list buttons
- ✅ Modern UI redesign: Plex-inspired dark theme with CSS design tokens, Inter font, refined typography and spacing
- ✅ Program bar styling: uniform dark background for all bars; active/currently-airing bars highlighted with the theme accent colour (opacity configurable in Display settings)
- ✅ Plex session management: unique timestamped session IDs per request and correct cleanup prevent orphaned transcode sessions
- ✅ Playback retry: on seek-related failure (e.g. poor MKV seek index), retries from the beginning with a notification rather than showing an error
- ✅ Browser fullscreen: black backdrop (no grey background)
- ✅ Fetch timeout: all Plex API requests abort after 30 seconds so a slow/unresponsive library cannot hang the entire load
- ✅ Refresh guard: concurrent auto-refresh cycles are prevented; a new refresh is skipped if one is already in progress
- ✅ Auto-refresh interval floor: enforced minimum of 60 seconds prevents a corrupt/zero localStorage value from triggering a continuous reload loop
- ✅ Channel grouping enabled by default: collapsible bellows (Libraries, Playlists, Categories, Collections) are on out of the box; settings migration resets the old false default for existing sessions
- ✅ Drag-to-reorder channels: grip handle appears on hover, drag within a bellow to reposition; order persists to localStorage and EPG grid updates immediately
- ✅ Player navigation: ⏮ Previous, ⏭ Next, ⇄ Random buttons in the player header and mini-player; ← / → arrow keys also work; schedule is cached per channel so navigation is consistent
- ✅ Music playlist audio playback: Plexamp-style modal player with blurred album-art backdrop, centred artwork, track/artist/album info, seek bar with elapsed/total time, ⏮/▶⏸/⏭/⇄ controls, volume slider; minimises to a persistent mini-player; keyboard shortcuts (Space, ←, →, Esc) work when audio player is active
- ✅ Stable broadcast schedule: content order seeded by channel ID and anchored to a fixed epoch so the same title is always airing at the same time regardless of page reload; toggle in Settings → Playback
- ✅ Global shuffle: ⇄ Shuffle button in the header picks a random item from any visible channel and continues randomly after each track ends; highlighted in accent colour when active
- ✅ Content randomization: ⇌ Randomize button re-shuffles media order within channels using deterministic seeding; each click produces different EPG schedule while maintaining stable broadcast timing
- ✅ Concurrent loading: all Plex API fetches (libraries, playlists, genres, collections, TV show expansion) run in parallel — load time is now bounded by the slowest single request rather than the sum of all
- ✅ Loading progress: detailed status throughout every phase (connecting, fetching, expanding TV shows per-title, completing) so the progress bar never appears stuck
- ✅ config.json: Plex URL and token loaded from a gitignored server-side config file — no credentials in source code
- ✅ Smart settings save: UI-only changes (notification position, tooltips, animations, playback preferences) apply instantly without reloading content; full reload only triggered for server/channel changes
- ✅ Favicon: browser tab shows the Stationarr TV play icon, coloured to match the current accent colour dynamically
- ✅ Header logo icon: TV play icon displayed next to the Stationarr title, styled in the accent colour
- ✅ Accent-coloured media bars: active program bars use the theme accent colour instead of a fixed orange; background, border, text, and play chevron all derive from the accent colour automatically

## Contributing

This project is actively developed. Feel free to submit issues and feature requests.

## License

MIT License - see package.json for details.
