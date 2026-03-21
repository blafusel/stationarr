const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Load config.json if present (gitignored — contains Plex URL and token)
let serverConfig = {};
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
    try {
        serverConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.warn('⚠️  config.json found but could not be parsed:', e.message);
    }
} else {
    console.warn('⚠️  No config.json found. Copy config.example.json to config.json and fill in your Plex details.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Expose non-sensitive config fields to the frontend.
// Only plexUrl and plexToken are passed — never expose other server internals.
app.get('/api/config', (req, res) => {
    res.json({
        plexUrl: serverConfig.plexUrl || '',
        plexToken: serverConfig.plexToken || '',
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Stationarr running on http://localhost:${PORT}`);
    console.log(`📺 Access from your network at http://<your-ip>:${PORT}`);
    if (serverConfig.plexUrl) {
        console.log(`⚙️  Configured for Plex server: ${serverConfig.plexUrl}`);
    } else {
        console.log(`⚙️  No Plex server configured — set plexUrl in config.json`);
    }
});
