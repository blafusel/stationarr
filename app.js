class PlexStationarr {
    constructor() {
        // Config loaded async in init() — start with empty defaults
        this.config = this.loadSettings();
        
        // Cache frequently accessed DOM elements for performance
        this.domCache = {};
        this.initDOMCache();

        // Available content and channels
        this.availableLibraries = [];
        this.availablePlaylists = [];
        this.availableVideoPlaylists = [];
        this.availableMusicPlaylists = [];
        this.availableCategories = [];
        this.availableCollections = [];
        
        this.channels = [];
        this.currentTime = new Date();
        this.timeSlots = [];
        this.selectedChannel = null;
        this.videoPlayer = null;
        this.isMinimized = false;
        this.tooltipTimer = null;
        this.currentTooltip = null;
        this.autoRefreshTimer = null;
        this.episodeCache = new Map(); // Cache for expanded episodes
        this.loadingProgress = {
            current: 0,
            total: 0,
            step: ''
        };
        this.epgScale = this.config.ui.epgScale ?? 1.0;
        try {
            const saved = localStorage.getItem('plexStationarrCollapsedGroups');
            this.collapsedGroups = new Set(saved ? JSON.parse(saved) : []);
        } catch {
            this.collapsedGroups = new Set();
        }

        try {
            const saved = localStorage.getItem('plexStationarrChannelOrder');
            this.channelOrder = saved ? JSON.parse(saved) : {};
        } catch {
            this.channelOrder = {};
        }

        try {
            const saved = localStorage.getItem('plexStationarrGroupOrder');
            this.groupOrder = saved ? JSON.parse(saved) : ['library', 'video-playlist', 'music-playlist', 'category', 'collection'];
        } catch {
            this.groupOrder = ['library', 'video-playlist', 'music-playlist', 'category', 'collection'];
        }

        this.currentChannel = null;
        this.currentProgramIndex = -1;
        this.programScheduleCache = {}; // channelId → program[]
        this.globalShuffle = false;
        this.audioElement = null;
        this.currentAudioItem = null;
        this.isAudioMinimized = false;

        this.init();
    }

    initDOMCache() {
        // Cache frequently accessed DOM elements to avoid repeated queries
        // This is called after DOM is ready
        this.domCache = {
            // Main containers
            channelsList: () => document.getElementById('channelsList'),
            epgContainer: () => document.getElementById('epgContainer'),
            programGrid: () => document.getElementById('programGrid'),
            timelineHeader: () => document.getElementById('timelineHeader'),
            
            // Modals
            configModal: () => document.getElementById('configModal'),
            videoPlayerModal: () => document.getElementById('videoPlayerModal'),
            audioPlayerModal: () => document.getElementById('audioPlayerModal'),
            helpModal: () => document.getElementById('helpModal'),
            
            // Buttons
            globalShuffleBtn: () => document.getElementById('globalShuffleBtn'),
            randomizeBtn: () => document.getElementById('randomizeBtn'),
            
            // Context menu
            channelContextMenu: () => document.getElementById('channelContextMenu'),
            
            // Search
            searchInput: () => document.getElementById('searchInput'),
            searchClear: () => document.getElementById('searchClear')
        };
    }
    
    getElement(key) {
        // Get cached element or query and cache it
        if (!this.domCache[key + '_cached']) {
            this.domCache[key + '_cached'] = this.domCache[key]();
        }
        return this.domCache[key + '_cached'];
    }

    loadSettings() {
        const defaultSettings = {
            plexUrl: '',
            plexToken: '',
            timeRange: 12,
            contentTypes: {
                libraries: true,    // Default enabled
                playlists: false,
                videoPlaylists: true,  // Auto-enabled
                musicPlaylists: true,  // Auto-enabled
                categories: true,      // Auto-enabled (when available)
                collections: true      // Auto-enabled (when available)
            },
            selectedLibraries: new Set(),
            selectedPlaylists: new Set(),
            selectedVideoPlaylists: new Set(),
            selectedMusicPlaylists: new Set(),
            selectedCategories: new Set(),
            selectedCollections: new Set(),
            visibleChannels: new Set(),
            // Common App Settings
            ui: {
                enableTooltips: true,
                tooltipDelay: 1000,
                autoRefresh: true,
                autoRefreshInterval: 14400, // seconds (4 hours)
                showProgramDetails: true,
                compactView: false,
                enableAnimations: true,
                showPosters: true,
                epgScale: 1.0,           // Scale factor for EPG time zoom (0.3 - 3.0)
                accentColor: '#2db84d',
                mediaBarOpacity: 0.12,
                groupChannelsByType: true,
                notificationPosition: 'bottom-right'  // top-left, top-right, bottom-left, bottom-right
            },
            playback: {
                autoPlay: false,
                defaultVolume: 80,
                rememberPosition: true,
                showPlaybackNotifications: true,
                resumeFromCurrentPosition: true,
                stableBroadcastSchedule: true
            },
            advanced: {
                enableDebugLogging: false,
                cacheContent: true,
                preloadNextProgram: false,
                lowBandwidthMode: false
            }
        };

        try {
            const saved = localStorage.getItem('plexStationarrSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Convert arrays back to Sets
                parsed.selectedLibraries = new Set(parsed.selectedLibraries || []);
                parsed.selectedPlaylists = new Set(parsed.selectedPlaylists || []);
                parsed.selectedVideoPlaylists = new Set(parsed.selectedVideoPlaylists || []);
                parsed.selectedMusicPlaylists = new Set(parsed.selectedMusicPlaylists || []);
                parsed.selectedCategories = new Set(parsed.selectedCategories || []);
                parsed.selectedCollections = new Set(parsed.selectedCollections || []);
                parsed.visibleChannels = new Set(parsed.visibleChannels || []);
                
                // Merge nested objects properly
                const merged = { ...defaultSettings, ...parsed };
                if (parsed.ui) merged.ui = { ...defaultSettings.ui, ...parsed.ui };
                if (parsed.playback) merged.playback = { ...defaultSettings.playback, ...parsed.playback };
                if (parsed.advanced) merged.advanced = { ...defaultSettings.advanced, ...parsed.advanced };
                if (parsed.contentTypes) merged.contentTypes = { ...defaultSettings.contentTypes, ...parsed.contentTypes };

                // Migration: if saved settings pre-date groupChannelsByType defaulting to true,
                // the stored false was the old default — reset it so channels are grouped by default.
                if (!parsed.settingsVersion || parsed.settingsVersion < 2) {
                    if (merged.ui.groupChannelsByType === false) {
                        merged.ui.groupChannelsByType = true;
                    }
                    merged.settingsVersion = 2;
                }

                return merged;
            }
        } catch (error) {
            console.warn('Error loading settings:', error);
        }

        return defaultSettings;
    }

    saveSettings() {
        try {
            const settingsToSave = {
                ...this.config,
                settingsVersion: 2,
                // Convert Sets to arrays for JSON serialization
                selectedLibraries: Array.from(this.config.selectedLibraries),
                selectedPlaylists: Array.from(this.config.selectedPlaylists),
                selectedVideoPlaylists: Array.from(this.config.selectedVideoPlaylists),
                selectedMusicPlaylists: Array.from(this.config.selectedMusicPlaylists),
                selectedCategories: Array.from(this.config.selectedCategories),
                selectedCollections: Array.from(this.config.selectedCollections),
                visibleChannels: Array.from(this.config.visibleChannels)
            };
            
            localStorage.setItem('plexStationarrSettings', JSON.stringify(settingsToSave));
            console.log('Settings saved:', settingsToSave);
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    async init() {
        console.log('=== INITIALIZING PLEX STATIONARR ===');

        // Apply persisted accent color immediately
        this.applyAccentColor(this.config.ui.accentColor);

        // Fetch server-side config (config.json via /api/config) and apply as
        // defaults only when the user hasn't already saved their own values.
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const serverCfg = await res.json();
                if (serverCfg.plexUrl && !this.config.plexUrl) {
                    this.config.plexUrl = serverCfg.plexUrl;
                }
                if (serverCfg.plexToken && !this.config.plexToken) {
                    this.config.plexToken = serverCfg.plexToken;
                }
            }
        } catch (e) {
            console.warn('Could not load /api/config — using localStorage settings only.');
        }

        this.showProgress('Initializing application...');

        this.setupEventListeners();
        this.startClock();
        
        // First, discover what's available on the Plex server
        this.showProgress('Discovering available content...');
        await this.discoverAvailableContent();
        
        // Then load only the selected content
        this.showProgress('Loading selected channels...');
        await this.loadSelectedChannels();
        
        this.showProgress('Setting up timeline and EPG...');
        this.generateTimeSlots();
        this.renderChannels();
        this.renderEPG();
        this.updateCurrentTimeLine();
        
        // Start auto-refresh if enabled
        this.showProgress('Finalizing setup...');
        this.setupAutoRefresh();
        
        // Hide progress bar after a short delay to show completion
        setTimeout(() => {
            this.hideProgress();
        }, 500);
        
        console.log('=== INITIALIZATION COMPLETE ===');
    }

    setupEventListeners() {
        const configBtn = document.getElementById('configBtn');
        const configModal = document.getElementById('configModal');
        const closeModal = document.getElementById('closeModal');
        const saveConfig = document.getElementById('saveConfig');
        const cancelConfig = document.getElementById('cancelConfig');
        const testPlexConnection = document.getElementById('testPlexConnection');

        this.setupEpgScaleHandle();

        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClear');

        // Debounced search for better performance
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            searchClear.style.display = e.target.value ? 'block' : 'none';
            
            // Debounce search to avoid excessive filtering on every keystroke
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.filterBySearch(e.target.value.trim().toLowerCase());
            }, 150);
        });

        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            this.filterBySearch('');
            searchInput.focus();
        });

        document.getElementById('globalShuffleBtn').addEventListener('click', () => this.toggleGlobalShuffle());
        document.getElementById('randomizeBtn').addEventListener('click', () => this.randomizeChannelContent());

        // Help modal
        const helpModal = document.getElementById('helpModal');
        document.getElementById('helpBtn').addEventListener('click', () => helpModal.classList.add('show'));
        document.getElementById('closeHelpModal').addEventListener('click', () => helpModal.classList.remove('show'));
        document.getElementById('closeHelpBtn').addEventListener('click', () => helpModal.classList.remove('show'));
        helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.remove('show'); });

        configBtn.addEventListener('click', () => this.openConfigModal());
        closeModal.addEventListener('click', () => this.closeConfigModal());
        saveConfig.addEventListener('click', () => this.saveConfiguration());
        cancelConfig.addEventListener('click', () => this.closeConfigModal());
        testPlexConnection.addEventListener('click', () => this.testPlexConnectionManual());

        // Accordion toggle
        configModal.addEventListener('click', (e) => {
            const header = e.target.closest('.acc-header');
            if (header) {
                header.closest('.acc-item').classList.toggle('open');
            }
        });

        // All / None / Invert buttons for content lists
        configModal.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-tiny');
            if (!btn) return;
            if (btn.dataset.selectInvert) {
                const list = document.getElementById(btn.dataset.selectInvert);
                if (list) list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = !cb.checked);
                return;
            }
            const listId = btn.dataset.selectAll || btn.dataset.selectNone;
            const checked = !!btn.dataset.selectAll;
            const list = document.getElementById(listId);
            if (list) list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
        });

        configModal.addEventListener('click', (e) => {
            if (e.target === configModal) {
                this.closeConfigModal();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && configModal.classList.contains('show')) {
                this.closeConfigModal();
            }
        });

        // Video player event listeners
        this.setupVideoPlayerListeners();

        // Context menu event listeners
        this.setupContextMenuListeners();

        // Audio player event listeners
        this.setupAudioPlayerListeners();

        // Scrolling synchronization
        this.setupScrollSync();
    }

    setupVideoPlayerListeners() {
        const videoModal = document.getElementById('videoPlayerModal');
        const closePlayer = document.getElementById('closePlayer');
        const minimizePlayer = document.getElementById('minimizePlayer');
        const minimizedPlayer = document.getElementById('minimizedPlayer');
        const restorePlayer = document.getElementById('restorePlayer');
        const closeMiniPlayer = document.getElementById('closeMiniPlayer');
        const miniPlayPause = document.getElementById('miniPlayPause');

        closePlayer.addEventListener('click', () => this.closeVideoPlayer());
        minimizePlayer.addEventListener('click', () => this.minimizeVideoPlayer());
        document.getElementById('prevProgram').addEventListener('click', () => this.playPrevious());
        document.getElementById('nextProgram').addEventListener('click', () => this.playNext());
        document.getElementById('randomProgram').addEventListener('click', () => this.playRandom());
        document.getElementById('miniPrev').addEventListener('click', () => this.playPrevious());
        document.getElementById('miniNext').addEventListener('click', () => this.playNext());

        document.getElementById('theatreModeBtn').addEventListener('click', () => {
            const container = document.querySelector('.video-player-container');
            const btn = document.getElementById('theatreModeBtn');
            const isTheatre = container.classList.toggle('theatre-mode');
            btn.classList.toggle('active', isTheatre);
            btn.title = isTheatre ? 'Exit theatre mode' : 'Fill browser window';
            if (isTheatre) {
                this.startTheatreMouseTimer(container);
            } else {
                this.stopTheatreMouseTimer(container);
            }
        });
        restorePlayer.addEventListener('click', () => this.restoreVideoPlayer());
        closeMiniPlayer.addEventListener('click', () => this.closeVideoPlayer());
        miniPlayPause.addEventListener('click', () => this.toggleMiniPlayback());

        videoModal.addEventListener('click', (e) => {
            if (e.target === videoModal) {
                this.minimizeVideoPlayer();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && videoModal.classList.contains('show')) {
                this.minimizeVideoPlayer();
            }
            if (e.key === ' ' && this.videoPlayer) {
                e.preventDefault();
                this.togglePlayback();
            }
            if (e.key === 'ArrowRight' && videoModal.classList.contains('show')) {
                e.preventDefault();
                this.playNext();
            }
            if (e.key === 'ArrowLeft' && videoModal.classList.contains('show')) {
                e.preventDefault();
                this.playPrevious();
            }
        });
    }

    setupContextMenuListeners() {
        const contextMenu = document.getElementById('channelContextMenu');
        
        // Handle context menu item clicks
        contextMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.context-menu-item');
            if (!item) return;
            
            const action = item.dataset.action;
            const channelId = contextMenu.dataset.channelId;
            const channelType = contextMenu.dataset.channelType;
            
            if (action === 'remove' && channelId && channelType) {
                this.removeChannel(channelId, channelType);
            }
        });
        
        // Hide context menu when clicking outside or on escape
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                contextMenu.style.display = 'none';
            }
        });
    }

    setupScrollSync() {
        const epgContainer = document.getElementById('epgContainer');
        const timelineHeader = document.getElementById('timelineHeader');
        const channelsList = document.getElementById('channelsList');
        
        // Sync horizontal scroll with timeline header
        epgContainer.addEventListener('scroll', (e) => {
            timelineHeader.scrollLeft = e.target.scrollLeft;
            
            // Sync vertical scroll with channels list (without triggering the other listener)
            if (channelsList.scrollTop !== e.target.scrollTop) {
                channelsList.scrollTop = e.target.scrollTop;
            }
        });
        
        // Sync vertical scroll from channels list to EPG container
        channelsList.addEventListener('scroll', (e) => {
            if (epgContainer.scrollTop !== e.target.scrollTop) {
                epgContainer.scrollTop = e.target.scrollTop;
            }
        });
    }

    startClock() {
        // Update current time for EPG calculation but don't display clock
        this.updateClock();
        setInterval(() => {
            this.updateClock();
            this.updateCurrentTimeLine();
        }, 1000);
    }

    updateClock() {
        this.currentTime = new Date();
        // Clock display removed - only update time for EPG calculations
    }

    async discoverAvailableContent() {
        console.log('=== DISCOVERING AVAILABLE CONTENT ===');

        try {
            this.showProgress('Connecting to Plex server...');
            await this.testPlexConnection();

            // Fetch libraries and playlists concurrently
            this.showProgress('Fetching libraries and playlists...');
            const [sectionsResult, playlistsResult] = await Promise.allSettled([
                this.fetchPlexData('/library/sections'),
                this.fetchPlexData('/playlists')
            ]);

            // Process libraries
            this.availableLibraries = sectionsResult.status === 'fulfilled'
                ? (sectionsResult.value.MediaContainer.Directory || [])
                    .filter(s => s.type === 'movie' || s.type === 'show')
                    .map(s => ({ key: s.key, title: s.title, type: s.type, id: `library_${s.key}` }))
                : [];
            console.log('Available libraries:', this.availableLibraries.length);

            // Process playlists
            if (playlistsResult.status === 'fulfilled') {
                const allPlaylists = (playlistsResult.value.MediaContainer.Metadata || []).map(p => ({
                    ratingKey: p.ratingKey, title: p.title,
                    id: `playlist_${p.ratingKey}`,
                    playlistType: p.playlistType || 'unknown',
                    type: p.type || 'unknown'
                }));
                this.availableVideoPlaylists = allPlaylists
                    .filter(p => p.playlistType === 'video' || p.type === 'video' || p.playlistType === 'photo' || p.type === 'photo')
                    .map(p => ({ ...p, id: `video_playlist_${p.ratingKey}` }));
                this.availableMusicPlaylists = allPlaylists
                    .filter(p => p.playlistType === 'audio' || p.type === 'audio')
                    .map(p => ({ ...p, id: `music_playlist_${p.ratingKey}` }));
                this.availablePlaylists = allPlaylists;
                console.log('Playlists:', allPlaylists.length, '(video:', this.availableVideoPlaylists.length, ', music:', this.availableMusicPlaylists.length, ')');
            } else {
                console.warn('Could not discover playlists:', playlistsResult.reason);
                this.availablePlaylists = [];
                this.availableVideoPlaylists = [];
                this.availableMusicPlaylists = [];
            }

            // Fetch genres and collections from all libraries concurrently
            this.showProgress('Discovering genres and collections...');
            const [genreResults, collectionResults] = await Promise.all([
                Promise.allSettled(this.availableLibraries.map(lib =>
                    this.fetchPlexData(`/library/sections/${lib.key}/genre`)
                        .then(data => ({ lib, genres: data.MediaContainer.Directory || [] }))
                )),
                Promise.allSettled(this.availableLibraries.map(lib =>
                    this.fetchPlexData(`/library/sections/${lib.key}/collections`)
                        .then(data => ({ lib, collections: data.MediaContainer.Metadata || [] }))
                ))
            ]);

            // Process genres into categories
            const genreMap = new Map();
            genreResults.forEach(result => {
                if (result.status !== 'fulfilled') return;
                const { lib, genres } = result.value;
                genres.forEach(genre => {
                    if (!genreMap.has(genre.title)) genreMap.set(genre.title, []);
                    genreMap.get(genre.title).push(`/library/sections/${lib.key}/all?genre=${encodeURIComponent(genre.key)}`);
                });
            });
            this.availableCategories = [...genreMap.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([title, keys]) => ({ title, keys, id: `genre_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}` }));
            console.log('Available categories (genres):', this.availableCategories.length);

            // Process collections
            const allCollections = [];
            collectionResults.forEach(result => {
                if (result.status !== 'fulfilled') return;
                const { lib, collections } = result.value;
                collections.forEach(c => allCollections.push({
                    key: c.ratingKey, title: c.title,
                    type: c.type || 'collection',
                    libraryKey: lib.key, libraryTitle: lib.title,
                    id: `collection_${c.ratingKey}`
                }));
            });
            this.availableCollections = allCollections;
            console.log('Available collections:', this.availableCollections.length);

            // Auto-select all libraries on first run if nothing is selected
            if (this.config.selectedLibraries.size === 0 && this.availableLibraries.length > 0) {
                console.log('First run: auto-selecting all libraries');
                this.config.selectedLibraries = new Set(this.availableLibraries.map(lib => lib.id));
                this.saveSettings();
            }

        } catch (error) {
            console.error('Error discovering content:', error);
            this.showPlexConnectionError(error.message);
        }
    }

    async expandTVShowsToEpisodes(mediaItems, libraryName = 'Library', onProgress = null) {
        const expandedContent = [];
        const tvShows = mediaItems.filter(item => item.type === 'show');
        const otherContent = mediaItems.filter(item => item.type !== 'show');

        expandedContent.push(...otherContent);

        if (tvShows.length === 0) {
            return expandedContent;
        }

        console.log(`Expanding ${tvShows.length} TV shows concurrently...`);

        // Process all TV shows concurrently for speed
        const showPromises = tvShows.map(async (item, index) => {
            try {
                // Check cache first
                const cacheKey = `show_${item.ratingKey}`;
                if (this.episodeCache.has(cacheKey)) {
                    console.log(`Using cached episodes for TV show: ${item.title}`);
                    return this.episodeCache.get(cacheKey);
                }

                if (onProgress) onProgress(`Expanding ${item.title}…`);
                console.log(`Expanding TV show: ${item.title}`);
                
                // Get all seasons
                const seasonsData = await this.fetchPlexData(`/library/metadata/${item.ratingKey}/children`);
                if (!seasonsData.MediaContainer.Metadata) {
                    return [item]; // Keep show as-is if no seasons
                }
                
                // Limit to first 3 seasons for faster loading
                const seasons = seasonsData.MediaContainer.Metadata.slice(0, 3);
                
                // Get episodes from all seasons concurrently
                const episodePromises = seasons.map(async (season) => {
                    try {
                        const episodesData = await this.fetchPlexData(`/library/metadata/${season.ratingKey}/children`);
                        if (episodesData.MediaContainer.Metadata) {
                            // Limit to first 10 episodes per season for performance
                            return episodesData.MediaContainer.Metadata.slice(0, 10).map(episode => {
                                // Use the cleanest available episode title (not filename)
                                const cleanTitle = episode.title || episode.titleSort || episode.originalTitle || 'Unknown Episode';
                                
                                return {
                                    ...episode,
                                    // Override title with the cleanest version
                                    title: cleanTitle,
                                    // Add show and season info for display - use multiple sources for robustness
                                    showTitle: item.title,
                                    seasonTitle: season.title,
                                    seasonIndex: season.index || season.seasonNumber || season.parentIndex || '?',
                                    episodeIndex: episode.index || episode.episodeNumber || '?',
                                    displayTitle: `${item.title} - ${season.title} Ep${episode.index || '?'}: ${cleanTitle}`,
                                    originalShowData: item,
                                    // Also set Plex standard fields as backup
                                    grandparentTitle: item.title,  // Standard Plex field for show
                                    parentTitle: season.title,     // Standard Plex field for season
                                    parentIndex: season.index || season.seasonNumber || '?',
                                    type: 'episode'  // Ensure type is set
                                };
                            });
                        }
                        return [];
                    } catch (error) {
                        console.warn(`Failed to load episodes for season ${season.title}:`, error);
                        return [];
                    }
                });
                
                // Wait for all episodes from this show
                const allEpisodes = await Promise.all(episodePromises);
                const episodes = allEpisodes.flat();
                
                // Cache the result
                this.episodeCache.set(cacheKey, episodes);
                console.log(`Cached ${episodes.length} episodes for ${item.title}`);
                
                return episodes;
                
            } catch (error) {
                console.warn(`Failed to expand TV show ${item.title}:`, error);
                return [item]; // Keep show as-is if expansion fails
            }
        });
        
        // Wait for all shows to be processed
        const allShowEpisodes = await Promise.all(showPromises);
        const episodes = allShowEpisodes.flat();
        
        expandedContent.push(...episodes);
        
        console.log(`Expanded ${mediaItems.length} items to ${expandedContent.length} items (${episodes.length} episodes from ${tvShows.length} shows)`);
        return expandedContent;
    }

    showProgress(step, current = 0, total = 0) {
        this.loadingProgress.step = step;
        this.loadingProgress.current = current;
        this.loadingProgress.total = total;
        
        const progressElement = document.getElementById('loadingProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (!progressElement) return;
        
        progressElement.classList.remove('hidden');
        progressText.textContent = step;
        
        if (total > 0) {
            const percentage = (current / total) * 100;
            progressFill.style.width = `${percentage}%`;
        } else {
            // Indeterminate progress
            progressFill.style.width = '30%';
        }
    }

    updateProgress(current, total) {
        this.loadingProgress.current = current;
        this.loadingProgress.total = total;
        
        const progressFill = document.getElementById('progressFill');
        if (progressFill && total > 0) {
            const percentage = (current / total) * 100;
            progressFill.style.width = `${percentage}%`;
        }
    }

    hideProgress() {
        const progressElement = document.getElementById('loadingProgress');
        if (progressElement) {
            progressElement.classList.add('hidden');
        }
    }

    clearEpisodeCache() {
        this.episodeCache.clear();
        this.programScheduleCache = {};
        console.log('Episode cache cleared');
    }

    async loadSelectedChannels(showProgress = true) {
        console.log('=== LOADING SELECTED CHANNELS ===');

        let totalItems = 0;
        if (this.config.contentTypes.libraries)    totalItems += this.availableLibraries.filter(l => this.config.selectedLibraries.has(l.id)).length;
        if (this.config.contentTypes.videoPlaylists) totalItems += this.availableVideoPlaylists.filter(p => this.config.selectedVideoPlaylists.has(p.id)).length;
        if (this.config.contentTypes.musicPlaylists) totalItems += this.availableMusicPlaylists.filter(p => this.config.selectedMusicPlaylists.has(p.id)).length;
        if (this.config.contentTypes.categories)   totalItems += this.availableCategories.filter(c => this.config.selectedCategories.has(c.id)).length;
        if (this.config.contentTypes.collections)  totalItems += this.availableCollections.filter(c => this.config.selectedCollections.has(c.id)).length;

        if (totalItems === 0) {
            console.log('No content selected, returning empty channels');
            this.channels = [];
            return this.channels;
        }

        let completed = 0;
        // Progress fires on COMPLETION so the bar advances as channels finish,
        // not at start (which would jump instantly then go silent).
        const progress = (label) => { if (showProgress) this.showProgress(label, ++completed, totalItems); };
        // Label-only update with no counter increment — used mid-operation (e.g. TV expansion)
        const status = (label) => { if (showProgress) this.showProgress(label, completed, totalItems); };

        try {
            // All five content groups load concurrently; within each group all items load concurrently.
            // Promise.all preserves insertion order so channel order stays stable.
            const [libraryChannels, videoChannels, musicChannels, categoryChannels, collectionChannels] = await Promise.all([

                // Libraries
                this.config.contentTypes.libraries
                    ? Promise.all(this.availableLibraries
                        .filter(lib => this.config.selectedLibraries.has(lib.id))
                        .map(async lib => {
                            try {
                                status(`Fetching ${lib.title}…`);
                                const data = await this.fetchPlexData(`/library/sections/${lib.key}/all`);
                                if (!data.MediaContainer.Metadata) { progress(`Loaded ${lib.title}`); return null; }
                                const onExp = (msg) => status(msg);
                                const content = await this.expandTVShowsToEpisodes(data.MediaContainer.Metadata, lib.title, onExp);
                                progress(`Loaded ${lib.title}`);
                                return { id: lib.id, name: lib.title, type: 'library', logo: this.getChannelLogo(lib.title), content: content.slice(0, 50) };
                            } catch (e) { console.warn(`Failed to load library ${lib.title}:`, e); progress(`Failed ${lib.title}`); return null; }
                        }))
                    : Promise.resolve([]),

                // Video playlists
                this.config.contentTypes.videoPlaylists
                    ? Promise.all(this.availableVideoPlaylists
                        .filter(pl => this.config.selectedVideoPlaylists.has(pl.id))
                        .map(async pl => {
                            try {
                                status(`Fetching ${pl.title}…`);
                                const data = await this.fetchPlexData(`/playlists/${pl.ratingKey}/items`);
                                progress(`Loaded ${pl.title}`);
                                return { id: pl.id, name: `${pl.title} (Video)`, type: 'video-playlist', logo: this.getChannelLogo(pl.title), content: data.MediaContainer.Metadata || [] };
                            } catch (e) { console.warn(`Failed to load playlist ${pl.title}:`, e); progress(`Failed ${pl.title}`); return null; }
                        }))
                    : Promise.resolve([]),

                // Music playlists
                this.config.contentTypes.musicPlaylists
                    ? Promise.all(this.availableMusicPlaylists
                        .filter(pl => this.config.selectedMusicPlaylists.has(pl.id))
                        .map(async pl => {
                            try {
                                status(`Fetching ${pl.title}…`);
                                const data = await this.fetchPlexData(`/playlists/${pl.ratingKey}/items`);
                                progress(`Loaded ${pl.title}`);
                                return { id: pl.id, name: `${pl.title} (Music)`, type: 'music-playlist', logo: this.getChannelLogo(pl.title), content: data.MediaContainer.Metadata || [] };
                            } catch (e) { console.warn(`Failed to load playlist ${pl.title}:`, e); progress(`Failed ${pl.title}`); return null; }
                        }))
                    : Promise.resolve([]),

                // Categories — inner keys also fetched concurrently
                this.config.contentTypes.categories
                    ? Promise.all(this.availableCategories
                        .filter(cat => this.config.selectedCategories.has(cat.id))
                        .map(async cat => {
                            try {
                                status(`Fetching ${cat.title}…`);
                                const keyResults = await Promise.allSettled(
                                    (cat.keys || [cat.key]).map(k => this.fetchPlexData(k))
                                );
                                const content = keyResults
                                    .filter(r => r.status === 'fulfilled')
                                    .flatMap(r => r.value.MediaContainer.Metadata || []);
                                progress(`Loaded ${cat.title}`);
                                return { id: cat.id, name: cat.title, type: 'category', logo: this.getChannelLogo(cat.title), content: content.slice(0, 20) };
                            } catch (e) { console.warn(`Failed to load category ${cat.title}:`, e); progress(`Failed ${cat.title}`); return null; }
                        }))
                    : Promise.resolve([]),

                // Collections
                this.config.contentTypes.collections
                    ? Promise.all(this.availableCollections
                        .filter(col => this.config.selectedCollections.has(col.id))
                        .map(async col => {
                            try {
                                status(`Fetching ${col.title}…`);
                                const data = await this.fetchPlexData(`/library/collections/${col.key}/items`);
                                const onExp = (msg) => status(msg);
                                const content = await this.expandTVShowsToEpisodes(data.MediaContainer.Metadata || [], `${col.title} Collection`, onExp);
                                progress(`Loaded ${col.title}`);
                                return { id: col.id, name: `${col.title} (${col.libraryTitle})`, type: 'collection', logo: this.getChannelLogo(col.title), content: content.slice(0, 30) };
                            } catch (e) { console.warn(`Failed to load collection ${col.title}:`, e); progress(`Failed ${col.title}`); return null; }
                        }))
                    : Promise.resolve([]),
            ]);

            const channels = [...libraryChannels, ...videoChannels, ...musicChannels, ...categoryChannels, ...collectionChannels]
                .filter(Boolean);

            console.log('=== CHANNELS LOADED ===', channels.length, 'channels');
            this.channels = channels;
            this.config.visibleChannels = new Set(channels.map(c => c.id));

        } catch (error) {
            console.error('Error loading selected channels:', error);
            this.channels = [];
        }
    }

    generateMockChannels() {
        return [
            {
                id: 'mock_movies',
                name: 'Movies',
                type: 'library',
                logo: 'M',
                content: this.generateMockContent('movie')
            },
            {
                id: 'mock_tv',
                name: 'TV Shows',
                type: 'library',
                logo: 'TV',
                content: this.generateMockContent('show')
            },
            {
                id: 'mock_playlist',
                name: 'Favorites',
                type: 'playlist',
                logo: 'F',
                content: this.generateMockContent('mixed')
            }
        ];
    }

    generateMockContent(type) {
        const movieData = [
            { title: 'The Matrix', duration: 136, year: 1999 },
            { title: 'Inception', duration: 148, year: 2010 },
            { title: 'Interstellar', duration: 169, year: 2014 },
            { title: 'Blade Runner 2049', duration: 164, year: 2017 },
            { title: 'Dune', duration: 155, year: 2021 }
        ];
        
        const showData = [
            { title: 'Breaking Bad S1E1', duration: 47, year: 2008 },
            { title: 'The Office S2E3', duration: 22, year: 2006 },
            { title: 'Stranger Things S1E1', duration: 51, year: 2016 },
            { title: 'Game of Thrones S1E1', duration: 62, year: 2011 },
            { title: 'The Mandalorian S1E1', duration: 39, year: 2019 }
        ];
        
        let data;
        if (type === 'movie') {
            data = movieData;
        } else if (type === 'show') {
            data = showData;
        } else {
            data = [...movieData, ...showData];
        }
        
        return data.map((item, index) => ({
            title: item.title,
            duration: item.duration,
            year: item.year,
            type: type === 'mixed' ? (movieData.includes(item) ? 'movie' : 'show') : type,
            summary: `A ${type === 'movie' ? 'movie' : 'TV episode'} about ${item.title.split(' ')[0].toLowerCase()}.`
        }));
    }

    async testPlexConnection() {
        try {
            console.log('=== TESTING PLEX CONNECTION ===');
            console.log('Plex URL:', this.config.plexUrl);
            console.log('Plex Token:', this.config.plexToken ? 'Present' : 'Missing');
            
            const testUrl = `${this.config.plexUrl}/?X-Plex-Token=${this.config.plexToken}`;
            console.log('Test URL:', testUrl);
            
            const response = await fetch(testUrl, {
                headers: {
                    'Accept': 'application/json',
                    'X-Plex-Client-Identifier': 'stationarr',
                    'X-Plex-Product': 'Stationarr',
                    'X-Plex-Version': '1.0.0',
                    'X-Plex-Platform': 'Web'
                }
            });
            
            console.log('Response status:', response.status);
            console.log('Response Content-Type:', response.headers.get('content-type'));
            
            if (!response.ok) {
                throw new Error(`Plex server returned ${response.status}: ${response.statusText}. Check if server is accessible at ${this.config.plexUrl}`);
            }
            
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                // Handle XML response
                const xmlText = await response.text();
                console.log('Got XML response, parsing...');
                data = this.parseXMLToJSON(xmlText);
            }
            
            console.log('Plex connection successful!');
            console.log('Server name:', data.MediaContainer?.friendlyName || 'Unknown Server');
            console.log('Server version:', data.MediaContainer?.version || 'Unknown');
            return true;
        } catch (error) {
            console.error('Plex connection test failed:', error);
            
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error(`Cannot reach Plex server at ${this.config.plexUrl}. Check network connection and server address.`);
            }
            
            throw new Error(`Plex connection failed: ${error.message}`);
        }
    }

    showPlexConnectionError(message) {
        console.error('Plex Connection Error:', message);
        
        // Show error notification in header
        const header = document.querySelector('.header');
        const errorNotification = document.createElement('div');
        errorNotification.className = 'plex-error-notification';
        errorNotification.innerHTML = `
            <span class="error-icon">⚠️</span>
            <span class="error-text">Plex Offline: ${message}</span>
            <button class="error-dismiss" onclick="this.parentElement.remove()">✕</button>
        `;
        
        // Remove any existing error notification
        const existing = header.querySelector('.plex-error-notification');
        if (existing) existing.remove();
        
        header.appendChild(errorNotification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (errorNotification.parentElement) {
                errorNotification.remove();
            }
        }, 10000);
    }

    parseXMLToJSON(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            // Check for parsing errors
            const parseError = xmlDoc.getElementsByTagName('parsererror');
            if (parseError.length > 0) {
                throw new Error('XML parsing error');
            }
            
            const mediaContainer = xmlDoc.getElementsByTagName('MediaContainer')[0];
            if (!mediaContainer) {
                throw new Error('No MediaContainer found in XML');
            }
            
            // Convert XML to JSON-like object
            const result = {
                MediaContainer: {
                    friendlyName: mediaContainer.getAttribute('friendlyName'),
                    version: mediaContainer.getAttribute('version'),
                    size: parseInt(mediaContainer.getAttribute('size')) || 0
                }
            };
            
            // Handle Directory elements (for sections)
            const directories = Array.from(mediaContainer.getElementsByTagName('Directory')).map(dir => ({
                key: dir.getAttribute('key'),
                title: dir.getAttribute('title'),
                type: dir.getAttribute('type'),
                agent: dir.getAttribute('agent'),
                scanner: dir.getAttribute('scanner'),
                language: dir.getAttribute('language'),
                uuid: dir.getAttribute('uuid')
            }));
            
            if (directories.length > 0) {
                result.MediaContainer.Directory = directories;
            }
            
            // Handle Video/Movie elements (for content)
            const videos = Array.from(mediaContainer.getElementsByTagName('Video')).map(video => ({
                ratingKey: video.getAttribute('ratingKey'),
                key: video.getAttribute('key'),
                title: video.getAttribute('title'),
                type: video.getAttribute('type'),
                year: parseInt(video.getAttribute('year')) || null,
                duration: parseInt(video.getAttribute('duration')) || null,
                summary: video.getAttribute('summary'),
                rating: parseFloat(video.getAttribute('rating')) || null,
                Media: Array.from(video.getElementsByTagName('Media')).map(media => ({
                    duration: parseInt(media.getAttribute('duration')) || null,
                    Part: Array.from(media.getElementsByTagName('Part')).map(part => ({
                        key: part.getAttribute('key'),
                        duration: parseInt(part.getAttribute('duration')) || null,
                        file: part.getAttribute('file')
                    }))
                }))
            }));
            
            if (videos.length > 0) {
                result.MediaContainer.Metadata = videos;
            }
            
            console.log('Parsed XML to JSON:', result);
            return result;
            
        } catch (error) {
            console.error('Error parsing XML:', error);
            throw new Error(`Failed to parse Plex XML response: ${error.message}`);
        }
    }

    async fetchPlexData(endpoint) {
        const sep = endpoint.includes('?') ? '&' : '?';
        const url = `${this.config.plexUrl}${endpoint}${sep}X-Plex-Token=${this.config.plexToken}`;

        try {
            console.log('Fetching Plex data from:', url);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            let response;
            try {
                response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'X-Plex-Client-Identifier': 'stationarr',
                        'X-Plex-Product': 'Stationarr',
                        'X-Plex-Version': '1.0.0',
                        'X-Plex-Platform': 'Web'
                    }
                });
            } finally {
                clearTimeout(timeoutId);
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type');
            console.log('Response Content-Type:', contentType);
            
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                // Handle XML response
                const xmlText = await response.text();
                console.log('Got XML response, parsing...');
                return this.parseXMLToJSON(xmlText);
            }
        } catch (error) {
            console.error('Plex API Error:', error);
            throw error;
        }
    }

    getChannelLogo(name) {
        return name.charAt(0).toUpperCase();
    }

    getPosterUrl(mediaItem) {
        if (!mediaItem || !this.config.ui.showPosters) return null;
        
        // Try different poster/thumbnail sources from Plex
        const posterSources = [
            mediaItem.thumb,           // Primary thumbnail
            mediaItem.art,             // Background art
            mediaItem.parentThumb,     // Parent (season/show) thumbnail
            mediaItem.grandparentThumb // Grandparent (show) thumbnail
        ];
        
        for (const source of posterSources) {
            if (source) {
                // Convert relative Plex path to full URL
                const posterUrl = source.startsWith('http') ? 
                    source : 
                    `${this.config.plexUrl}${source}?X-Plex-Token=${this.config.plexToken}`;
                return posterUrl;
            }
        }
        
        return null;
    }

    generateTimeSlots() {
        this.timeSlots = [];
        const startTime = new Date(this.currentTime);
        startTime.setMinutes(0, 0, 0);
        
        // Debug disabled
        // console.log('Generating time slots starting from:', startTime.toLocaleTimeString('en-US', {hour12: false}));
        
        for (let i = 0; i < this.config.timeRange * 2; i++) {
            const slotTime = new Date(startTime);
            slotTime.setMinutes(startTime.getMinutes() + (i * 30));
            this.timeSlots.push(slotTime);
            // console.log(`Slot ${i}: ${slotTime.toLocaleTimeString('en-US', {hour12: false})}`);
        }
    }

    getTypeLabel(type) {
        const labels = {
            'library':        'Libraries',
            'video-playlist': 'Video Playlists',
            'music-playlist': 'Music Playlists',
            'category':       'Categories',
            'collection':     'Collections',
        };
        return labels[type] || type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + 's';
    }

    getGroupedChannels(channels) {
        const grouped = {};
        channels.forEach(ch => {
            if (!grouped[ch.type]) grouped[ch.type] = [];
            grouped[ch.type].push(ch);
        });
        // Sort each group: use persisted drag order if available, otherwise alphabetical
        Object.keys(grouped).forEach(type => {
            const order = this.channelOrder[type];
            if (order && order.length > 0) {
                grouped[type].sort((a, b) => {
                    const ai = order.indexOf(a.id);
                    const bi = order.indexOf(b.id);
                    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                });
            } else {
                grouped[type].sort((a, b) => a.name.localeCompare(b.name));
            }
        });
        // Sort groups using the custom group order
        const types = Object.keys(grouped).sort((a, b) => {
            const ai = this.groupOrder.indexOf(a);
            const bi = this.groupOrder.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
        });
        return { grouped, types };
    }

    renderChannels() {
        console.log('=== RENDERING CHANNELS ===');
        console.log('Available channels:', this.channels.length);
        console.log('Visible channels config:', this.config.visibleChannels);
        
        const channelsList = document.getElementById('channelsList');
        channelsList.innerHTML = '';
        
        // Use DocumentFragment for better DOM performance
        const fragment = document.createDocumentFragment();

        const visibleChannels = this.channels.filter(channel => 
            this.config.visibleChannels.has(channel.id)
        );
        
        console.log('Filtered visible channels:', visibleChannels.length);
        console.log('Visible channel names:', visibleChannels.map(c => c.name));

        if (visibleChannels.length === 0) {
            console.log('No visible channels - showing no channels message');
            channelsList.innerHTML = '<div class="loading">No channels available</div>';
            return;
        }

        const makeChannelElement = (channel, isFirst, draggable = false) => {
            const el = document.createElement('div');
            el.className = 'channel-item';
            el.dataset.channelId = channel.id;
            if (isFirst) {
                el.classList.add('active');
                this.selectedChannel = channel.id;
            }
            el.innerHTML = `
                ${draggable ? '<div class="channel-drag-handle" title="Drag to reorder">⠿</div>' : ''}
                <div class="channel-logo">${channel.logo}</div>
                <div class="channel-info">
                    <div class="channel-name">${channel.name}</div>
                    <div class="channel-type">${channel.type}</div>
                </div>
            `;
            el.addEventListener('click', () => {
                document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
                el.classList.add('active');
                this.selectedChannel = channel.id;
                this.playChannelContent(channel);
            });
            
            // Right-click context menu
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showChannelContextMenu(e, channel);
            });
            
            return el;
        };

        if (this.config.ui.groupChannelsByType) {
            const { grouped, types } = this.getGroupedChannels(visibleChannels);
            let isFirst = true;
            let dragSrc = null;
            let groupDragSrc = null;

            types.forEach(type => {
                const header = document.createElement('div');
                header.className = 'channel-group-header';
                if (this.collapsedGroups.has(type)) header.classList.add('collapsed');
                header.dataset.group = type;
                header.draggable = true;
                header.innerHTML = `<span class="group-drag-handle" title="Drag to reorder groups">⠿</span><span class="group-toggle">▾</span><span class="group-label">${this.getTypeLabel(type)}</span>`;
                
                // Toggle functionality (only on toggle span, not on drag handle)
                header.querySelector('.group-toggle').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleChannelGroup(type);
                });
                header.querySelector('.group-label').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleChannelGroup(type);
                });
                
                // Group drag-and-drop functionality
                header.addEventListener('dragstart', (e) => {
                    groupDragSrc = header;
                    header.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', type);
                });
                header.addEventListener('dragend', () => {
                    header.classList.remove('dragging');
                    document.querySelectorAll('.channel-group-header')
                        .forEach(h => h.classList.remove('drag-over-top', 'drag-over-bottom'));
                    groupDragSrc = null;
                });
                header.addEventListener('dragover', (e) => {
                    if (!groupDragSrc || groupDragSrc === header) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const rect = header.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    header.classList.remove('drag-over-top', 'drag-over-bottom');
                    header.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
                });
                header.addEventListener('dragleave', () => {
                    header.classList.remove('drag-over-top', 'drag-over-bottom');
                });
                header.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (!groupDragSrc || groupDragSrc === header) return;
                    const rect = header.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    
                    // Find all content for the dragged group
                    const draggedType = groupDragSrc.dataset.group;
                    const draggedItems = document.querySelectorAll(`.channel-item[data-group="${draggedType}"]`);
                    
                    if (e.clientY < mid) {
                        // Insert before this header - header first, then items after the header
                        header.parentNode.insertBefore(groupDragSrc, header);
                        // Insert items after the header (which is now right before the original header)
                        let insertPoint = groupDragSrc.nextElementSibling; // This should be the original header
                        draggedItems.forEach(item => {
                            header.parentNode.insertBefore(item, insertPoint);
                        });
                    } else {
                        // Insert after this header and its items
                        let insertAfter = header;
                        while (insertAfter.nextElementSibling && !insertAfter.nextElementSibling.classList.contains('channel-group-header')) {
                            insertAfter = insertAfter.nextElementSibling;
                        }
                        
                        // Insert header first
                        if (insertAfter.nextElementSibling) {
                            insertAfter.parentNode.insertBefore(groupDragSrc, insertAfter.nextElementSibling);
                        } else {
                            insertAfter.parentNode.appendChild(groupDragSrc);
                        }
                        
                        // Then insert items after the header
                        let insertPoint = groupDragSrc.nextElementSibling;
                        draggedItems.forEach(item => {
                            if (insertPoint) {
                                groupDragSrc.parentNode.insertBefore(item, insertPoint);
                            } else {
                                groupDragSrc.parentNode.appendChild(item);
                            }
                        });
                    }
                    
                    header.classList.remove('drag-over-top', 'drag-over-bottom');
                    this.saveGroupOrder();
                });
                
                fragment.appendChild(header);

                grouped[type].forEach(channel => {
                    const el = makeChannelElement(channel, isFirst, true);
                    el.dataset.group = type;
                    el.draggable = true;
                    if (this.collapsedGroups.has(type)) el.style.display = 'none';

                    el.addEventListener('dragstart', (e) => {
                        dragSrc = el;
                        el.classList.add('dragging');
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', channel.id);
                    });
                    el.addEventListener('dragend', () => {
                        el.classList.remove('dragging');
                        document.querySelectorAll('.channel-item')
                            .forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
                        dragSrc = null;
                    });
                    el.addEventListener('dragover', (e) => {
                        if (!dragSrc || dragSrc.dataset.group !== type || dragSrc === el) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const mid = el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
                        el.classList.remove('drag-over-top', 'drag-over-bottom');
                        el.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
                    });
                    el.addEventListener('dragleave', () => {
                        el.classList.remove('drag-over-top', 'drag-over-bottom');
                    });
                    el.addEventListener('drop', (e) => {
                        e.preventDefault();
                        if (!dragSrc || dragSrc.dataset.group !== type || dragSrc === el) return;
                        const mid = el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
                        if (e.clientY < mid) {
                            el.parentNode.insertBefore(dragSrc, el);
                        } else {
                            el.parentNode.insertBefore(dragSrc, el.nextSibling);
                        }
                        el.classList.remove('drag-over-top', 'drag-over-bottom');
                        this.saveChannelOrder(type);
                    });

                    fragment.appendChild(el);
                    isFirst = false;
                });
            });
        } else {
            visibleChannels.forEach((channel, index) => {
                fragment.appendChild(makeChannelElement(channel, index === 0));
            });
        }
        
        // Append all elements at once for better performance
        channelsList.appendChild(fragment);
    }

    renderEPG() {
        console.log('=== RENDERING EPG ===');
        console.log('Time slots:', this.timeSlots.length);
        console.log('Channels for EPG:', this.channels.length);
        
        const timelineHeader = document.getElementById('timelineHeader');
        const programGrid = document.getElementById('programGrid');
        
        this.renderTimeSlots(timelineHeader);
        this.renderProgramGrid(programGrid);
    }

    renderTimeSlots(container) {
        const timeSlotsContainer = container.querySelector('.time-slots');
        timeSlotsContainer.innerHTML = '';

        const ppm = 4 * this.epgScale;
        // Snap interval: 15min when zoomed in, 60min when zoomed out
        const interval = this.epgScale >= 1.5 ? 15 : (this.epgScale >= 0.7 ? 30 : 60);
        const slotWidth = Math.round(interval * ppm);

        const startTime = new Date(this.timeSlots[0]);
        const endTime = new Date(this.timeSlots[this.timeSlots.length - 1]);
        endTime.setMinutes(endTime.getMinutes() + 30);

        const now = new Date();
        const current = new Date(startTime);
        while (current <= endTime) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            slot.style.minWidth = `${slotWidth}px`;
            slot.style.width = `${slotWidth}px`;

            if (current.getHours() === now.getHours() && current.getDate() === now.getDate()) {
                slot.classList.add('current');
            }

            slot.textContent = current.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            timeSlotsContainer.appendChild(slot);
            current.setMinutes(current.getMinutes() + interval);
        }
    }

    renderProgramGrid(container) {
        console.log('=== RENDERING PROGRAM GRID ===');
        container.innerHTML = '';

        // Create the current time line inside the EPG container
        const currentTimeLine = document.createElement('div');
        currentTimeLine.id = 'currentTimeLine';
        currentTimeLine.className = 'current-time-line';
        container.appendChild(currentTimeLine);

        const visibleChannels = this.channels.filter(channel =>
            this.config.visibleChannels.has(channel.id)
        );

        console.log('Visible channels for program grid:', visibleChannels.length);

        const renderRow = (channel) => {
            const channelRow = document.createElement('div');
            channelRow.className = 'channel-row';
            channelRow.dataset.channelId = channel.id;

            const programs = this.generateProgramSchedule(channel);
            programs.forEach(program => {
                const programElement = document.createElement('div');
                programElement.className = 'program';
                
                const widthPixels = this.calculateProgramWidth(program.duration);
                programElement.style.width = `${widthPixels}px`;
                programElement.style.minWidth = `${widthPixels}px`;
                programElement.style.flexShrink = '0';
                
                // Add duration indicator classes
                programElement.setAttribute('data-duration', program.duration);
                if (program.duration >= 120) {
                    programElement.classList.add('long-content');
                } else if (program.duration <= 30) {
                    programElement.classList.add('short-content');
                }
                
                const now = new Date();
                if (now >= program.startTime && now <= program.endTime) {
                    programElement.classList.add('current');
                } else if (program.startTime > now) {
                    programElement.classList.add('upcoming');
                }

                // Use displayTitle if available (for episodes), otherwise use regular title
                const displayTitle = program.displayTitle || program.title;
                const isEpisode = (program.showTitle && program.seasonTitle) ||
                                 (program.type === 'episode') ||
                                 (program.showTitle && (program.seasonIndex || program.episodeIndex)) ||
                                 (program.parentTitle && program.grandparentTitle);

                programElement.dataset.mediaType = isEpisode ? 'episode' : 'movie';

                // Get robust episode info
                const seasonNum = program.seasonIndex || program.parentIndex || program.seasonNumber || '?';
                const episodeNum = program.episodeIndex || program.index || program.episodeNumber || '?';
                const showTitle = program.showTitle || program.grandparentTitle || 'Unknown Series';
                
                // Get poster URL
                const posterUrl = this.getPosterUrl(program.originalContent || program);
                
                programElement.innerHTML = `
                    ${posterUrl ? `<div class="program-poster-left"><img src="${posterUrl}" alt="Poster" /></div>` : ''}
                    <div class="program-content">
                        <div class="program-title">${isEpisode ? showTitle : displayTitle}</div>
                        ${isEpisode ? `<div class="program-episode">S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}: ${program.title}</div>` : ''}
                        <div class="program-time">
                            ${program.startTime.toLocaleTimeString('en-US', {
                                hour12: false, hour: '2-digit', minute: '2-digit'
                            })} - ${program.endTime.toLocaleTimeString('en-US', {
                                hour12: false, hour: '2-digit', minute: '2-digit'
                            })}
                        </div>
                    </div>
                `;

                programElement.addEventListener('click', () => {
                    this.playProgram(program, channel);
                });

                // Add tooltip functionality
                this.addTooltipListeners(programElement, program);

                channelRow.appendChild(programElement);
            });

            container.appendChild(channelRow);
            return channelRow;
        };

        if (this.config.ui.groupChannelsByType) {
            const { grouped, types } = this.getGroupedChannels(visibleChannels);
            types.forEach(type => {
                const spacer = document.createElement('div');
                spacer.className = 'channel-group-spacer';
                spacer.dataset.group = type;
                // Spacer always visible — it pairs with the always-visible sidebar header
                container.appendChild(spacer);

                grouped[type].forEach(channel => {
                    const row = renderRow(channel);
                    row.dataset.group = type;
                    if (this.collapsedGroups.has(type)) row.style.display = 'none';
                });
            });
        } else {
            visibleChannels.forEach(channel => renderRow(channel));
        }
    }

    toggleChannelGroup(type) {
        const isCollapsed = this.collapsedGroups.has(type);
        if (isCollapsed) {
            this.collapsedGroups.delete(type);
        } else {
            this.collapsedGroups.add(type);
        }
        localStorage.setItem('plexStationarrCollapsedGroups', JSON.stringify([...this.collapsedGroups]));

        // Toggle sidebar header arrow
        document.querySelectorAll(`.channel-group-header[data-group="${type}"]`).forEach(h => {
            h.classList.toggle('collapsed', !isCollapsed);
        });

        // Toggle sidebar channel items
        document.querySelectorAll(`.channel-item[data-group="${type}"]`).forEach(el => {
            el.style.display = isCollapsed ? '' : 'none';
        });

        // Toggle grid rows only — spacer stays visible to match the always-visible sidebar header
        document.querySelectorAll(`.channel-row[data-group="${type}"]`).forEach(el => {
            el.style.display = isCollapsed ? '' : 'none';
        });
    }

    saveChannelOrder(type) {
        const items = document.querySelectorAll(`.channel-item[data-group="${type}"]`);
        this.channelOrder[type] = [...items].map(el => el.dataset.channelId);
        localStorage.setItem('plexStationarrChannelOrder', JSON.stringify(this.channelOrder));
        this.reorderChannels();
        this.renderEPG();
    }

    saveGroupOrder() {
        const headers = document.querySelectorAll('.channel-group-header');
        this.groupOrder = [...headers].map(header => header.dataset.group);
        localStorage.setItem('plexStationarrGroupOrder', JSON.stringify(this.groupOrder));
        console.log('Saved group order:', this.groupOrder);
        this.reorderChannels();
        this.renderEPG();
    }

    reorderChannels() {
        const { grouped, types } = this.getGroupedChannels(this.channels);
        const reordered = [];
        types.forEach(type => reordered.push(...grouped[type]));
        this.channels = reordered;
    }

    filterBySearch(query) {
        const channelItems = document.querySelectorAll('.channel-item');

        channelItems.forEach(channelItem => {
            const channelId = channelItem.dataset.channelId;
            const channelName = (channelItem.querySelector('.channel-name')?.textContent || '').toLowerCase();
            const channelRow = document.querySelector(`.channel-row[data-channel-id="${channelId}"]`);

            if (!query) {
                channelItem.style.display = '';
                if (channelRow) {
                    channelRow.style.display = '';
                    channelRow.querySelectorAll('.program').forEach(p => p.style.display = '');
                }
                return;
            }

            const nameMatches = channelName.includes(query);
            let anyProgramMatches = false;

            if (channelRow) {
                channelRow.querySelectorAll('.program').forEach(program => {
                    const title = (program.querySelector('.program-title')?.textContent || '').toLowerCase();
                    const episodeTitle = (program.querySelector('.program-episode')?.textContent || '').toLowerCase();
                    const matches = title.includes(query) || episodeTitle.includes(query);
                    program.style.display = (nameMatches || matches) ? '' : 'none';
                    if (matches) anyProgramMatches = true;
                });
            }

            const visible = nameMatches || anyProgramMatches;
            channelItem.style.display = visible ? '' : 'none';
            if (channelRow) channelRow.style.display = visible ? '' : 'none';
        });

        // Hide group headers and their spacers when all channels in the group are hidden
        document.querySelectorAll('.channel-group-header').forEach(header => {
            const type = header.dataset.group;
            const anyVisible = [...document.querySelectorAll(`.channel-item[data-group="${type}"]`)]
                .some(el => el.style.display !== 'none');
            const show = !query || anyVisible;
            header.style.display = show ? '' : 'none';
            document.querySelectorAll(`.channel-group-spacer[data-group="${type}"]`).forEach(s => {
                s.style.display = show ? '' : 'none';
            });
        });
    }

    generateProgramSchedule(channel) {
        if (this.programScheduleCache[channel.id]) {
            return this.programScheduleCache[channel.id];
        }

        if (this.config.playback.stableBroadcastSchedule) {
            return this._generateStableSchedule(channel);
        }

        const programs = [];
        const startTime = new Date(this.timeSlots[0]);
        const endTime = new Date(this.timeSlots[this.timeSlots.length - 1]);
        endTime.setMinutes(endTime.getMinutes() + 30);

        let currentTime = new Date(startTime);

        while (currentTime < endTime && programs.length < 50) {
            if (!channel.content || channel.content.length === 0) {
                programs.push({
                    title: 'No Content Available',
                    duration: 30,
                    startTime: new Date(currentTime),
                    endTime: new Date(currentTime.getTime() + (30 * 60000)),
                    type: 'filler'
                });
                currentTime.setMinutes(currentTime.getMinutes() + 30);
                continue;
            }

            const randomIndex = Math.floor(Math.random() * channel.content.length);
            const content = channel.content[randomIndex];
            const duration = this.getContentDuration(content);
            const programEndTime = new Date(currentTime.getTime() + (duration * 60000));

            programs.push({
                title: content.title || content.name || 'Unknown',
                duration: duration,
                startTime: new Date(currentTime),
                endTime: programEndTime,
                year: content.year,
                type: content.type,
                ratingKey: content.ratingKey || content.key,
                key: content.key,
                summary: content.summary,
                rating: content.rating,
                Media: content.Media,
                showTitle: content.showTitle,
                seasonTitle: content.seasonTitle,
                seasonIndex: content.seasonIndex,
                episodeIndex: content.episodeIndex,
                displayTitle: content.displayTitle,
                originalShowData: content.originalShowData,
                originalContent: content
            });

            currentTime = programEndTime;
        }

        this.programScheduleCache[channel.id] = programs;
        return programs;
    }

    // Seeded PRNG (mulberry32) — same seed always produces the same sequence
    _seededRandom(seed) {
        let s = seed >>> 0;
        return () => {
            s += 0x6d2b79f5;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
        }
        return Math.abs(hash);
    }

    // Stable content duration — no randomness so positions are deterministic
    _getStableDuration(content) {
        if (content.duration && content.duration > 1000) return Math.round(content.duration / 60000);
        if (content.duration) return content.duration;
        switch (content.type) {
            case 'movie': return 120;
            case 'episode':
            case 'show': return 30;
            default: return 45;
        }
    }

    _generateStableSchedule(channel) {
        const epgStart = new Date(this.timeSlots[0]);
        const epgEnd = new Date(this.timeSlots[this.timeSlots.length - 1]);
        epgEnd.setMinutes(epgEnd.getMinutes() + 30);

        const programs = [];

        if (!channel.content || channel.content.length === 0) {
            let t = new Date(epgStart);
            while (t < epgEnd) {
                programs.push({ title: 'No Content Available', duration: 30, startTime: new Date(t), endTime: new Date(t.getTime() + 1800000), type: 'filler' });
                t.setMinutes(t.getMinutes() + 30);
            }
            this.programScheduleCache[channel.id] = programs;
            return programs;
        }

        // Sort by stable key first so the shuffle input is identical regardless
        // of the order Plex returned the data on this particular load
        const content = [...channel.content].sort((a, b) => {
            const ka = String(a.ratingKey || a.key || a.title || '');
            const kb = String(b.ratingKey || b.key || b.title || '');
            return ka.localeCompare(kb);
        });

        // Deterministic shuffle seeded by channel ID + randomization seed
        const seedString = String(channel.id) + ':' + (channel.randomSeed || 0);
        const rng = this._seededRandom(this._hashString(seedString));
        for (let i = content.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [content[i], content[j]] = [content[j], content[i]];
        }

        // Pre-compute stable durations
        const durations = content.map(c => this._getStableDuration(c));
        const totalCycleMs = durations.reduce((a, b) => a + b, 0) * 60000;
        if (totalCycleMs === 0) return programs;

        // Anchor to a fixed epoch (Jan 1 2024 UTC) so schedule is absolute
        const EPOCH = Date.UTC(2024, 0, 1);
        const nowMs = Date.now(); // single snapshot — used consistently throughout
        const elapsedMs = nowMs - EPOCH;
        const posInCycleMs = ((elapsedMs % totalCycleMs) + totalCycleMs) % totalCycleMs;

        // Find which item is "on air" right now and how far into it we are
        let acc = 0;
        let nowItemIndex = 0;
        let offsetIntoNowItem = 0;
        for (let i = 0; i < content.length; i++) {
            const dur = durations[i] * 60000;
            if (acc + dur > posInCycleMs) {
                nowItemIndex = i;
                offsetIntoNowItem = posInCycleMs - acc;
                break;
            }
            acc += dur;
        }

        // Actual ms timestamp when the current item started
        const nowItemStartMs = nowMs - offsetIntoNowItem;

        // Walk backwards from the current item until we cover epgStart
        let scheduleStartMs = nowItemStartMs;
        let scheduleStartIndex = nowItemIndex;
        while (scheduleStartMs > epgStart.getTime()) {
            scheduleStartIndex = (scheduleStartIndex - 1 + content.length) % content.length;
            scheduleStartMs -= durations[scheduleStartIndex] * 60000;
        }

        // Build forward until we cover epgEnd
        let t = scheduleStartMs;
        let idx = scheduleStartIndex;
        while (t < epgEnd.getTime() && programs.length < 200) {
            const c = content[idx];
            const durMs = durations[idx] * 60000;
            const endMs = t + durMs;
            programs.push({
                title: c.title || c.name || 'Unknown',
                duration: durations[idx],
                startTime: new Date(t),
                endTime: new Date(endMs),
                year: c.year,
                type: c.type,
                ratingKey: c.ratingKey || c.key,
                key: c.key,
                summary: c.summary,
                rating: c.rating,
                Media: c.Media,
                showTitle: c.showTitle,
                seasonTitle: c.seasonTitle,
                seasonIndex: c.seasonIndex,
                episodeIndex: c.episodeIndex,
                displayTitle: c.displayTitle,
                originalShowData: c.originalShowData,
                originalContent: c
            });
            t = endMs;
            idx = (idx + 1) % content.length;
        }

        // The EPG renderer lays programs out as a plain flex row starting at epgStart (pixel 0).
        // If the first program began before epgStart, clip it so its startTime = epgStart and
        // its duration reflects only the portion visible in the window — otherwise every program
        // is shifted right by the pre-window overhang and the current-time indicator appears to
        // be inside the wrong (next) program bar.
        if (programs.length > 0) {
            const first = programs[0];
            const overlapMs = epgStart.getTime() - first.startTime.getTime();
            if (overlapMs > 0) {
                const remainingMs = first.duration * 60000 - overlapMs;
                if (remainingMs > 0) {
                    first.startTime = new Date(epgStart);
                    first.duration = Math.round(remainingMs / 60000);
                    first.endTime = new Date(epgStart.getTime() + remainingMs);
                } else {
                    programs.shift(); // Program ended before the window; drop it
                }
            }
        }

        this.programScheduleCache[channel.id] = programs;
        return programs;
    }

    getContentDuration(content) {
        if (content.duration) {
            if (content.duration > 1000) return Math.round(content.duration / 60000);
            return content.duration;
        }
        switch (content.type) {
            case 'movie': return Math.floor(Math.random() * 60) + 90;
            case 'episode':
            case 'show': return Math.floor(Math.random() * 15) + 30;
            default: return Math.floor(Math.random() * 30) + 30;
        }
    }

    calculateProgramWidth(durationMinutes) {
        const pixelsPerMinute = 4 * this.epgScale;
        return Math.max(40, durationMinutes * pixelsPerMinute);
    }

    showProgramDetails(program, channel) {
        alert(`${program.title}\nChannel: ${channel.name}\nDuration: ${program.duration} minutes`);
    }

    updateCurrentTimeLine() {
        const currentTimeLine = document.getElementById('currentTimeLine');
        if (!currentTimeLine) return;
        
        const now = new Date();
        
        // Get the EPG start time (first time slot) - this starts at the beginning of current hour
        if (this.timeSlots.length === 0) return;
        
        const epgStartTime = this.timeSlots[0]; // This is the start of the current hour
        
        // Calculate minutes from EPG start time to current time
        const minutesFromEpgStart = (now - epgStartTime) / (1000 * 60);

        const pixelsPerMinute = 4 * this.epgScale;
        const position = minutesFromEpgStart * pixelsPerMinute;
        
        // Debug disabled
        // console.log('Current time:', now.toLocaleTimeString('en-US', {hour12: false}));
        // console.log('EPG start time:', epgStartTime.toLocaleTimeString('en-US', {hour12: false}));
        // console.log('Minutes from EPG start:', minutesFromEpgStart);
        // console.log('Position in pixels:', position);
        
        // Position relative to the content area (no sidebar offset needed since line is inside EPG container)
        currentTimeLine.style.left = `${position}px`;
        
        // Hide the line if it's outside the visible EPG range
        const epgEndTime = this.timeSlots[this.timeSlots.length - 1];
        const epgEndTimePlusSlot = new Date(epgEndTime.getTime() + (30 * 60 * 1000)); // Add 30 minutes
        
        if (now < epgStartTime || now > epgEndTimePlusSlot) {
            currentTimeLine.style.display = 'none';
        } else {
            currentTimeLine.style.display = 'block';
        }
    }

    addTooltipListeners(element, program) {
        element.addEventListener('mouseenter', (e) => {
            // Check if tooltips are enabled
            if (!this.config.ui.enableTooltips) return;
            
            this.clearTooltipTimer();
            
            // Use configurable delay
            this.tooltipTimer = setTimeout(() => {
                this.showTooltip(e.target, program);
            }, this.config.ui.tooltipDelay);
        });

        element.addEventListener('mouseleave', () => {
            this.clearTooltipTimer();
            this.hideTooltip();
        });

        element.addEventListener('mousemove', (e) => {
            if (this.currentTooltip) {
                this.positionTooltip(e);
            }
        });
    }

    clearTooltipTimer() {
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }
    }

    showTooltip(targetElement, program) {
        // Remove any existing tooltip
        this.hideTooltip();

        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'media-tooltip';
        
        // Create content with full title and additional info
        const content = document.createElement('div');
        const isEpisode = (program.showTitle && program.seasonTitle) || 
                         (program.type === 'episode') ||
                         (program.showTitle && (program.seasonIndex || program.episodeIndex)) ||
                         (program.parentTitle && program.grandparentTitle);
        
        // Get robust episode info for tooltip
        const seasonNum = program.seasonIndex || program.parentIndex || program.seasonNumber || '?';
        const episodeNum = program.episodeIndex || program.index || program.episodeNumber || '?';
        const showTitle = program.showTitle || program.grandparentTitle || 'Unknown Series';
        const seasonTitle = program.seasonTitle || program.parentTitle || `Season ${seasonNum}`;
        
        // Get poster for tooltip
        const posterUrl = this.getPosterUrl(program.originalContent || program);
        
        content.innerHTML = `
            <div style="display: flex; gap: 0.75rem;">
                ${posterUrl ? `<div style="flex-shrink: 0;"><img src="${posterUrl}" alt="Poster" style="width: 60px; height: 90px; object-fit: cover; border-radius: 4px;" /></div>` : ''}
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">${isEpisode ? `${showTitle} - ${seasonTitle}` : program.title}</div>
                    ${isEpisode ? `<div style="font-size: 0.85rem; color: #fff; margin-bottom: 0.25rem;">Episode ${episodeNum}: ${program.title}</div>` : ''}
                    ${program.year ? `<div style="font-size: 0.8rem; color: #ccc;">Year: ${program.year}</div>` : ''}
                    ${program.duration ? `<div style="font-size: 0.8rem; color: #ccc;">Duration: ${this.formatDuration(program.duration)}</div>` : ''}
                    ${program.type ? `<div style="font-size: 0.8rem; color: #ccc;">Type: ${program.type.charAt(0).toUpperCase() + program.type.slice(1)}</div>` : ''}
                    ${program.summary ? `<div style="font-size: 0.8rem; color: #ddd; margin-top: 0.25rem; line-height: 1.3;">${program.summary}</div>` : ''}
                </div>
            </div>
        `;
        
        tooltip.appendChild(content);
        document.body.appendChild(tooltip);
        
        this.currentTooltip = tooltip;
        
        // Position tooltip
        this.positionTooltip(null, targetElement);
        
        // Show tooltip with animation
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 10);
    }

    positionTooltip(mouseEvent, targetElement = null) {
        if (!this.currentTooltip) return;

        const tooltip = this.currentTooltip;
        const target = targetElement || mouseEvent.target;
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // Calculate position above the target element
        let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        let top = targetRect.top - tooltipRect.height - 12; // 12px gap for arrow
        
        // Adjust if tooltip goes off screen horizontally
        if (left < 10) {
            left = 10;
        } else if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        
        // Adjust if tooltip goes off screen vertically (show below instead)
        if (top < 10) {
            top = targetRect.bottom + 12;
            // Flip arrow direction by adding a class
            tooltip.classList.add('tooltip-below');
        } else {
            tooltip.classList.remove('tooltip-below');
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    hideTooltip() {
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
    }

    openConfigModal() {
        const modal = document.getElementById('configModal');
        modal.classList.add('show');
        this.populateConfigModal();
    }

    closeConfigModal() {
        const modal = document.getElementById('configModal');
        modal.classList.remove('show');
    }

    populateConfigModal() {
        // Populate Plex settings
        document.getElementById('plexUrl').value = this.config.plexUrl;
        document.getElementById('plexToken').value = this.config.plexToken;
        
        // Content types are now auto-enabled when available
        
        // Populate time range
        document.getElementById('timeRange').value = this.config.timeRange;

        // Populate UI settings
        document.getElementById('enableTooltips').checked = this.config.ui.enableTooltips;
        document.getElementById('tooltipDelay').value = this.config.ui.tooltipDelay;
        document.getElementById('compactView').checked = this.config.ui.compactView;
        document.getElementById('enableAnimations').checked = this.config.ui.enableAnimations;
        document.getElementById('showPosters').checked = this.config.ui.showPosters;
        document.getElementById('epgScaleSetting').value = this.config.ui.epgScale;
        document.getElementById('epgScaleDisplay').textContent = Math.round(this.config.ui.epgScale * 100) + '%';
        document.getElementById('groupChannelsByType').checked = this.config.ui.groupChannelsByType;
        document.getElementById('notificationPosition').value = this.config.ui.notificationPosition;
        document.getElementById('accentColor').value = this.config.ui.accentColor;
        document.getElementById('mediaBarOpacity').value = this.config.ui.mediaBarOpacity;
        document.getElementById('mediaBarOpacityDisplay').textContent = Math.round(this.config.ui.mediaBarOpacity * 100) + '%';

        // Live preview for accent color
        const colorPicker = document.getElementById('accentColor');
        colorPicker.addEventListener('input', () => {
            this.applyAccentColor(colorPicker.value);
        });

        // Live preview for media bar opacity
        const opacitySlider = document.getElementById('mediaBarOpacity');
        const opacityDisplay = document.getElementById('mediaBarOpacityDisplay');
        opacitySlider.addEventListener('input', () => {
            this.config.ui.mediaBarOpacity = parseFloat(opacitySlider.value);
            opacityDisplay.textContent = Math.round(opacitySlider.value * 100) + '%';
            document.documentElement.style.setProperty('--media-bar-opacity', opacitySlider.value);
        });

        // Populate auto-refresh settings
        document.getElementById('autoRefresh').checked = this.config.ui.autoRefresh;
        document.getElementById('autoRefreshInterval').value = this.config.ui.autoRefreshInterval;

        // Populate playback settings
        document.getElementById('autoPlay').checked = this.config.playback.autoPlay;
        document.getElementById('defaultVolume').value = this.config.playback.defaultVolume;
        document.getElementById('volumeDisplay').textContent = this.config.playback.defaultVolume + '%';
        document.getElementById('rememberPosition').checked = this.config.playback.rememberPosition;
        document.getElementById('showPlaybackNotifications').checked = this.config.playback.showPlaybackNotifications;
        document.getElementById('stableBroadcastSchedule').checked = this.config.playback.stableBroadcastSchedule;
        document.getElementById('resumeFromCurrentPosition').checked = this.config.playback.resumeFromCurrentPosition;

        // Populate advanced settings
        document.getElementById('enableDebugLogging').checked = this.config.advanced.enableDebugLogging;
        document.getElementById('cacheContent').checked = this.config.advanced.cacheContent;
        document.getElementById('lowBandwidthMode').checked = this.config.advanced.lowBandwidthMode;

        // Add volume slider listener
        const volumeSlider = document.getElementById('defaultVolume');
        const volumeDisplay = document.getElementById('volumeDisplay');
        volumeSlider.addEventListener('input', () => {
            volumeDisplay.textContent = volumeSlider.value + '%';
        });

        // Add EPG scale slider listener
        const epgScaleSlider = document.getElementById('epgScaleSetting');
        const epgScaleDisplay = document.getElementById('epgScaleDisplay');
        epgScaleSlider.addEventListener('input', () => {
            const scale = parseFloat(epgScaleSlider.value);
            epgScaleDisplay.textContent = Math.round(scale * 100) + '%';
            this.applyEpgScale(scale);
        });

        const makeList = (containerId, items, emptyMsg, itemHtml) => {
            const container = document.getElementById(containerId);
            container.innerHTML = '';
            if (items.length === 0) {
                container.innerHTML = `<p class="no-content">${emptyMsg}</p>`;
            } else {
                [...items].sort((a, b) => a.title.localeCompare(b.title)).forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'selection-item';
                    div.innerHTML = itemHtml(item);
                    container.appendChild(div);
                });
            }
        };

        // Populate library selection
        makeList('librarySelection', this.availableLibraries,
            'No libraries found. Check Plex connection.',
            lib => `<label><input type="checkbox" id="library_${lib.key}" ${this.config.selectedLibraries.has(lib.id) ? 'checked' : ''}> ${lib.title} <span class="playlist-type">(${lib.type})</span></label>`
        );

        // Populate video playlist selection
        makeList('videoPlaylistSelection', this.availableVideoPlaylists,
            'No video playlists found.',
            pl => `<label><input type="checkbox" id="video_playlist_${pl.ratingKey}" ${this.config.selectedVideoPlaylists.has(pl.id) ? 'checked' : ''}> ${pl.title}</label>`
        );

        // Populate music playlist selection
        makeList('musicPlaylistSelection', this.availableMusicPlaylists,
            'No music playlists found.',
            pl => `<label><input type="checkbox" id="music_playlist_${pl.ratingKey}" ${this.config.selectedMusicPlaylists.has(pl.id) ? 'checked' : ''}> ${pl.title}</label>`
        );

        // Categories already sorted alphabetically from discovery
        makeList('categorySelection', this.availableCategories,
            'No categories found.',
            cat => `<label><input type="checkbox" id="cb_${cat.id}" ${this.config.selectedCategories.has(cat.id) ? 'checked' : ''}> ${cat.title}</label>`
        );

        makeList('collectionSelection', this.availableCollections,
            'No collections found.',
            col => `<label><input type="checkbox" id="collection_${col.key}" ${this.config.selectedCollections.has(col.id) ? 'checked' : ''}> ${col.title}</label>`
        );
    }

    async testPlexConnectionManual() {
        const statusElement = document.getElementById('connectionStatus');
        const testButton = document.getElementById('testPlexConnection');
        
        // Update config values from inputs
        this.config.plexUrl = document.getElementById('plexUrl').value;
        this.config.plexToken = document.getElementById('plexToken').value;
        
        testButton.disabled = true;
        testButton.textContent = 'Testing...';
        statusElement.textContent = '🔄 Testing connection...';
        statusElement.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        
        try {
            await this.testPlexConnection();
            statusElement.textContent = '✅ Connection successful!';
            statusElement.style.color = '#4a7c59';
            
            // Re-discover available content to refresh libraries and lists
            statusElement.textContent = '🔄 Discovering content...';
            await this.discoverAvailableContent();
            
            // Update the config modal with fresh content lists
            this.populateConfigModal();
            statusElement.textContent = '✅ Content lists updated!';
            
            // Reload channels with new settings (don't show internal progress)
            statusElement.textContent = '🔄 Reloading channels...';
            await this.loadSelectedChannels(false); // Don't show progress since we're managing it ourselves
            this.renderChannels();
            this.renderEPG();
            
            statusElement.textContent = '✅ Connection test complete!';
            
            // Hide progress bar after reload
            setTimeout(() => {
                this.hideProgress();
            }, 500);
        } catch (error) {
            // Hide progress bar on error
            this.hideProgress();
            statusElement.textContent = `❌ ${error.message}`;
            statusElement.style.color = '#e74c3c';
        } finally {
            testButton.disabled = false;
            testButton.textContent = 'Test Connection';
        }
    }

    async saveConfiguration() {
        console.log('=== SAVING CONFIGURATION ===');
        
        // Backup current values to detect changes
        const previousConfig = {
            plexUrl: this.config.plexUrl,
            plexToken: this.config.plexToken,
            timeRange: this.config.timeRange,
            selectedLibraries: new Set(this.config.selectedLibraries),
            selectedVideoPlaylists: new Set(this.config.selectedVideoPlaylists),
            selectedMusicPlaylists: new Set(this.config.selectedMusicPlaylists),
            selectedCategories: new Set(this.config.selectedCategories),
            selectedCollections: new Set(this.config.selectedCollections),
            stableBroadcastSchedule: this.config.playback.stableBroadcastSchedule,
            groupChannelsByType: this.config.ui.groupChannelsByType
        };
        
        // Save Plex settings
        this.config.plexUrl = document.getElementById('plexUrl').value;
        this.config.plexToken = document.getElementById('plexToken').value;
        
        // Auto-enable content types based on availability
        this.config.contentTypes = {
            libraries: this.availableLibraries.length > 0,
            videoPlaylists: this.availableVideoPlaylists.length > 0,
            musicPlaylists: this.availableMusicPlaylists.length > 0,
            categories: this.availableCategories.length > 0,
            collections: this.availableCollections.length > 0
        };
        
        // Save time range
        this.config.timeRange = parseInt(document.getElementById('timeRange').value);

        // Save UI settings
        this.config.ui.enableTooltips = document.getElementById('enableTooltips').checked;
        this.config.ui.tooltipDelay = parseInt(document.getElementById('tooltipDelay').value);
        this.config.ui.compactView = document.getElementById('compactView').checked;
        this.config.ui.enableAnimations = document.getElementById('enableAnimations').checked;
        this.config.ui.showPosters = document.getElementById('showPosters').checked;
        this.config.ui.epgScale = parseFloat(document.getElementById('epgScaleSetting').value);
        this.config.ui.groupChannelsByType = document.getElementById('groupChannelsByType').checked;
        this.config.ui.notificationPosition = document.getElementById('notificationPosition').value;
        this.applyAccentColor(document.getElementById('accentColor').value);
        this.config.ui.mediaBarOpacity = parseFloat(document.getElementById('mediaBarOpacity').value);
        this.config.ui.autoRefresh = document.getElementById('autoRefresh').checked;
        this.config.ui.autoRefreshInterval = parseInt(document.getElementById('autoRefreshInterval').value);

        // Save playback settings
        this.config.playback.autoPlay = document.getElementById('autoPlay').checked;
        this.config.playback.defaultVolume = parseInt(document.getElementById('defaultVolume').value);
        this.config.playback.rememberPosition = document.getElementById('rememberPosition').checked;
        this.config.playback.showPlaybackNotifications = document.getElementById('showPlaybackNotifications').checked;
        this.config.playback.stableBroadcastSchedule = document.getElementById('stableBroadcastSchedule').checked;
        this.config.playback.resumeFromCurrentPosition = document.getElementById('resumeFromCurrentPosition').checked;

        // Save advanced settings
        this.config.advanced.enableDebugLogging = document.getElementById('enableDebugLogging').checked;
        this.config.advanced.cacheContent = document.getElementById('cacheContent').checked;
        this.config.advanced.lowBandwidthMode = document.getElementById('lowBandwidthMode').checked;
        
        // Save selected libraries
        this.config.selectedLibraries.clear();
        this.availableLibraries.forEach(library => {
            const checkbox = document.getElementById(`library_${library.key}`);
            if (checkbox && checkbox.checked) {
                this.config.selectedLibraries.add(library.id);
            }
        });
        
        // Save selected video playlists
        this.config.selectedVideoPlaylists.clear();
        this.availableVideoPlaylists.forEach(playlist => {
            const checkbox = document.getElementById(`video_playlist_${playlist.ratingKey}`);
            if (checkbox && checkbox.checked) {
                this.config.selectedVideoPlaylists.add(playlist.id);
            }
        });

        // Save selected music playlists
        this.config.selectedMusicPlaylists.clear();
        this.availableMusicPlaylists.forEach(playlist => {
            const checkbox = document.getElementById(`music_playlist_${playlist.ratingKey}`);
            if (checkbox && checkbox.checked) {
                this.config.selectedMusicPlaylists.add(playlist.id);
            }
        });

        // Save selected categories
        this.config.selectedCategories.clear();
        this.availableCategories.forEach(category => {
            const checkbox = document.getElementById(`cb_${category.id}`);
            if (checkbox && checkbox.checked) {
                this.config.selectedCategories.add(category.id);
            }
        });

        // Save selected collections
        this.config.selectedCollections.clear();
        this.availableCollections.forEach(collection => {
            const checkbox = document.getElementById(`collection_${collection.key}`);
            if (checkbox && checkbox.checked) {
                this.config.selectedCollections.add(collection.id);
            }
        });
        
        console.log('Updated config:', this.config);
        
        // Save to localStorage
        this.saveSettings();

        // Detect if changes require full reload
        const needsFullReload = this.detectChangesRequiringReload(previousConfig);
        
        if (needsFullReload) {
            console.log('Full reload required due to channel or server changes');
            // Clear schedule cache so the new stable/random setting takes effect immediately
            this.programScheduleCache = {};

            // Reload content with new settings
            this.showProgress('Applying settings and reloading channels...');
            try {
                await this.loadSelectedChannels(false); // Don't show internal progress
                this.generateTimeSlots();
                this.renderChannels();
                this.renderEPG();
                
                this.closeConfigModal();
                
                // Show success notification
                this.showNotification('Settings saved successfully!', 'success');
            } catch (error) {
                console.error('Error reloading channels after settings save:', error);
                this.showNotification('Settings saved, but there was an error reloading content.', 'warning');
            } finally {
                // Always hide progress bar
                setTimeout(() => {
                    this.hideProgress();
                }, 500);
            }
        } else {
            console.log('Fast save: only UI updates needed');
            // Fast save for UI-only changes
            this.applyUIChanges(previousConfig);
            this.closeConfigModal();
            this.showNotification('Settings saved successfully!', 'success');
        }
        
        // Apply settings that affect immediate behavior
        this.setupAutoRefresh();
    }

    detectChangesRequiringReload(previousConfig) {
        // Check Plex server changes
        if (this.config.plexUrl !== previousConfig.plexUrl || 
            this.config.plexToken !== previousConfig.plexToken) {
            return true;
        }
        
        // Check time range changes
        if (this.config.timeRange !== previousConfig.timeRange) {
            return true;
        }
        
        // Check channel selection changes
        if (!this.setsEqual(this.config.selectedLibraries, previousConfig.selectedLibraries) ||
            !this.setsEqual(this.config.selectedVideoPlaylists, previousConfig.selectedVideoPlaylists) ||
            !this.setsEqual(this.config.selectedMusicPlaylists, previousConfig.selectedMusicPlaylists) ||
            !this.setsEqual(this.config.selectedCategories, previousConfig.selectedCategories) ||
            !this.setsEqual(this.config.selectedCollections, previousConfig.selectedCollections)) {
            return true;
        }
        
        // Check broadcast schedule changes (affects content order)
        if (this.config.playback.stableBroadcastSchedule !== previousConfig.stableBroadcastSchedule) {
            return true;
        }
        
        // Note: groupChannelsByType changes only affect rendering, not content
        // This is handled in applyUIChanges() instead
        
        return false;
    }
    
    applyUIChanges(previousConfig) {
        let needsChannelRerender = false;
        let needsEpgRerender = false;
        
        // Check if grouping changed (affects channel sidebar layout)
        if (this.config.ui.groupChannelsByType !== previousConfig.groupChannelsByType) {
            needsChannelRerender = true;
            needsEpgRerender = true;
        }
        
        // Re-render channels if grouping changed
        if (needsChannelRerender) {
            this.renderChannels();
        }
        
        // Re-render EPG if poster setting or grouping changed
        if (needsEpgRerender || needsChannelRerender) {
            this.renderEPG();
        }
        
        // Other UI changes (tooltips, animations, notifications, etc.) are applied automatically
        // through the configuration being saved to localStorage
        console.log('Applied UI-only changes without reloading content');
    }
    
    setsEqual(a, b) {
        return a.size === b.size && [...a].every(value => b.has(value));
    }

    applyEpgScale(scale) {
        this.epgScale = scale;
        this.config.ui.epgScale = scale;
        const ppm = 4 * scale;

        // Update all program widths live
        document.querySelectorAll('.program').forEach(p => {
            const duration = parseInt(p.dataset.duration);
            if (!duration) return;
            const width = Math.max(40, duration * ppm);
            p.style.width = `${width}px`;
            p.style.minWidth = `${width}px`;
        });

        // Re-render time labels with new interval/width
        const timelineHeader = document.getElementById('timelineHeader');
        if (timelineHeader) this.renderTimeSlots(timelineHeader);

        // Reposition current time line
        this.updateCurrentTimeLine();

        // Keep settings slider in sync if open
        const slider = document.getElementById('epgScaleSetting');
        const display = document.getElementById('epgScaleDisplay');
        if (slider) slider.value = scale;
        if (display) display.textContent = Math.round(scale * 100) + '%';
    }

    applyAccentColor(color) {
        this.config.ui.accentColor = color;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        // Lighten by ~7% for hover
        const lighten = (v) => Math.min(255, Math.round(v * 1.12));
        const hover = '#' + [r, g, b].map(lighten).map(v => v.toString(16).padStart(2, '0')).join('');
        const root = document.documentElement;
        root.style.setProperty('--accent', color);
        root.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.12)`);
        root.style.setProperty('--accent-hover', hover);
        root.style.setProperty('--accent-r', r);
        root.style.setProperty('--accent-g', g);
        root.style.setProperty('--accent-b', b);
        root.style.setProperty('--media-bar-opacity', this.config.ui.mediaBarOpacity);

        // Update favicon to match accent color
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z"/><path d="M7 21h10"/><rect width="20" height="14" x="2" y="3" rx="2"/></svg>`;
        const favicon = document.querySelector('link[rel="icon"]');
        if (favicon) favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    setupEpgScaleHandle() {
        const handle = document.getElementById('epgScaleHandle');
        if (!handle) return;

        let isDragging = false;
        let startX = 0;
        let startScale = this.epgScale;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startScale = this.epgScale;
            handle.classList.add('dragging');
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const newScale = Math.max(0.3, Math.min(3.0, startScale + deltaX / 150));
            this.applyEpgScale(newScale);
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            this.saveSettings();
        });
    }

    setupAutoRefresh() {
        // Clear existing timer
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }

        // Start new timer if enabled
        if (this.config.ui.autoRefresh) {
            const interval = Math.max(60, this.config.ui.autoRefreshInterval || 14400);
            this.debugLog('Auto-refresh enabled, interval:', interval, 'seconds');
            this.autoRefreshTimer = setInterval(() => {
                this.debugLog('Auto-refreshing content...');
                this.refreshContent();
            }, interval * 1000);
        } else {
            this.debugLog('Auto-refresh disabled');
        }
    }

    async refreshContent() {
        if (this.isRefreshing) {
            this.debugLog('Refresh already in progress, skipping');
            return;
        }
        this.isRefreshing = true;
        try {
            this.debugLog('Starting content refresh');

            // Clear episode cache to get fresh data
            this.clearEpisodeCache();
            
            // Re-discover available content
            await this.discoverAvailableContent();
            
            // Reload selected channels
            await this.loadSelectedChannels();
            
            // Re-render everything
            this.generateTimeSlots();
            this.renderChannels();
            this.renderEPG();
            
            if (this.config.playback.showPlaybackNotifications) {
                this.showNotification('Content refreshed', 'success');
            }
            
            this.debugLog('Content refresh completed');
        } catch (error) {
            console.error('Error refreshing content:', error);
            this.debugLog('Content refresh failed:', error.message);
        } finally {
            this.isRefreshing = false;
        }
    }

    debugLog(...args) {
        if (this.config.advanced.enableDebugLogging) {
            console.log('[DEBUG]', new Date().toISOString(), ...args);
        }
    }

    showNotification(message, type = 'info') {
        // Prevent duplicate notifications
        const existingNotifications = document.querySelectorAll('.notification');
        for (const existing of existingNotifications) {
            const existingMessage = existing.querySelector('.notification-message');
            if (existingMessage && existingMessage.textContent === message) {
                console.log('Duplicate notification prevented:', message);
                return; // Don't show duplicate
            }
        }
        
        // Create notification element
        const notification = document.createElement('div');
        const position = this.config.ui.notificationPosition || 'bottom-right';
        notification.className = `notification notification-${type} pos-${position}`;
        notification.innerHTML = `
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">✕</button>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show with animation
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 4000);
    }

    // Video Player Methods
    async playChannelContent(channel) {
        if (!channel.content || channel.content.length === 0) {
            alert('No content available for this channel');
            return;
        }

        const firstContent = channel.content[0];
        await this.playProgram(firstContent, channel);
    }

    async playProgram(program, channel, programIndex = -1, forceAutoPlay = false) {
        // Track current channel and position for prev/next/random
        this.currentChannel = channel;
        const schedule = this.generateProgramSchedule(channel);
        if (programIndex >= 0) {
            this.currentProgramIndex = programIndex;
        } else {
            // Find this program in the schedule by ratingKey + startTime
            const idx = schedule.findIndex(p =>
                p.ratingKey === program.ratingKey &&
                p.startTime?.getTime() === program.startTime?.getTime()
            );
            this.currentProgramIndex = idx >= 0 ? idx : 0;
        }

        // Route music playlists to the dedicated audio player
        if (channel.type === 'music-playlist') {
            return this.playAudio(program, channel, forceAutoPlay);
        }

        try {
            this.showVideoPlayer();
            this.showVideoLoading(true);

            console.log('=== PLAYING PROGRAM ===');
            console.log('Program data:', program);
            console.log('Channel data:', channel);
            console.log('Program ratingKey:', program.ratingKey);
            console.log('Program original content:', program.originalContent);
            
            let mediaItem = program;
            let streamUrl = null;
            
            // Use the original content if available for better metadata
            if (program.originalContent) {
                console.log('Using original content for playback');
                mediaItem = program.originalContent;
            }
            
            // Try to get detailed Plex metadata if we have a ratingKey
            const ratingKey = mediaItem.ratingKey || mediaItem.key;
            if (ratingKey) {
                try {
                    console.log('Fetching detailed metadata for ratingKey:', ratingKey);
                    const detailedInfo = await this.fetchPlexData(`/library/metadata/${ratingKey}`);
                    if (detailedInfo.MediaContainer.Metadata && detailedInfo.MediaContainer.Metadata[0]) {
                        const detailedItem = detailedInfo.MediaContainer.Metadata[0];
                        console.log('Got detailed media info:', detailedItem);
                        
                        // For episodes, preserve clean episode title from our expanded data
                        if (mediaItem.showTitle && mediaItem.title) {
                            console.log('Before merge - mediaItem:', mediaItem);
                            console.log('Before merge - detailedItem:', detailedItem);
                            
                            // Keep our clean episode title and metadata, but merge in any missing fields from detailed data
                            mediaItem = {
                                ...detailedItem,  // Detailed data for streaming
                                ...mediaItem,     // Our clean episode metadata (overrides detailed data)
                                // Ensure we keep essential playback fields from detailed data
                                Media: detailedItem.Media || mediaItem.Media,
                                ratingKey: detailedItem.ratingKey || mediaItem.ratingKey,
                                key: detailedItem.key || mediaItem.key
                            };
                            console.log('After merge - preserved episode data:', mediaItem);
                            console.log('Preserved clean episode title:', mediaItem.title);
                        } else {
                            // For non-episodes, use detailed data as-is
                            console.log('Non-episode detected, using detailed data as-is');
                            mediaItem = detailedItem;
                        }
                    }
                } catch (error) {
                    console.warn('Could not fetch detailed metadata:', error);
                }
            }

            // If item is a show (not an episode), resolve to first available episode
            if (mediaItem.type === 'show' || (mediaItem.key && mediaItem.key.endsWith('/children'))) {
                console.log('Item is a show — fetching first episode');
                const showKey = mediaItem.ratingKey || mediaItem.key?.match(/\/metadata\/(\d+)/)?.[1];
                if (showKey) {
                    try {
                        const seasons = await this.fetchPlexData(`/library/metadata/${showKey}/children`);
                        const firstSeason = (seasons.MediaContainer.Metadata || []).find(s => s.type === 'season');
                        if (firstSeason) {
                            const episodes = await this.fetchPlexData(`/library/metadata/${firstSeason.ratingKey}/children`);
                            const firstEpisode = (episodes.MediaContainer.Metadata || []).find(e => e.type === 'episode');
                            if (firstEpisode) {
                                console.log('Resolved to first episode:', firstEpisode.title);
                                mediaItem = firstEpisode;
                            }
                        }
                    } catch (e) {
                        console.warn('Could not resolve show to episode:', e);
                    }
                }
            }

            // Calculate EPG offset: how far into the program we currently are
            let startOffset = 0;
            if (this.config.playback.resumeFromCurrentPosition && program.startTime) {
                const elapsed = (new Date() - program.startTime) / 1000;
                if (elapsed > 0 && elapsed < program.duration * 60) {
                    startOffset = Math.floor(elapsed);
                    console.log(`Resuming from EPG position: ${startOffset}s into program`);
                }
            }

            // startOffset is used after stream loads (hls.js startPosition / canplay seek)
            streamUrl = await this.getStreamUrl(mediaItem, startOffset);

            console.log('Generated stream URL:', streamUrl);

            if (!streamUrl) {
                throw new Error('No valid stream URL found');
            }

            this.updateVideoInfo(mediaItem, channel);
            this.loadVideo(streamUrl, mediaItem, startOffset, forceAutoPlay);

        } catch (error) {
            console.error('Error playing program:', error);
            this.showVideoError(`Unable to load Plex video: ${error.message}. Using demo video instead.`);

            const demoUrl = this.getMockVideoUrl(program.title);
            const displayItem = mediaItem || program;
            this.updateVideoInfo(displayItem, channel);
            this.loadVideo(demoUrl, displayItem, 0);
        }
    }

    toggleGlobalShuffle() {
        this.globalShuffle = !this.globalShuffle;
        const btn = this.getElement('globalShuffleBtn');
        btn.classList.toggle('active', this.globalShuffle);
        btn.title = this.globalShuffle ? 'Shuffle all: ON — click to turn off' : 'Shuffle all channels';
        if (this.globalShuffle) this.playGlobalRandom();
    }

    randomizeChannelContent() {
        console.log('=== RANDOMIZING CHANNEL CONTENT ===');
        
        // Show progress feedback
        this.showProgress('Randomizing channel content...');
        
        // Add a randomization seed to each channel to break the deterministic shuffle
        this.channels.forEach(channel => {
            if (channel.content && channel.content.length > 1) {
                // Add or increment a randomization counter to change the channel's hash
                // This will make the deterministic shuffle in _generateStableSchedule produce different results
                channel.randomSeed = (channel.randomSeed || 0) + 1;
                console.log(`Randomizing ${channel.name}, new seed: ${channel.randomSeed}`);
            }
        });
        
        // Clear cached program schedules since the randomization seed has changed
        this.programScheduleCache = {};
        
        // Re-render the EPG with new randomized content
        this.renderEPG();
        
        // Show notification if enabled
        if (this.config.playback.showPlaybackNotifications) {
            this.showNotification('Channel content randomized', 'success');
        }
        
        // Hide progress bar
        setTimeout(() => {
            this.hideProgress();
        }, 300);
        
        console.log('Channel content randomization complete');
    }

    playGlobalRandom() {
        const visible = this.channels.filter(c => this.config.visibleChannels.has(c.id) && c.content?.length);
        if (!visible.length) return;
        const channel = visible[Math.floor(Math.random() * visible.length)];
        const schedule = this.generateProgramSchedule(channel);
        if (!schedule.length) return;
        const idx = Math.floor(Math.random() * schedule.length);
        this.playProgram(schedule[idx], channel, idx, true);
    }

    playNext() {
        if (this.globalShuffle) { this.playGlobalRandom(); return; }
        if (!this.currentChannel) return;
        const schedule = this.generateProgramSchedule(this.currentChannel);
        if (!schedule.length) return;
        const nextIndex = (this.currentProgramIndex + 1) % schedule.length;
        this.playProgram(schedule[nextIndex], this.currentChannel, nextIndex, true);
    }

    playPrevious() {
        if (!this.currentChannel) return;
        const schedule = this.generateProgramSchedule(this.currentChannel);
        if (!schedule.length) return;
        const prevIndex = (this.currentProgramIndex - 1 + schedule.length) % schedule.length;
        this.playProgram(schedule[prevIndex], this.currentChannel, prevIndex, true);
    }

    playRandom() {
        if (!this.currentChannel) return;
        const schedule = this.generateProgramSchedule(this.currentChannel);
        if (schedule.length <= 1) return;
        let randIndex;
        do { randIndex = Math.floor(Math.random() * schedule.length); }
        while (randIndex === this.currentProgramIndex);
        this.playProgram(schedule[randIndex], this.currentChannel, randIndex, true);
    }

    // ── Audio player ────────────────────────────────────────────

    async playAudio(program, channel, forceAutoPlay = false) {
        this.showAudioPlayer();
        let mediaItem = program.originalContent || program;

        // Fetch fresh Plex metadata for best track info
        const ratingKey = mediaItem.ratingKey || mediaItem.key;
        if (ratingKey) {
            try {
                const detail = await this.fetchPlexData(`/library/metadata/${ratingKey}`);
                const meta = detail.MediaContainer?.Metadata?.[0];
                if (meta) mediaItem = { ...meta, ...mediaItem, Media: meta.Media || mediaItem.Media };
            } catch (e) { /* use existing metadata */ }
        }

        this.currentAudioItem = mediaItem;
        this.updateAudioInfo(mediaItem, channel);

        const url = this.getAudioUrl(mediaItem);
        if (!url) {
            this.showNotification('Cannot find audio stream for this track', 'error');
            return;
        }
        this.loadAudio(url, forceAutoPlay);
    }

    getAudioUrl(mediaItem) {
        // Prefer direct part file (works for mp3, m4a, flac, ogg, wav)
        const part = mediaItem.Media?.[0]?.Part?.[0];
        if (part?.key) {
            return `${this.config.plexUrl}${part.key}?X-Plex-Token=${this.config.plexToken}`;
        }
        // Fallback to Plex file endpoint
        if (mediaItem.ratingKey) {
            return `${this.config.plexUrl}/library/metadata/${mediaItem.ratingKey}/file?X-Plex-Token=${this.config.plexToken}`;
        }
        return null;
    }

    getArtworkUrl(mediaItem) {
        const thumb = mediaItem.thumb || mediaItem.parentThumb || mediaItem.grandparentThumb;
        if (thumb) {
            return `${this.config.plexUrl}${thumb}?X-Plex-Token=${this.config.plexToken}&width=500&height=500`;
        }
        return null;
    }

    loadAudio(url, autoPlay = false) {
        if (!this.audioElement) {
            this.audioElement = document.getElementById('audioElement');
        }
        this.audioElement.src = url;
        this.audioElement.volume = (this.config.playback.defaultVolume || 80) / 100;
        this.audioElement.load();

        const seekbar = document.getElementById('audioSeekbar');
        const currentTimeEl = document.getElementById('audioCurrentTime');
        const durationEl = document.getElementById('audioDurationLabel');
        const playPauseBtn = document.getElementById('audioPlayPause');
        const miniPlayPauseBtn = document.getElementById('miniAudioPlayPause');

        const fmt = s => {
            if (!isFinite(s)) return '0:00';
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec.toString().padStart(2, '0')}`;
        };

        this.audioElement.ontimeupdate = () => {
            if (!this.audioElement.duration) return;
            const pct = (this.audioElement.currentTime / this.audioElement.duration) * 1000;
            seekbar.value = pct;
            currentTimeEl.textContent = fmt(this.audioElement.currentTime);
        };
        this.audioElement.ondurationchange = () => {
            durationEl.textContent = fmt(this.audioElement.duration);
        };
        this.audioElement.onplay = () => {
            playPauseBtn.textContent = '⏸';
            if (miniPlayPauseBtn) miniPlayPauseBtn.textContent = '⏸';
        };
        this.audioElement.onpause = () => {
            playPauseBtn.textContent = '▶';
            if (miniPlayPauseBtn) miniPlayPauseBtn.textContent = '▶';
        };
        this.audioElement.onended = () => this.playNext();

        if (autoPlay || this.config.playback.autoPlay) {
            this.audioElement.play().catch(() => {});
        }
    }

    updateAudioInfo(mediaItem, channel) {
        const title = mediaItem.title || 'Unknown Track';
        const artist = mediaItem.grandparentTitle || mediaItem.artist || mediaItem.originalTitle || '';
        const album = mediaItem.parentTitle || mediaItem.album || '';

        document.getElementById('audioTrackTitle').textContent = title;
        document.getElementById('audioArtistName').textContent = artist;
        document.getElementById('audioAlbumName').textContent = album;
        document.getElementById('audioChannelLabel').textContent = channel?.name || 'Music';
        document.getElementById('miniAudioTitle').textContent = title;
        document.getElementById('miniAudioArtist').textContent = artist;

        // Artwork
        const artUrl = this.getArtworkUrl(mediaItem);
        const artworkEl = document.getElementById('audioArtwork');
        const artworkBg = document.getElementById('audioArtworkBg');
        const placeholder = document.getElementById('audioArtworkPlaceholder');
        const miniArt = document.getElementById('miniAudioArtwork');

        if (artUrl) {
            artworkEl.src = artUrl;
            artworkEl.onload = () => {
                artworkEl.classList.add('loaded');
                placeholder.classList.add('hidden');
            };
            artworkEl.onerror = () => {
                artworkEl.classList.remove('loaded');
                placeholder.classList.remove('hidden');
            };
            artworkBg.style.backgroundImage = `url('${artUrl}')`;
            miniArt.src = artUrl;
        } else {
            artworkEl.classList.remove('loaded');
            artworkBg.style.backgroundImage = '';
            placeholder.classList.remove('hidden');
            miniArt.src = '';
        }
    }

    showAudioPlayer() {
        document.getElementById('audioPlayerModal').classList.add('show');
        document.getElementById('miniAudioPlayer').classList.remove('show');
        this.isAudioMinimized = false;
    }

    minimizeAudioPlayer() {
        document.getElementById('audioPlayerModal').classList.remove('show');
        document.getElementById('miniAudioPlayer').classList.add('show');
        this.isAudioMinimized = true;
    }

    restoreAudioPlayer() {
        document.getElementById('audioPlayerModal').classList.add('show');
        document.getElementById('miniAudioPlayer').classList.remove('show');
        this.isAudioMinimized = false;
    }

    closeAudioPlayer() {
        document.getElementById('audioPlayerModal').classList.remove('show');
        document.getElementById('miniAudioPlayer').classList.remove('show');
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
        }
        this.currentAudioItem = null;
        this.isAudioMinimized = false;
    }

    setupAudioPlayerListeners() {
        document.getElementById('closeAudioPlayer').addEventListener('click', () => this.closeAudioPlayer());
        document.getElementById('minimizeAudioPlayer').addEventListener('click', () => this.minimizeAudioPlayer());
        document.getElementById('restoreAudioPlayer').addEventListener('click', () => this.restoreAudioPlayer());
        document.getElementById('closeAudioPlayerMini').addEventListener('click', () => this.closeAudioPlayer());

        document.getElementById('audioPlayPause').addEventListener('click', () => {
            if (!this.audioElement) return;
            this.audioElement.paused ? this.audioElement.play() : this.audioElement.pause();
        });
        document.getElementById('miniAudioPlayPause').addEventListener('click', () => {
            if (!this.audioElement) return;
            this.audioElement.paused ? this.audioElement.play() : this.audioElement.pause();
        });

        document.getElementById('audioPrev').addEventListener('click', () => this.playPrevious());
        document.getElementById('audioNext').addEventListener('click', () => this.playNext());
        document.getElementById('audioRandom').addEventListener('click', () => this.playRandom());
        document.getElementById('miniAudioPrev').addEventListener('click', () => this.playPrevious());
        document.getElementById('miniAudioNext').addEventListener('click', () => this.playNext());

        document.getElementById('audioSeekbar').addEventListener('input', (e) => {
            if (!this.audioElement?.duration) return;
            this.audioElement.currentTime = (e.target.value / 1000) * this.audioElement.duration;
        });

        document.getElementById('audioVolumeSlider').addEventListener('input', (e) => {
            if (this.audioElement) this.audioElement.volume = e.target.value / 100;
        });
        // Set initial volume slider to match config
        document.getElementById('audioVolumeSlider').value = this.config.playback.defaultVolume || 80;

        // Keyboard shortcuts for audio player
        window.addEventListener('keydown', (e) => {
            const audioModal = document.getElementById('audioPlayerModal');
            const isAudioVisible = audioModal.classList.contains('show') || this.isAudioMinimized;
            if (!isAudioVisible || !this.audioElement) return;
            // Don't hijack when video player is open
            const videoModal = document.getElementById('videoPlayerModal');
            if (videoModal.classList.contains('show')) return;
            if (e.key === 'Escape') {
                if (audioModal.classList.contains('show')) this.minimizeAudioPlayer();
            } else if (e.key === ' ') {
                e.preventDefault();
                this.audioElement.paused ? this.audioElement.play() : this.audioElement.pause();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.playNext();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.playPrevious();
            }
        });
    }

    async getStreamUrl(mediaItem, startOffset = 0) {
        console.log('=== GETTING STREAM URL ===');
        console.log('Media item:', mediaItem);
        
        // If no valid Plex data, return mock
        if (!mediaItem.ratingKey && !mediaItem.key) {
            console.log('No rating key, using mock video');
            return this.getMockVideoUrl(mediaItem.title);
        }

        const ratingKey = mediaItem.ratingKey || mediaItem.key;
        console.log('Using rating key:', ratingKey);
        
        try {
            // Method 1: Try direct stream URL via generic file endpoint
            const directStreamUrl = `${this.config.plexUrl}/library/metadata/${ratingKey}/file?X-Plex-Token=${this.config.plexToken}`;
            try {
                const testResponse = await fetch(directStreamUrl, { method: 'HEAD' });
                if (testResponse.ok) {
                    console.log('Using direct stream URL');
                    return directStreamUrl;
                }
            } catch (e) {
                console.warn('Direct stream test failed:', e);
            }

            // Method 2: Direct file access via Media.Part.key (compatible formats only)
            const compatibleContainers = ['mp4', 'webm', 'ogg', 'mov'];
            const compatibleVideoCodecs = ['h264', 'vp8', 'vp9', 'av1'];
            if (mediaItem.Media?.[0]?.Part?.[0]) {
                const media = mediaItem.Media[0];
                const part = media.Part[0];
                const container = (part.container || media.container || '').toLowerCase();
                const videoCodec = (media.videoCodec || '').toLowerCase();
                if (compatibleContainers.includes(container) && compatibleVideoCodecs.includes(videoCodec)) {
                    const directUrl = `${this.config.plexUrl}${part.key}?X-Plex-Token=${this.config.plexToken}`;
                    try {
                        const testResponse = await fetch(directUrl, { method: 'HEAD' });
                        if (testResponse.ok) {
                            console.log('Using direct part URL');
                            return directUrl;
                        }
                    } catch (e) {
                        console.warn('Direct file access failed:', e);
                    }
                } else {
                    console.log(`Container '${container}' / codec '${videoCodec}' not browser-compatible — using transcode`);
                }
            }

            // Method 3: HLS transcode via Plex universal endpoint.
            // Seeking to startOffset is handled after load via hls.js startPosition
            // and the canplay currentTime seek — the Plex `offset` parameter is not
            // used because it causes manifest errors on many Plex versions.
            // Unique session per request prevents stale-session conflicts on retry
            const sessionId = `webapp-${mediaItem.ratingKey || 'unknown'}-${Date.now()}`;
            this.currentPlexSessionId = sessionId;
            const transcodeParams = new URLSearchParams({
                path: `/library/metadata/${ratingKey}`,
                mediaIndex: '0',
                partIndex: '0',
                protocol: 'hls',
                directPlay: '0',
                directStream: '0',
                videoCodec: 'h264',
                audioCodec: 'aac',
                maxVideoBitrate: '8000',
                videoResolution: '1920x1080',
                session: sessionId,
                'X-Plex-Token': this.config.plexToken,
                'X-Plex-Client-Identifier': 'stationarr-webapp',
                'X-Plex-Product': 'Stationarr',
                'X-Plex-Platform': 'Chrome',
                'X-Plex-Device': 'Web',
                'X-Plex-Device-Name': 'Stationarr',
                'X-Plex-Version': '1.0.0',
            });
            const transcodeUrl = `${this.config.plexUrl}/video/:/transcode/universal/start.m3u8?${transcodeParams}`;
            console.log(`Using transcode URL`);
            return transcodeUrl;
            
        } catch (error) {
            console.error('Error generating stream URL:', error);
            console.log('Falling back to mock video');
            return this.getMockVideoUrl(mediaItem.title);
        }
    }

    getMockVideoUrl(title) {
        const mockVideos = {
            'Inception': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            'The Matrix': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
            'Interstellar': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        };

        return mockVideos[title] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    }

    showVideoPlayer() {
        const videoModal = document.getElementById('videoPlayerModal');
        const minimizedPlayer = document.getElementById('minimizedPlayer');
        
        videoModal.classList.add('show');
        minimizedPlayer.classList.remove('show');
        this.isMinimized = false;
    }

    updateVideoInfo(mediaItem, channel) {
        // More robust episode detection - check multiple ways episodes might be identified
        const isEpisode = (mediaItem.showTitle && mediaItem.seasonTitle) || 
                         (mediaItem.type === 'episode') ||
                         (mediaItem.showTitle && (mediaItem.seasonIndex || mediaItem.episodeIndex)) ||
                         (mediaItem.parentTitle && mediaItem.grandparentTitle); // Plex standard fields
        
        console.log('Video info debug:', {
            title: mediaItem.title,
            titleSort: mediaItem.titleSort,
            originalTitle: mediaItem.originalTitle,
            showTitle: mediaItem.showTitle,
            seasonTitle: mediaItem.seasonTitle,
            seasonIndex: mediaItem.seasonIndex,
            episodeIndex: mediaItem.episodeIndex,
            type: mediaItem.type,
            parentTitle: mediaItem.parentTitle,
            grandparentTitle: mediaItem.grandparentTitle,
            isEpisode: isEpisode
        });
        
        if (isEpisode) {
            // Get season and episode numbers from multiple possible sources
            const seasonNum = mediaItem.seasonIndex || 
                             mediaItem.parentIndex || 
                             mediaItem.seasonNumber || 
                             (mediaItem.seasonTitle && mediaItem.seasonTitle.match(/\d+/)?.[0]) || 
                             '?';
            const episodeNum = mediaItem.episodeIndex || 
                              mediaItem.index || 
                              mediaItem.episodeNumber || 
                              '?';
            
            // Get show title from multiple possible sources
            const showTitle = mediaItem.showTitle || 
                             mediaItem.grandparentTitle || 
                             (mediaItem.originalShowData && mediaItem.originalShowData.title) ||
                             'Unknown Series';
            
            // For TV episodes, show series name, episode title, and season/episode info
            const seasonEpisode = `S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`;
            document.getElementById('videoTitle').textContent = `${showTitle}: ${mediaItem.title} (${seasonEpisode})`;
            // Show channel in meta line
            document.getElementById('videoMeta').textContent = `${channel.name} • Episode`;
            
            // Mini player shows series name and episode info
            document.getElementById('miniTitle').textContent = 
                `${showTitle}: ${mediaItem.title} (${seasonEpisode})`;
        } else {
            // For movies and other content
            document.getElementById('videoTitle').textContent = mediaItem.title || mediaItem.name || 'Unknown Title';
            document.getElementById('videoMeta').textContent = `${channel.name} • ${mediaItem.type || 'Media'}`;
            
            document.getElementById('miniTitle').textContent = mediaItem.title || 'Unknown Title';
        }
        
        document.getElementById('videoSummary').textContent = mediaItem.summary || 'No description available.';
        document.getElementById('videoDuration').textContent = mediaItem.duration ? 
            this.formatDuration(mediaItem.duration) : '--';
        document.getElementById('videoYear').textContent = mediaItem.year || '--';
        document.getElementById('videoRating').textContent = mediaItem.rating || '--';
    }

    getPlaybackPositionKey(mediaItem) {
        // Create a unique key for this media item
        const ratingKey = mediaItem.ratingKey || mediaItem.key || mediaItem.title;
        return `playback_position_${ratingKey}`;
    }

    async cleanupPlexSessions() {
        try {
            // Destroy any active hls.js instance
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
            // Send a stop command to any active transcode sessions
            if (this.currentPlexSessionId) {
                const stopUrl = `${this.config.plexUrl}/video/:/transcode/universal/stop?session=${this.currentPlexSessionId}&X-Plex-Token=${this.config.plexToken}`;
                fetch(stopUrl, { method: 'GET' }).catch(() => {});
                console.log('Cleaned up Plex session:', this.currentPlexSessionId);
                this.currentPlexSessionId = null;
            }
        } catch (error) {
            // Ignore cleanup errors
            console.warn('Session cleanup failed:', error);
        }
    }

    savePlaybackPosition(mediaItem, currentTime) {
        if (!this.config.playback.rememberPosition) return;
        
        const key = this.getPlaybackPositionKey(mediaItem);
        const positionData = {
            currentTime: currentTime,
            timestamp: Date.now(),
            title: mediaItem.title || 'Unknown Title'
        };
        
        try {
            localStorage.setItem(key, JSON.stringify(positionData));
            console.log(`Saved playback position for "${mediaItem.title}": ${this.formatDuration(currentTime * 1000)}`);
        } catch (error) {
            console.warn('Failed to save playback position:', error);
        }
    }

    getPlaybackPosition(mediaItem) {
        if (!this.config.playback.rememberPosition) return 0;
        
        const key = this.getPlaybackPositionKey(mediaItem);
        
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const positionData = JSON.parse(saved);
                
                // Only restore positions that are less than 7 days old
                const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
                if (Date.now() - positionData.timestamp < maxAge) {
                    console.log(`Restored playback position for "${mediaItem.title}": ${this.formatDuration(positionData.currentTime * 1000)}`);
                    return positionData.currentTime;
                } else {
                    // Clean up old position
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            console.warn('Failed to get playback position:', error);
        }
        
        return 0;
    }

    loadVideo(streamUrl, mediaItem, startOffset = 0, forceAutoPlay = false) {
        this.videoPlayer = document.getElementById('videoPlayer');
        const miniVideo = document.getElementById('miniVideo');

        console.log('Loading video from:', streamUrl);

        // Store current media item for playback position tracking
        this.currentMediaItem = mediaItem;
        this.positionRestored = false;
        
        // Clear any existing event listeners to prevent duplicates
        const newVideoPlayer = this.videoPlayer.cloneNode(true);
        this.videoPlayer.parentNode.replaceChild(newVideoPlayer, this.videoPlayer);
        this.videoPlayer = newVideoPlayer;
        
        // Set up error handling with retry logic
        let retryCount = 0;
        const maxRetries = 2;
        
        const setupVideoEvents = () => {
            this.videoPlayer.addEventListener('loadstart', () => {
                console.log('Video load started');
                this.showVideoLoading(true);
            });
            
            this.videoPlayer.addEventListener('canplay', () => {
                console.log('Video can play');
                this.showVideoLoading(false);

                if (!this.positionRestored) {
                    this.positionRestored = true;

                    // Determine seek target: EPG offset > saved position > none.
                    // Setting currentTime after canplay causes hls.js to request
                    // segments at that position; Plex restarts its transcode from
                    // the nearest keyframe and serves segments from there.
                    let seekTo = -1;
                    let seekMsg = null;
                    if (startOffset > 0) {
                        seekTo = startOffset;
                        seekMsg = `Resuming from ${this.formatDuration(startOffset * 1000)} into broadcast`;
                    } else {
                        const savedPosition = this.getPlaybackPosition(mediaItem);
                        if (savedPosition > 10) {
                            seekTo = savedPosition;
                            seekMsg = `Resumed from ${this.formatDuration(savedPosition * 1000)}`;
                        }
                    }

                    const applySeek = () => {
                        if (seekTo > 0) {
                            this.videoPlayer.currentTime = seekTo;
                            if (this.config.playback.showPlaybackNotifications && seekMsg) {
                                this.showNotification(seekMsg, 'info');
                            }
                        }
                    };

                    if (this.config.playback.autoPlay || forceAutoPlay) {
                        this.videoPlayer.play().then(() => {
                            applySeek();
                        }).catch(error => {
                            console.warn('Auto-play failed:', error);
                            applySeek();
                        });
                    } else {
                        applySeek();
                    }
                }
            });
            
            this.videoPlayer.addEventListener('error', (e) => {
                console.error('Video error:', e, this.videoPlayer.error);
                console.error('Stream URL that failed:', streamUrl);
                console.error('Media item:', mediaItem);
                
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`Retrying video load from beginning (attempt ${retryCount}/${maxRetries})`);
                    this.cleanupPlexSessions();
                    // Reset so the retry's canplay handler will auto-play
                    this.positionRestored = false;
                    if (startOffset > 0 && this.config.playback.showPlaybackNotifications) {
                        this.showNotification('Couldn\'t jump to broadcast position — starting from beginning', 'info');
                    }
                    setTimeout(async () => {
                        try {
                            // Retry from start (startOffset=0) — seeking into the transcode failed
                            const newUrl = await this.getStreamUrl(mediaItem, 0);
                            console.log('Retrying with new stream URL:', newUrl);
                            if (newUrl.endsWith('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
                                if (this.hlsInstance) this.hlsInstance.destroy();
                                this.hlsInstance = new Hls();
                                this.hlsInstance.loadSource(newUrl);
                                this.hlsInstance.attachMedia(this.videoPlayer);
                            } else {
                                this.videoPlayer.src = newUrl;
                                this.videoPlayer.load();
                            }
                        } catch (err) {
                            console.error('Retry failed:', err);
                            this.showVideoError('Video could not be loaded. Check your Plex server connection.');
                        }
                    }, 1500);
                } else {
                    this.showVideoError('Video could not be loaded. Check your Plex server connection.');
                }
            });
            
            this.videoPlayer.addEventListener('play', () => {
                console.log('Video playing');
                if (!miniVideo.paused) miniVideo.pause();
                this.updateMiniPlayButton('⏸');
            });
            
            this.videoPlayer.addEventListener('pause', () => {
                console.log('Video paused');
                this.updateMiniPlayButton('▶');
                
                // Save position when pausing
                if (this.currentMediaItem) {
                    this.savePlaybackPosition(this.currentMediaItem, this.videoPlayer.currentTime);
                }
            });
            
            // Save playback position periodically during playback
            let lastSaveTime = 0;
            this.videoPlayer.addEventListener('timeupdate', () => {
                if (!this.currentMediaItem) return;

                // Save every 30 seconds to avoid excessive localStorage writes
                const currentTime = this.videoPlayer.currentTime;
                if (currentTime - lastSaveTime >= 30) {
                    this.savePlaybackPosition(this.currentMediaItem, currentTime);
                    lastSaveTime = currentTime;
                }
            });
            
            // Clear saved position when video ends
            this.videoPlayer.addEventListener('ended', () => {
                if (this.currentMediaItem) {
                    const key = this.getPlaybackPositionKey(this.currentMediaItem);
                    localStorage.removeItem(key);
                    console.log(`Cleared playback position for completed "${this.currentMediaItem.title}"`);
                    if (this.config.playback.showPlaybackNotifications) {
                        this.showNotification('Video completed', 'info');
                    }
                }
                if (this.globalShuffle) this.playGlobalRandom();
            });
            
            miniVideo.addEventListener('play', () => {
                if (!this.videoPlayer.paused) this.videoPlayer.pause();
            });
        };
        
        setupVideoEvents();
        
        // Handle different stream types
        if (streamUrl.endsWith('.m3u8')) {
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                // Chrome/Firefox: use hls.js
                if (this.hlsInstance) {
                    this.hlsInstance.destroy();
                }
                // Plex's offset param starts the transcode at the right position;
                // hls.js plays from segment 0 of the manifest (= the offset position).
                this.hlsInstance = new Hls();
                this.hlsInstance.loadSource(streamUrl);
                this.hlsInstance.attachMedia(this.videoPlayer);
                this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('hls.js fatal error:', data);
                    }
                });
            } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari: native HLS
                this.videoPlayer.src = streamUrl;
                this.videoPlayer.load();
            } else {
                console.error('HLS not supported in this browser');
                this.showVideoError('HLS streaming is not supported in this browser.');
                return;
            }
        } else {
            // Direct file or other format
            this.videoPlayer.src = streamUrl;
            this.videoPlayer.load();
        }

        miniVideo.src = streamUrl;
    }

    showVideoLoading(show) {
        const loading = document.getElementById('videoLoading');
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    showVideoError(message) {
        this.showVideoLoading(false);
        console.error('Video error:', message);
        
        // Show error in the video area instead of an alert
        const videoWrapper = document.querySelector('.video-wrapper');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'video-error';
        errorDiv.innerHTML = `
            <div class="error-icon">⚠️</div>
            <h3>Playback Error</h3>
            <p>${message}</p>
            <button onclick="this.parentElement.remove()" class="error-close">Dismiss</button>
        `;
        
        // Remove any existing errors
        const existingError = videoWrapper.querySelector('.video-error');
        if (existingError) {
            existingError.remove();
        }
        
        videoWrapper.appendChild(errorDiv);
        
        // Auto-remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 5000);
    }

    minimizeVideoPlayer() {
        const videoModal = document.getElementById('videoPlayerModal');
        const minimizedPlayer = document.getElementById('minimizedPlayer');
        const miniVideo = document.getElementById('miniVideo');
        
        videoModal.classList.remove('show');
        minimizedPlayer.classList.add('show');
        this.isMinimized = true;
        
        if (this.videoPlayer && !this.videoPlayer.paused) {
            miniVideo.currentTime = this.videoPlayer.currentTime;
            miniVideo.play();
            this.videoPlayer.pause();
        }
    }

    restoreVideoPlayer() {
        const videoModal = document.getElementById('videoPlayerModal');
        const minimizedPlayer = document.getElementById('minimizedPlayer');
        const miniVideo = document.getElementById('miniVideo');
        
        minimizedPlayer.classList.remove('show');
        videoModal.classList.add('show');
        this.isMinimized = false;
        
        if (miniVideo && !miniVideo.paused) {
            this.videoPlayer.currentTime = miniVideo.currentTime;
            this.videoPlayer.play();
            miniVideo.pause();
        }
    }

    closeVideoPlayer() {
        const videoModal = document.getElementById('videoPlayerModal');
        const minimizedPlayer = document.getElementById('minimizedPlayer');
        
        // Save final playback position before closing
        if (this.videoPlayer && this.currentMediaItem && this.videoPlayer.currentTime > 0) {
            this.savePlaybackPosition(this.currentMediaItem, this.videoPlayer.currentTime);
        }
        
        videoModal.classList.remove('show');
        minimizedPlayer.classList.remove('show');

        // Reset theatre mode
        const container = document.querySelector('.video-player-container');
        if (container) this.stopTheatreMouseTimer(container);
        container?.classList.remove('theatre-mode');
        const theatreBtn = document.getElementById('theatreModeBtn');
        if (theatreBtn) { theatreBtn.classList.remove('active'); theatreBtn.title = 'Fill browser window'; }
        
        if (this.videoPlayer) {
            this.videoPlayer.pause();
            this.videoPlayer.src = '';
        }
        
        const miniVideo = document.getElementById('miniVideo');
        if (miniVideo) {
            miniVideo.pause();
            miniVideo.src = '';
        }
        
        this.videoPlayer = null;
        this.currentMediaItem = null;
        this.positionRestored = false;
        this.isMinimized = false;
        
        // Clean up any active Plex sessions when closing
        this.cleanupPlexSessions();
    }

    startTheatreMouseTimer(container) {
        // Show panels immediately when entering theatre mode
        container.classList.add('panels-visible');

        const onMouseMove = () => {
            container.classList.add('panels-visible');
            clearTimeout(this._theatreHideTimer);
            this._theatreHideTimer = setTimeout(() => {
                container.classList.remove('panels-visible');
            }, 2500);
        };

        // Store reference so we can remove it later
        container._theatreMouseMove = onMouseMove;
        container.addEventListener('mousemove', onMouseMove);

        // Start initial hide timer
        this._theatreHideTimer = setTimeout(() => {
            container.classList.remove('panels-visible');
        }, 2500);
    }

    stopTheatreMouseTimer(container) {
        clearTimeout(this._theatreHideTimer);
        if (container._theatreMouseMove) {
            container.removeEventListener('mousemove', container._theatreMouseMove);
            delete container._theatreMouseMove;
        }
        container.classList.remove('panels-visible');
    }

    togglePlayback() {
        if (!this.videoPlayer) return;
        
        if (this.isMinimized) {
            this.toggleMiniPlayback();
        } else {
            if (this.videoPlayer.paused) {
                this.videoPlayer.play();
            } else {
                this.videoPlayer.pause();
            }
        }
    }

    toggleMiniPlayback() {
        const miniVideo = document.getElementById('miniVideo');
        
        if (miniVideo.paused) {
            miniVideo.play();
            this.updateMiniPlayButton('⏸');
        } else {
            miniVideo.pause();
            this.updateMiniPlayButton('▶');
        }
    }

    updateMiniPlayButton(icon) {
        document.getElementById('miniPlayPause').textContent = icon;
    }

    showChannelContextMenu(event, channel) {
        const menu = document.getElementById('channelContextMenu');
        
        // Position the menu
        menu.style.display = 'block';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        
        // Store the current channel for later use
        menu.dataset.channelId = channel.id;
        menu.dataset.channelType = channel.type;
        
        // Adjust position if menu goes off-screen
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (menuRect.right > viewportWidth) {
            menu.style.left = (event.pageX - menuRect.width) + 'px';
        }
        if (menuRect.bottom > viewportHeight) {
            menu.style.top = (event.pageY - menuRect.height) + 'px';
        }
        
        // Close menu when clicking elsewhere
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        
        // Use setTimeout to prevent immediate closure
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 10);
    }
    
    removeChannel(channelId, channelType) {
        console.log('Removing channel:', channelId, 'of type:', channelType);
        
        // Hide context menu immediately
        document.getElementById('channelContextMenu').style.display = 'none';
        
        // Show notification immediately
        if (this.config.playback.showPlaybackNotifications) {
            this.showNotification('Channel removed', 'success');
        }
        
        // Remove channel from UI immediately
        const channelElement = document.querySelector(`.channel-item[data-channel-id="${channelId}"]`);
        const epgChannelRow = document.querySelector(`.channel-row[data-channel-id="${channelId}"]`);
        
        if (channelElement) {
            // Add removal animation
            channelElement.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            channelElement.style.opacity = '0';
            channelElement.style.transform = 'translateX(-20px)';
            setTimeout(() => channelElement.remove(), 200);
        }
        
        if (epgChannelRow) {
            // Add removal animation for EPG row
            epgChannelRow.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            epgChannelRow.style.opacity = '0';
            epgChannelRow.style.transform = 'translateX(-20px)';
            setTimeout(() => epgChannelRow.remove(), 200);
        }
        
        // Update configuration in background (no need to wait)
        this.config.visibleChannels.delete(channelId);
        
        // Remove from the appropriate visible channels set based on type
        if (channelType === 'library') {
            this.config.selectedLibraries.delete(channelId);
        } else if (channelType === 'video-playlist') {
            this.config.selectedVideoPlaylists.delete(channelId);
        } else if (channelType === 'music-playlist') {
            this.config.selectedMusicPlaylists.delete(channelId);
        } else if (channelType === 'category') {
            this.config.selectedCategories.delete(channelId);
        } else if (channelType === 'collection') {
            this.config.selectedCollections.delete(channelId);
        }
        
        // Update internal channels array
        this.channels = this.channels.filter(channel => channel.id !== channelId);
        
        // Save configuration in background
        this.saveSettings();
        
        console.log('Channel removed instantly from UI');
    }

    formatDuration(duration) {
        const minutes = Math.floor(duration / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PlexStationarr();
});