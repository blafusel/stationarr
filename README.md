# Plex Stationarr

A modern EPG-style web interface for Plex Media Server that displays your media library in a TV guide format.

## Features

- **EPG-Style Interface**: Browse your media in a familiar TV guide layout
- **Real-time Updates**: Auto-refresh content with configurable intervals
- **Video Playback**: Stream media directly in the browser with position memory
- **Comprehensive Content Types**: Libraries, video playlists, music playlists, categories, and collections
- **Media Artwork**: Plex poster integration in program bars and tooltips
- **Interactive Channel Scaling**: Drag-to-resize channel heights or use settings slider (50%-200%)
- **Responsive Design**: Works on desktop and mobile devices
- **Enhanced Tooltips**: Detailed media information with poster artwork on hover
- **Synchronized Scrolling**: Vertical and horizontal scrolling perfectly aligned
- **TV Show Episode Expansion**: Automatically expands TV shows to individual episodes

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Plex Server**
   - Edit the Plex server URL and token in the settings (⚙️ button)
   - Default: `http://YOUR_PLEX_SERVER:32400` with token `YOUR_PLEX_TOKEN_HERE`

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Access the Interface**
   - Open `http://localhost:3000` in your browser
   - Or access from your network at `http://your-ip:3000`

## Usage

### Channel Resizing
- **Settings Method**: Use the "Channel height scale" slider in Settings → Interface Settings
- **Interactive Method**: Hover over any channel and drag the golden resize handle at the bottom

### Content Types
- **Libraries**: Your Plex movie and TV libraries
- **Video Playlists**: Plex video playlists you've created
- **Music Playlists**: Plex music playlists (audio only)
- **Categories**: Plex recommendation hubs (trending, recently added, etc.)
- **Collections**: User-created movie/TV collections

### Media Artwork
- Toggle poster display in Settings → Interface Settings
- Posters appear on the left side of program bars
- Enhanced tooltips show larger poster images with detailed info

## Configuration

Use the settings panel (⚙️ button) to configure:

- **Plex Server**: URL and authentication token
- **Content Selection**: Libraries, video playlists, music playlists, categories, and collections
- **Display Options**: Time range (6, 12, or 24 hours)
- **Interface Settings**: 
  - Tooltips with configurable delay
  - Channel height scaling (50%-200%)
  - Poster artwork display toggle
  - Animations and visual effects
- **Playback Settings**: Auto-play, volume, position memory, notifications
- **Auto-refresh**: Automatic content updates with configurable intervals
- **Advanced Options**: Debug logging, content caching, low bandwidth mode

## Technical Details

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Media Server**: Plex Media Server API integration
- **Video Streaming**: HTML5 video with HLS support

## File Structure

```
plex-stationarr/
├── index.html          # Main HTML structure
├── app.js              # Core application logic
├── style.css           # Styling and responsive design
├── server.js           # Express server
├── package.json        # NPM dependencies and scripts
└── README.md           # This file
```

## Development Status

This is an active development project with ongoing improvements:

- ✅ Core EPG functionality
- ✅ Video playback with position memory
- ✅ Settings management
- ✅ Auto-refresh
- ✅ Playlist support (video and music)
- ✅ Collections and Categories support
- ✅ Media artwork integration
- ✅ Interactive channel resizing
- ✅ Enhanced tooltips with posters
- ✅ TV show episode expansion
- 🔄 Current time indicator (in progress)
- 📋 Future: Advanced filtering, search functionality

## Contributing

This project is actively developed. Feel free to submit issues and feature requests.

## License

MIT License - see package.json for details.