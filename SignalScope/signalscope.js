//////////////////////////////////////////////////////////////////////////////////////
///                                                                                ///
///  SIGNAL SCOPE FOR FM-DX-WEBSERVER (V0.5.4)                                     ///
///                                                                                ///
///  RF signal and audio modulation meter with broadcast-style status indicators.  ///
///                                                                                ///
///  Features: RF meter, audio meter, peak hold, ST/RDS/CLIP LEDs, compact mode    ///
///  and native FM-DX Webserver theme integration.                                 ///
///                                                                                ///
///  Developed in Finland by Janne Heinikangas / JanneDX                           ///
///                                                                                ///
///  Feedback and ideas are welcome!                                               ///
///                                                                                ///
///  73! JanneDX                                                                   ///
///                                                                                ///
//////////////////////////////////////////////////////////////////////////////////////

(() => {
    'use strict';

    const pluginName = 'Signal Scope';
    const pluginVersion = '0.5.4';
    const AUDIO_SENSITIVITY = 520;
    const AUDIO_NOISE_FLOOR = 0.012;
    const CLIP_THRESHOLD = 98;
    const COMPACT_MODE = false;

    const STORAGE_THEME = 'SIGNAL_SCOPE_THEME';
    const STORAGE_METER_STYLE = 'SIGNAL_SCOPE_METER_STYLE';

    const STORAGE_GLOW = 'SIGNAL_SCOPE_GLOW';
    const STORAGE_GLASS = 'SIGNAL_SCOPE_GLASS';
    const STORAGE_SIZE = 'SIGNAL_SCOPE_SIZE';
    const STORAGE_PEAK_DECAY = 'SIGNAL_SCOPE_PEAK_DECAY';
    const STORAGE_VALUE_TEXT = 'SIGNAL_SCOPE_VALUE_TEXT';

    const DEFAULT_THEME = 'webserver';
    const DEFAULT_METER_STYLE = 'classic';

    const DEFAULT_GLOW = 'normal';
    const DEFAULT_GLASS = 'off';
    const DEFAULT_SIZE = 'normal';
    const DEFAULT_PEAK_DECAY = 'normal';
    const DEFAULT_VALUE_TEXT = 'off';

    const VALID_THEMES = [
        'webserver',
        'matrixGreen',
        'dxGreen',
        'amberOrange',
        'arcticCyan',
        'nightwishPurple',
        'crazyCitrus'
    ];

    const VALID_METER_STYLES = [
        'classic',
        'segmented',
        'led',
        'thin',
        'neon'
    ];

    const VALID_GLOW_LEVELS = [
        'soft',
        'normal',
        'strong'
    ];

    const VALID_GLASS_MODES = [
        'off',
        'on'
    ];

    const VALID_SIZE_MODES = [
        'mini',
        'normal',
        'xl'
    ];

    const VALID_PEAK_DECAY = [
        'fast',
        'normal',
        'slow'
    ];

    const VALID_VALUE_TEXT = [
        'off',
        'on'
    ];

    const SIGNAL_SCOPE_THEMES = {
        webserver: {
            name: 'Webserver Theme',
            low: null,
            mid: null,
            high: null
        },
        matrixGreen: {
            name: 'Matrix Green',
            low: '#00ff66',
            mid: '#9dff00',
            high: '#ffd000'
        },
        dxGreen: {
            name: 'DX Green',
            low: '#54c750',
            mid: '#9dff7a',
            high: '#fff07a'
        },
        amberOrange: {
            name: 'Amber Orange',
            low: '#fb923c',
            mid: '#ffaa00',
            high: '#ffd166'
        },
        arcticCyan: {
            name: 'Arctic Cyan',
            low: '#22d3ee',
            mid: '#7dd3fc',
            high: '#e0faff'
        },
        nightwishPurple: {
            name: 'Nightwish Purple',
            low: '#9d7cff',
            mid: '#c084fc',
            high: '#f0abfc'
        },
        crazyCitrus: {
            name: 'Crazy Citrus',
            low: '#d7ff00',
            mid: '#ffe600',
            high: '#ff9d00'
        }
    };
    let activeThemeName = loadThemeName();
    let activeMeterStyle = loadMeterStyle();

    let activeGlowLevel = loadGlowLevel();
    let activeGlassMode = loadGlassMode();
    let activeSizeMode = loadSizeMode();
    let activePeakDecay = loadPeakDecay();
    let activeValueText = loadValueText();
    let themeTransition = 0;

    const pluginSetupOnlyNotify = true;
    const CHECK_FOR_UPDATES = true;
    const pluginHomepageUrl = 'https://github.com/fmatic/SignalScope/releases';
    const pluginUpdateUrl = 'https://raw.githubusercontent.com/fmatic/SignalScope/main/SignalScope/signalscope.js';

    let stereoActive = false;
    let monoActive = false;
    let forcedMonoActive = false;
    let rdsActive = false;
    let rdsBlink = 0;

    let ledFadeST = 0;
    let ledFadeMO = 0;
    let ledFadeRDS = 0;
    let ledFadeCLIP = 0;

    let clipActive = false;
    let clipHold = 0;
    let canvas;
    let ctx;

    let targetS = 0;
    let displayS = 0;
    let targetA = 0;
    let displayA = 0;

    let audioContext;
    let analyser;
    let dataArray;
    let audioConnected = false;

    let peakS = 0;
    let peakA = 0;

    let settingsOpen = false;
    let settingsPanel = null;

    let settingsOutsideHandler = null;
    let settingsKeyHandler = null;

    if (CHECK_FOR_UPDATES) {
        checkUpdate(pluginSetupOnlyNotify, pluginName, pluginHomepageUrl, pluginUpdateUrl);
    }

    document.addEventListener('DOMContentLoaded', () => {
        createPanel();
        initAudio();
        startRenderLoop();

        // Left for debugging purpose
        // console.log(`[${pluginName}] v${pluginVersion} loaded`);
    });

    function cssVar(name, fallback) {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();

        return value || fallback;
    }

    function safeLSGet(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function safeLSSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {}
    }

    function loadEnum(key, fallback, allowed) {
        const value = safeLSGet(key);

        if (!value || !allowed.includes(value)) {
            return fallback;
        }

        return value;
    }

    function loadThemeName() {
        return loadEnum(STORAGE_THEME, DEFAULT_THEME, VALID_THEMES);
    }

    function loadMeterStyle() {
        const value = safeLSGet(STORAGE_METER_STYLE);

        if (value === 'minimal') {
            safeLSSet(STORAGE_METER_STYLE, 'thin');
            return 'thin';
        }

        return loadEnum(STORAGE_METER_STYLE, DEFAULT_METER_STYLE, VALID_METER_STYLES);
    }

    function getActiveThemePalette() {
        const selected = SIGNAL_SCOPE_THEMES[activeThemeName];

        if (selected && selected.low && selected.mid && selected.high) {
            return selected;
        }

        return {
            name: 'Webserver Theme',
            low: cssVar('--color-5', '#00ff66'),
            mid: '#9dff00',
            high: '#ffd000'
        };
    }

    function loadGlowLevel() {
        return loadEnum(STORAGE_GLOW, DEFAULT_GLOW, VALID_GLOW_LEVELS);
    }

    function loadGlassMode() {
        return loadEnum(STORAGE_GLASS, DEFAULT_GLASS, VALID_GLASS_MODES);
    }

    function loadSizeMode() {
        return loadEnum(STORAGE_SIZE, DEFAULT_SIZE, VALID_SIZE_MODES);
    }

    function loadPeakDecay() {
        return loadEnum(STORAGE_PEAK_DECAY, DEFAULT_PEAK_DECAY, VALID_PEAK_DECAY);
    }

    function loadValueText() {
        return loadEnum(STORAGE_VALUE_TEXT, DEFAULT_VALUE_TEXT, VALID_VALUE_TEXT);
    }

    function getThemeColors() {
        const palette = getActiveThemePalette();

        return {
            text: cssVar('--color-text', '#d9ffff'),
            low: palette.low,
            mid: palette.mid,
            high: palette.high,
            danger: '#ff3030',
            panelBg: cssVar('--color-2-transparent', 'rgba(10, 25, 28, 0.95)'),
            border: cssVar('--color-3-transparent', 'rgba(200, 255, 255, 0.16)')
        };
    }

    function getGlowMultiplier() {
        if (activeGlowLevel === 'soft') {
            return 0.55;
        }

        if (activeGlowLevel === 'strong') {
            return 1.55;
        }

        return 1.0;
    }

    function getPeakDecayRates() {
        if (activePeakDecay === 'fast') {
            return {
                signal: 0.18,
                audio: 0.24
            };
        }

        if (activePeakDecay === 'slow') {
            return {
                signal: 0.045,
                audio: 0.07
            };
        }

        return {
            signal: 0.09,
            audio: 0.14
        };
    }

    function getSizeConfig() {
        if (activeSizeMode === 'mini') {
            return {
                panelHeight: '96px',
                canvasWidth: 290,
                canvasHeight: 64,
                canvasCssWidth: '270px',
                canvasCssHeight: '64px',
                titleFontSize: '18px'
            };
        }

        if (activeSizeMode === 'xl') {
            return {
                panelHeight: '145px',
                canvasWidth: 360,
                canvasHeight: 86,
                canvasCssWidth: '98%',
                canvasCssHeight: '86px',
                titleFontSize: '30px'
            };
        }

        return {
            panelHeight: COMPACT_MODE ? '96px' : '123px',
            canvasWidth: 320,
            canvasHeight: COMPACT_MODE ? 44 : 74,
            canvasCssWidth: COMPACT_MODE ? '260px' : '90%',
            canvasCssHeight: COMPACT_MODE ? '44px' : '74px',
            titleFontSize: COMPACT_MODE ? '22px' : ''
        };
    }

    function applyGlassMode(panel) {
        if (activeGlassMode === 'on') {

            panel.style.background =
                'linear-gradient(to bottom, ' +
                'rgba(120,220,255,0.05) 0%, ' +
                'rgba(8,18,26,0.22) 18%, ' +
                'rgba(8,18,26,0.16) 100%)';

            panel.style.backdropFilter = 'blur(14px)';
            panel.style.webkitBackdropFilter = 'blur(14px)';

            panel.style.borderRadius = '12px';

            panel.style.border =
                '1px solid rgba(180,240,255,0.06)';

            panel.style.boxShadow =
                'inset 0 1px 0 rgba(255,255,255,0.05),' +
                'inset 0 0 18px rgba(255,255,255,0.03),' +
                '0 0 18px rgba(0,0,0,0.22)';

            return;
        }

        panel.style.background = 'transparent';
        panel.style.backdropFilter = 'none';
        panel.style.webkitBackdropFilter = 'none';
        panel.style.borderRadius = '0';
        panel.style.border = 'none';
        panel.style.boxShadow = 'none';
    }

    function bumpThemeTransition() {
        themeTransition = 1;
    }

    function updateThemeTransition() {
        if (themeTransition > 0) {
            themeTransition = Math.max(0, themeTransition - 0.08);
        }
    }

    function checkUpdate(setupOnly, pluginName, urlUpdateLink, urlFetchLink) {
        if (setupOnly && window.location.pathname !== '/setup')
            return;

        async function fetchRemoteVersion() {
            try {
                const response = await fetch(urlFetchLink, {
                    cache: 'no-store'
                });

                if (!response.ok) {
                    throw new Error(`[${pluginName}] update check HTTP error: ${response.status}`);
                }

                const text = await response.text();
                const versionLine = text
                    .split('\n')
                    .find(line => line.includes('const pluginVersion ='));

                if (!versionLine)
                    return null;

                const match = versionLine.match(/const\s+pluginVersion\s*=\s*['"]([^'"]+)['"]/);

                return match ? match[1] : null;
            } catch (error) {
                console.error(`[${pluginName}] update check failed:`, error);
                return null;
            }
        }

        function notifyUpdate(currentVersion, newVersion) {
            if (window.location.pathname !== '/setup')
                return;

            const pluginSettings = document.getElementById('plugin-settings');

            if (pluginSettings) {
                const updateText = `<a href="${urlUpdateLink}" target="_blank">[${pluginName}] Update available: ${currentVersion} → ${newVersion}</a><br>`;

                if (pluginSettings.textContent.trim() === 'No plugin settings are available.') {
                    pluginSettings.innerHTML = updateText;
                } else if (!pluginSettings.innerHTML.includes(`[${pluginName}] Update available`)) {
                    pluginSettings.innerHTML += ' ' + updateText;
                }
            }

            const updateIcon =
                document.querySelector('.wrapper-outer #navigation .sidenav-content .fa-puzzle-piece') ||
                document.querySelector('.wrapper-outer .sidenav-content') ||
                document.querySelector('.sidenav-content');

            if (updateIcon && !document.getElementById('signal-scope-update-dot')) {
                const redDot = document.createElement('span');
                redDot.id = 'signal-scope-update-dot';
                redDot.style.display = 'block';
                redDot.style.width = '12px';
                redDot.style.height = '12px';
                redDot.style.borderRadius = '50%';
                redDot.style.backgroundColor = '#FE0830';
                redDot.style.marginLeft = '82px';
                redDot.style.marginTop = '-12px';

                updateIcon.appendChild(redDot);
            }
        }

        fetchRemoteVersion().then(newVersion => {
            if (!newVersion)
                return;

            if (newVersion !== pluginVersion) {
                console.log(`[${pluginName}] Update available: ${pluginVersion} → ${newVersion}`);
                notifyUpdate(pluginVersion, newVersion);
            }
        });
    }

    function initAudio() {
        if (audioConnected)
            return;

        if (typeof Stream === 'undefined' || !Stream || !Stream.Fallback || !Stream.Fallback.Player) {
            setTimeout(initAudio, 1000);
            return;
        }

        audioContext = Stream.Fallback.Audio;

        if (!audioContext) {
            setTimeout(initAudio, 1000);
            return;
        }

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.65;

        dataArray = new Uint8Array(analyser.fftSize);
        const player = Stream.Fallback.Player;

        if (player.Amplification) {
            player.Amplification.connect(analyser);
            audioConnected = true;

            // Left for debugging
            // console.log(`[${pluginName}] Audio analyser connected`);

        } else {
            setTimeout(initAudio, 1000);
        }
    }

    function readAudioLevel() {
        if (!analyser || !dataArray)
            return 0;

        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
        }

        const rms = Math.sqrt(sum / dataArray.length);

        // Noise gate + scaling
        const usable = Math.max(0, rms - AUDIO_NOISE_FLOOR);
        let level = Math.pow(usable * AUDIO_SENSITIVITY, 0.72) * 7.5;
        return clamp(level, 0, 100);
    }

    function createPanel() {
        const panels = document.querySelectorAll('.panel-33');
        const signalPanel = Array.from(panels).find(panel =>
                panel.querySelector('h2') &&
                panel.querySelector('h2').textContent.toLowerCase().includes('signal'));

        if (!signalPanel || !signalPanel.parentNode) {
            console.warn(`[${pluginName}] Signal panel not found`);
            return;
        }

        const panel = document.createElement('div');
        const size = getSizeConfig();
        panel.className = 'panel-33';
        panel.id = 'signal-scope-container';
        panel.title = `${pluginName} ${pluginVersion}`;
        panel.style.width = '33%';
        panel.style.height = size.panelHeight;
        panel.style.position = 'relative';
        panel.style.overflow = 'hidden';

        const title = document.createElement('h2');
        title.textContent = 'SIGNAL SCOPE';
        title.style.letterSpacing = '1px';

        if (COMPACT_MODE) {
            title.style.fontSize = size.titleFontSize;
            title.style.opacity = '0.85';
            title.style.marginTop = '8px';
            title.style.marginBottom = '0';
        } else {
            title.style.marginTop = '4px';
            title.style.marginBottom = '0';

            if (size.titleFontSize) {
                title.style.fontSize = size.titleFontSize;
            }
        }

        panel.appendChild(title);

        canvas = document.createElement('canvas');
        canvas.id = 'signal-scope-canvas';
        canvas.width = size.canvasWidth;
        canvas.height = size.canvasHeight;
        canvas.title = `${pluginName} ${pluginVersion}`;
        canvas.style.width = size.canvasCssWidth;
        canvas.style.maxWidth = activeSizeMode === 'xl' ? '380px' : '340px';
        canvas.style.height = size.canvasCssHeight;
        canvas.style.marginTop = COMPACT_MODE ? '-2px' : '0';
        canvas.style.marginLeft = COMPACT_MODE ? 'auto' : '0';
        canvas.style.marginRight = COMPACT_MODE ? 'auto' : '0';
        canvas.style.display = 'block';
        canvas.style.imageRendering = 'auto';

        panel.appendChild(canvas);

        signalPanel.parentNode.insertBefore(panel, signalPanel.nextSibling);

        ctx = canvas.getContext('2d');

        createSettingsButton(panel);
        applyGlassMode(panel);

        injectStyles();
    }

    function injectStyles() {
        const style = document.createElement('style');

        style.textContent = `
        #signal-scope-container h2 {
            text-shadow: none !important;
        }

        @media only screen and (max-width: 768px) {
            #signal-scope-container {
                width: 100% !important;
                height: 118px;
                margin-top: 8px;
            }

            #signal-scope-canvas {
                width: 300px !important;
            }
        }
    `;

        document.head.appendChild(style);
    }

    function startRenderLoop() {
        setInterval(() => {
            targetS = readSignalValuePercent();
            targetA = readAudioLevel();

            displayS += (targetS - displayS) * 0.18;
            displayA += (targetA - displayA) * 0.22;

            const decay = getPeakDecayRates();

            peakS = Math.max(peakS - decay.signal, displayS);
            peakA = Math.max(peakA - decay.audio, displayA);
            if (displayA > CLIP_THRESHOLD) {
                clipHold = 12;
                clipActive = true;
            } else if (clipHold > 0) {
                clipHold--;
                clipActive = true;
            } else {
                clipActive = false;
            }
            updateThemeTransition();
            drawMeter(displayS, displayA);
        }, 75);
    }

    function drawMeter(sValue, aValue) {
        const layout = getMeterLayout();
        if (!ctx || !canvas)
            return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateIndicators();
        drawIndicators();
        drawMeterBar({
            label: 'S',
            y: layout.sY,
            value: sValue,
            scale: COMPACT_MODE ? [] : ['1', '3', '5', '7', '9', '+20', '+40'],
            ticks: COMPACT_MODE ? [] : [10, 22, 34, 46, 58, 78, 98]
        });

        drawMeterBar({
            label: 'A',
            y: layout.aY,
            value: aValue,
            scale: COMPACT_MODE ? [] : ['0', '25', '50', '75', '100'],
            ticks: COMPACT_MODE ? [] : [0, 25, 50, 75, 100]
        });

        drawThemeTransitionFlash();

    }

    function drawTopGlow() {
        const glow = ctx.createLinearGradient(0, 0, 0, 26);

        glow.addColorStop(0, 'rgba(120,220,255,0.14)');
        glow.addColorStop(0.45, 'rgba(120,220,255,0.05)');
        glow.addColorStop(1, 'rgba(120,220,255,0)');

        ctx.save();

        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, 26);

        ctx.restore();
    }

    function drawThemeTransitionFlash() {
        if (!themeTransition || themeTransition <= 0)
            return;

        const theme = getThemeColors();
        const alpha = themeTransition * 0.22;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 18 * themeTransition;
        ctx.shadowColor = theme.low;
        ctx.strokeStyle = theme.low;
        ctx.lineWidth = 2;

        ctx.strokeRect(8, 6, canvas.width - 16, canvas.height - 12);

        ctx.restore();
    }

    function drawSegmentedBar({
        label,
        y,
        value,
        scale,
        ticks,
        ledMode = false
    }) {
        const geo = getMeterGeometry(COMPACT_MODE ? 8 : 7);
        const { x, w, h } = geo;

        const theme = getThemeColors();
        const glow = getGlowMultiplier();
        const segments = ledMode ? (COMPACT_MODE ? 46 : 58) : (COMPACT_MODE ? 34 : 42);
        const gap = ledMode ? 3 : 2;
        const segmentW = (w - gap * (segments - 1)) / segments;
        const activeSegments = Math.round((clamp(value, 0, 100) / 100) * segments);

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'right';
        ctx.fillText(label, x - 8, y + 7);

        // Background frame
        ctx.fillStyle = theme.panelBg;
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = theme.border;
        ctx.strokeRect(x, y, w, h);

        for (let i = 0; i < segments; i++) {
            const sx = x + i * (segmentW + gap);
            const ratio = i / Math.max(1, segments - 1);

            const isActive = i < activeSegments;

            if (ratio < 0.68) {
                ctx.fillStyle = theme.low;
            } else if (ratio < 0.84) {
                ctx.fillStyle = theme.mid;
            } else if (ratio < 0.96) {
                ctx.fillStyle = theme.high;
            } else {
                ctx.fillStyle = theme.danger;
            }

            if (!isActive) {
                ctx.globalAlpha = 0.16;
            } else {
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 6 * glow;
                ctx.shadowColor = ctx.fillStyle;
            }

            ctx.fillRect(sx, y, Math.max(1, segmentW), h);

            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        // Peak hold line
        const peakValue = label === 'S' ? peakS : peakA;
        const peakX = x + (clamp(peakValue, 0, 100) / 100) * w;

        if (peakValue > 2) {
            ctx.strokeStyle = 'rgba(255,255,160,1)';
            ctx.shadowBlur = 8 * glow;
            ctx.shadowColor = 'rgba(255,255,180,0.95)';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(peakX, y - 3);
            ctx.lineTo(peakX, y + h + 3);
            ctx.stroke();

            ctx.shadowBlur = 0;
        }

        // Ticks and labels
        drawValueText(label, value, x, y, w, theme);
        if (!COMPACT_MODE) {
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = theme.text;

            ticks.forEach((tick, i) => {
                const tx = x + (tick / 100) * w;

                ctx.strokeStyle = 'rgba(255,255,255,0.65)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(tx, y + h + 1);
                ctx.lineTo(tx, y + h + 4);
                ctx.stroke();

                if (scale[i]) {
                    ctx.fillText(scale[i], tx, y + h + 16);
                }
            });
        }
    }

    function getMeterLayout() {
        if (activeSizeMode === 'mini') {
            return {
                sY: 13,
                aY: 40
            };
        }

        if (activeSizeMode === 'xl') {
            return {
                sY: 24,
                aY: 62
            };
        }

        return {
            sY: COMPACT_MODE ? 5 : 18,
            aY: COMPACT_MODE ? 24 : 50
        };
    }

    function getMeterGeometry(defaultHeight) {
        if (activeSizeMode === 'mini') {
            return {
                x: 36,
                w: 220,
                h: defaultHeight
            };
        }

        if (activeSizeMode === 'xl') {
            return {
                x: 36,
                w: 285,
                h: defaultHeight + 1
            };
        }

        return {
            x: COMPACT_MODE ? 22 : 36,
            w: COMPACT_MODE ? 230 : 250,
            h: defaultHeight
        };
    }

    function createSettingsButton(panel) {
        const gear = document.createElement('div');

        gear.innerHTML = '⚙';
        gear.title = 'Signal Scope Settings';

        gear.style.position = 'absolute';
        gear.style.top = '6px';
        gear.style.right = '10px';
        if (window.innerWidth < 600) {
            gear.style.right = '18px';
            gear.style.top = '8px';
        }
        gear.style.fontSize = '15px';
        gear.style.cursor = 'pointer';
        gear.style.opacity = '0.18';
        gear.style.transition = 'opacity 0.15s ease';
        gear.style.userSelect = 'none';
        gear.style.zIndex = '20';

        gear.addEventListener('mouseenter', () => {
            gear.style.opacity = '1';
        });

        gear.addEventListener('mouseleave', () => {
            gear.style.opacity = settingsOpen ? '1' : '0.18';
        });

        gear.addEventListener('click', () => {
            toggleSettings(panel);
            gear.style.opacity = settingsOpen ? '1' : '0.18';
        });

        panel.appendChild(gear);
    }

    function toggleSettings(panel) {
        if (settingsOpen) {
            closeSettingsPanel();
            return;
        }

        settingsOpen = true;
        createSettingsPanel(panel);
    }

    function closeSettingsPanel() {
        settingsOpen = false;

        if (settingsPanel) {
            settingsPanel.remove();
            settingsPanel = null;
        }

        if (settingsOutsideHandler) {
            document.removeEventListener('mousedown', settingsOutsideHandler);
            settingsOutsideHandler = null;
        }

        if (settingsKeyHandler) {
            document.removeEventListener('keydown', settingsKeyHandler);
            settingsKeyHandler = null;
        }
    }

    function createSettingsPanel(panel) {
        if (settingsPanel) {
            settingsPanel.remove();
        }

        settingsPanel = document.createElement('div');

        const rect = panel.getBoundingClientRect();

        settingsPanel.style.position = 'fixed';
        settingsPanel.style.top = `${rect.top + 28}px`;
        settingsPanel.style.left = `${rect.right - 230}px`;
        settingsPanel.style.width = '220px';
        settingsPanel.style.minHeight = '190px';
        settingsPanel.style.maxHeight = '320px';
        settingsPanel.style.overflowY = 'auto';
        settingsPanel.style.padding = '12px';
        settingsPanel.style.borderRadius = '10px';
        settingsPanel.style.background = 'rgba(8,12,18,0.94)';
        settingsPanel.style.backdropFilter = 'blur(10px)';
        settingsPanel.style.border = '1px solid rgba(255,255,255,0.12)';
        settingsPanel.style.zIndex = '100';
        settingsPanel.style.fontSize = '12px';
        settingsPanel.style.color = '#d9ffff';
        settingsPanel.style.boxShadow = '0 0 18px rgba(0,0,0,0.45)';

        settingsPanel.innerHTML = `
    <div style="font-weight:bold;margin-bottom:10px;text-align:center;">
        Signal Scope
    </div>

    ${buildSectionLabel('Theme')}

<div id="signal-scope-theme-list" style="
    display:flex;
    flex-direction:column;
    gap:6px;
    margin-bottom:12px;
">
    ${buildThemeRows()}
</div>

  ${buildSectionLabel('Meter Style')}

<div id="signal-scope-style-list" style="
    display:flex;
    flex-direction:column;
    gap:6px;
">
    ${buildMeterStyleRows()}
</div>

${buildSectionLabel('Glow')}

<div style="
    display:flex;
    flex-direction:column;
    gap:6px;
">
    ${buildOptionRows([{
                        label: 'Soft',
                        value: 'soft',
                        preview: '◐'
                    }, {
                        label: 'Normal',
                        value: 'normal',
                        preview: '◉'
                    }, {
                        label: 'Strong',
                        value: 'strong',
                        preview: '⬤'
                    }
                ], activeGlowLevel, 'glow')}
</div>

${buildSectionLabel('Peak Hold')}

<div style="
    display:flex;
    flex-direction:column;
    gap:6px;
">
    ${buildOptionRows([{
                        label: 'Fast',
                        value: 'fast',
                        preview: '↘'
                    }, {
                        label: 'Normal',
                        value: 'normal',
                        preview: '→'
                    }, {
                        label: 'Slow',
                        value: 'slow',
                        preview: '⌁'
                    }
                ], activePeakDecay, 'peak')}
</div>

${buildSectionLabel('Value Text')}

<div style="
    display:flex;
    flex-direction:column;
    gap:6px;
">
    ${buildOptionRows([{
                        label: 'Off',
                        value: 'off',
                        preview: '—'
                    }, {
                        label: 'On',
                        value: 'on',
                        preview: '●'
                    }
                ], activeValueText, 'valueText')}
</div>

${buildSectionLabel('Glass Panel')}

<div style="
    display:flex;
    flex-direction:column;
    gap:6px;
">
    ${buildOptionRows([{
                        label: 'Off',
                        value: 'off',
                        preview: '—'
                    }, {
                        label: 'On',
                        value: 'on',
                        preview: '◫'
                    }
                ], activeGlassMode, 'glass')}
</div>

${buildSectionLabel('Panel Size')}

<div style="
    display:flex;
    flex-direction:column;
    gap:6px;
">
    ${buildOptionRows([{
                        label: 'Mini',
                        value: 'mini',
                        preview: '▁'
                    }, {
                        label: 'Normal',
                        value: 'normal',
                        preview: '▃'
                    }, {
                        label: 'XL',
                        value: 'xl',
                        preview: '▆'
                    }
                ], activeSizeMode, 'size')}
</div>
`;
        document.body.appendChild(settingsPanel);

        initSettingsEvents();
        bindSettingsCloseHandlers(panel);
    }

    function initSettingsEvents() {
        document.querySelectorAll('.signal-scope-theme-row')
        .forEach(row => {
            row.addEventListener('click', () => {
                const theme = row.dataset.theme;

                activeThemeName = theme;
                safeLSSet(STORAGE_THEME, theme);
                bumpThemeTransition();

                closeSettingsPanel();
                createSettingsPanel(document.getElementById('signal-scope-container'));
            });

            row.addEventListener('mouseenter', () => {
                row.style.background = 'rgba(255,255,255,0.08)';
            });

            row.addEventListener('mouseleave', () => {
                const active = row.dataset.theme === activeThemeName;

                row.style.background = active
                     ? 'rgba(255,255,255,0.10)'
                     : 'rgba(255,255,255,0.03)';
            });
        });

        document.querySelectorAll('.signal-scope-style-row')
        .forEach(row => {
            row.addEventListener('click', () => {
                const style = row.dataset.style;

                activeMeterStyle = style;
                safeLSSet(STORAGE_METER_STYLE, style);

                closeSettingsPanel();
                createSettingsPanel(document.getElementById('signal-scope-container'));
            });

            row.addEventListener('mouseenter', () => {
                row.style.background = 'rgba(255,255,255,0.08)';
            });

            row.addEventListener('mouseleave', () => {
                const active = row.dataset.style === activeMeterStyle;

                row.style.background = active
                     ? 'rgba(255,255,255,0.10)'
                     : 'rgba(255,255,255,0.03)';
            });
        });

        document.querySelectorAll('.signal-scope-option-row')
        .forEach(row => {
            row.addEventListener('click', () => {
                const type = row.dataset.type;
                const value = row.dataset.value;

                if (type === 'glow') {
                    activeGlowLevel = value;
                    safeLSSet(STORAGE_GLOW, value);
                }

                if (type === 'peak') {
                    activePeakDecay = value;
                    safeLSSet(STORAGE_PEAK_DECAY, value);
                }

                if (type === 'valueText') {
                    activeValueText = value;
                    safeLSSet(STORAGE_VALUE_TEXT, value);
                }

                if (type === 'glass') {
                    activeGlassMode = value;
                    safeLSSet(STORAGE_GLASS, value);

                    const panel = document.getElementById('signal-scope-container');

                    if (panel) {
                        applyGlassMode(panel);
                    }
                }

                if (type === 'size') {
                    activeSizeMode = value;
                    safeLSSet(STORAGE_SIZE, value);
                    location.reload();
                    return;
                }

                closeSettingsPanel();
                createSettingsPanel(document.getElementById('signal-scope-container'));
            });
        });
    }

    function drawLedBar(options) {
        const ledOptions = {
            ...options,
            ledMode: true
        };

        drawSegmentedBar(ledOptions);
    }

    function bindSettingsCloseHandlers(panel) {
        if (settingsOutsideHandler) {
            document.removeEventListener('mousedown', settingsOutsideHandler);
        }

        if (settingsKeyHandler) {
            document.removeEventListener('keydown', settingsKeyHandler);
        }

        settingsOutsideHandler = (e) => {
            if (!settingsPanel)
                return;

            const clickedInsidePanel = settingsPanel.contains(e.target);
            const clickedGear = panel.contains(e.target) && e.target.textContent === '⚙';

            if (!clickedInsidePanel && !clickedGear) {
                closeSettingsPanel();
            }
        };

        settingsKeyHandler = (e) => {
            if (e.key === 'Escape') {
                closeSettingsPanel();
            }
        };

        setTimeout(() => {
            document.addEventListener('mousedown', settingsOutsideHandler);
            document.addEventListener('keydown', settingsKeyHandler);
        }, 0);
    }

    function drawThinBar({
        label,
        y,
        value,
        scale,
        ticks
    }) {
        const geo = getMeterGeometry(4);
        const { x, w, h } = geo;

        const fillW = clamp((value / 100) * w, 0, w);
        const theme = getThemeColors();
        const glow = getGlowMultiplier();

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'right';
        ctx.fillText(label, x - 8, y + 6);

        ctx.fillStyle = 'rgba(120, 160, 180, 0.26)';
        ctx.fillRect(x, y + 2, w, h);

        ctx.strokeStyle = 'rgba(180, 230, 255, 0.22)';
        ctx.strokeRect(x, y + 1, w, h + 2);

        const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
        gradient.addColorStop(0.0, theme.low);
        gradient.addColorStop(0.7, theme.mid);
        gradient.addColorStop(1.0, theme.high);

        ctx.shadowBlur = 6 * glow;
        ctx.shadowColor = theme.low;
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y + 2, fillW, h);
        ctx.shadowBlur = 0;

        const peakValue = label === 'S' ? peakS : peakA;
        const peakX = x + (clamp(peakValue, 0, 100) / 100) * w;

        if (peakValue > 2) {
            ctx.strokeStyle = 'rgba(255,255,180,1)';
            ctx.shadowBlur = 8 * glow;
            ctx.shadowColor = 'rgba(255,255,180,0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(peakX, y - 1);
            ctx.lineTo(peakX, y + h + 5);
            ctx.stroke();
            ctx.shadowBlur = 0;

        }
        drawValueText(label, value, x, y, w, theme);
    }

    function drawNeonBar({
        label,
        y,
        value,
        scale,
        ticks
    }) {
        const geo = getMeterGeometry(COMPACT_MODE ? 9 : 8);
        const { x, w, h } = geo;
        const fillW = clamp((value / 100) * w, 0, w);
        const theme = getThemeColors();
        const glow = getGlowMultiplier();

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'right';
        ctx.fillText(label, x - 8, y + 7);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        roundRect(ctx, x, y, w, h, h / 2, true, false);

        const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
        gradient.addColorStop(0.0, theme.low);
        gradient.addColorStop(0.62, theme.mid);
        gradient.addColorStop(0.86, theme.high);
        gradient.addColorStop(1.0, theme.danger);

        ctx.shadowBlur = 12 * glow;
        ctx.shadowColor = theme.low;
        ctx.fillStyle = gradient;
        roundRect(ctx, x, y, fillW, h, h / 2, true, false);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = theme.border;
        roundRect(ctx, x, y, w, h, h / 2, false, true);

        const peakValue = label === 'S' ? peakS : peakA;
        const peakX = x + (clamp(peakValue, 0, 100) / 100) * w;

        if (peakValue > 2) {
            ctx.fillStyle = 'rgba(255,255,220,1)';
            ctx.shadowBlur = 10 * glow;
            ctx.shadowColor = 'rgba(255,255,180,0.95)';
            roundRect(ctx, peakX - 2, y - 3, 4, h + 6, 2, true, false);
            ctx.shadowBlur = 0;
        }

        if (!COMPACT_MODE) {
            drawValueText(label, value, x, y, w, theme);
            drawScaleTicks(x, y, w, h, scale, ticks, theme);
        }
    }

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
        const radius = Math.min(r, w / 2, h / 2);

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        if (fill)
            ctx.fill();
        if (stroke)
            ctx.stroke();
    }

    function drawScaleTicks(x, y, w, h, scale, ticks, theme) {
        ctx.font = '10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = theme.text;

        ticks.forEach((tick, i) => {
            const tx = x + (tick / 100) * w;

            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx, y + h + 1);
            ctx.lineTo(tx, y + h + 4);
            ctx.stroke();

            if (scale[i]) {
                ctx.fillText(scale[i], tx, y + h + 16);
            }
        });
    }

    function drawValueText(label, value, x, y, w, theme) {
        if (activeValueText !== 'on') {
            return;
        }

        const text = `${Math.round(value)}`;
        const badgeW = 24;
        const badgeH = 13;
        const badgeX = x + w + 6;
        const badgeY = y - 3;

        ctx.save();

        ctx.globalAlpha = 0.72;
        ctx.fillStyle = 'rgba(8, 18, 26, 0.18)';
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4, true, false);

        ctx.globalAlpha = 0.95;
        ctx.font = 'bold 9px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.text;
        ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

        ctx.restore();
    }
    function getStylePreviewColor(style) {
        const theme = getThemeColors();

        if (style === 'classic') {
            return theme.low;
        }

        if (style === 'segmented') {
            return theme.mid;
        }

        if (style === 'led') {
            return theme.high;
        }

        if (style === 'thin') {
            return theme.low;
        }

        if (style === 'neon') {
            return theme.low;
        }

        return theme.text;
    }

    function getThemePreviewColor(themeName) {
        const theme = SIGNAL_SCOPE_THEMES[themeName];

        if (theme && theme.low) {
            return theme.low;
        }

        return cssVar('--color-5', '#00ff66');
    }

    function buildThemeRows() {
        return VALID_THEMES.map(themeName => {
            const active = themeName === activeThemeName;
            const color = getThemePreviewColor(themeName);
            const label = SIGNAL_SCOPE_THEMES[themeName].name;

            return `
            <div class="signal-scope-theme-row"
                 data-theme="${themeName}"
                 style="
                    display:flex;
                    align-items:center;
                    gap:9px;
                    padding:7px 10px;
                    border-radius:8px;
                    cursor:pointer;
                    transition:all 0.15s ease;
                    background:${active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'};
                    border:${active ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.06)'};
                 ">
                <span style="
                    width:12px;
                    height:12px;
                    border-radius:3px;
                    background:${color};
                    box-shadow:0 0 8px ${color};
                    flex-shrink:0;
                "></span>

                <span style="
                    font-size:13px;
                    color:var(--color-text);
                ">
                    ${label}
                </span>
            </div>
        `;
        }).join('');
    }

    function buildMeterStyleRows() {
        const styles = {
            classic: '━━━━━━━',
            segmented: '▮ ▮ ▮ ▮',
            led: '▮▮▮▮▮▮▮',
            thin: '───────',
            neon: '▬▬▬▬▬▬▬'
        };

        return VALID_METER_STYLES.map(style => {
            const active = style === activeMeterStyle;

            return `
            <div class="signal-scope-style-row"
                 data-style="${style}"
                 style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    padding:7px 10px;
                    border-radius:8px;
                    cursor:pointer;
                    transition:all 0.15s ease;
                    background:${active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'};
                    border:${active ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.06)'};
                 ">
                <span style="
                    font-size:13px;
                    color:var(--color-text);
                ">
                    ${style.charAt(0).toUpperCase() + style.slice(1)}
                </span>
                <span style="
                    font-family:monospace;
                    letter-spacing:1px;
                    opacity:0.95;
                    color:${getStylePreviewColor(style)};
                    text-shadow:0 0 8px ${getStylePreviewColor(style)};
                ">
                    ${styles[style]}
                </span>
            </div>
        `;
        }).join('');

    }

    function buildSectionLabel(text) {
        return `
        <label style="
            display:block;
            margin-top:14px;
            margin-bottom:7px;
            font-size:11px;
            letter-spacing:0.8px;
            text-transform:uppercase;
            opacity:0.72;
            color:var(--color-text);
        ">
            ${text}
        </label>
    `;
    }

    function buildOptionRows(options, activeValue, type) {
        return options.map(option => {
            const active = option.value === activeValue;

            return `
        <div class="signal-scope-option-row"
             data-type="${type}"
             data-value="${option.value}"
             style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                padding:7px 10px;
                border-radius:8px;
                cursor:pointer;
                transition:all 0.15s ease;
                background:${active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'};
                border:${active ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.06)'};
             ">
            <span style="
                font-size:13px;
                color:var(--color-text);
            ">
                ${option.label}
            </span>

            <span style="
                opacity:0.82;
                font-size:12px;
            ">
                ${option.preview || ''}
            </span>
        </div>
    `;
        }).join('');
    }

    function drawMeterBar(options) {
        switch (activeMeterStyle) {
        case 'segmented':
            drawSegmentedBar(options);
            return;

        case 'led':
            drawLedBar(options);
            return;

        case 'thin':
            drawThinBar(options);
            return;

        case 'neon':
            drawNeonBar(options);
            return;

        case 'classic':
        default:
            drawClassicBar(options);
            return;
        }
    }

    function drawClassicBar({
        label,
        y,
        value,
        scale,
        ticks
    }) {
        const geo = getMeterGeometry(COMPACT_MODE ? 8 : 7);
        const { x, w, h } = geo;

        const fillW = clamp((value / 100) * w, 0, w);
        const theme = getThemeColors();
        const glow = getGlowMultiplier();

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'right';
        ctx.fillText(label, x - 8, y + 7);

        // Background
        ctx.fillStyle = theme.panelBg;
        ctx.fillRect(x, y, w, h);

        // Gradient fill
        const gradient = ctx.createLinearGradient(x, 0, x + w, 0);

        gradient.addColorStop(0.0, theme.low);
        gradient.addColorStop(0.68, theme.mid);
        gradient.addColorStop(0.84, theme.high);
        gradient.addColorStop(1.0, theme.danger);

        ctx.shadowBlur = 8 * glow;
        ctx.shadowColor = 'rgba(0,255,160,0.35)';
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, fillW, h);
        ctx.shadowBlur = 0;

        // Peak hold line
        const peakValue = label === 'S' ? peakS : peakA;
        const peakX = x + (clamp(peakValue, 0, 100) / 100) * w;

        if (peakValue > 2) {
            // Dark outline / contrast
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 4;

            ctx.beginPath();
            ctx.moveTo(peakX, y - 3);
            ctx.lineTo(peakX, y + h + 3);
            ctx.stroke();

            // Bright peak line
            ctx.shadowBlur = 8 * glow;
            ctx.shadowColor = 'rgba(255,255,180,0.95)';
            ctx.strokeStyle = 'rgba(255,255,160,1)';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(peakX, y - 3);
            ctx.lineTo(peakX, y + h + 3);
            ctx.stroke();

            ctx.shadowBlur = 0;
        }
        // Glow line
        ctx.fillStyle = 'rgba(190, 255, 230, 0.45)';
        ctx.fillRect(x, y, fillW, 1);

        // Border
        ctx.strokeStyle = theme.border;
        ctx.strokeRect(x, y, w, h);

        // Ticks and labels
        drawValueText(label, value, x, y, w, theme);
        if (!COMPACT_MODE) {
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = theme.text;

            ticks.forEach((tick, i) => {
                const tx = x + (tick / 100) * w;

                ctx.strokeStyle = 'rgba(255,255,255,0.65)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(tx, y + h + 1);
                ctx.lineTo(tx, y + h + 4);
                ctx.stroke();

                if (scale[i]) {
                    ctx.fillText(scale[i], tx, y + h + 16);
                }
            });
        }
    }

    function updateIndicators() {
        const piElement = document.getElementById('data-pi');
        const oldRdsActive = rdsActive;

        if (piElement) {
            const pi = piElement.textContent.trim();
            rdsActive = pi !== '' && pi !== '?' && pi !== '0000';
        } else {
            rdsActive = false;
        }

        if (rdsActive && rdsActive !== oldRdsActive) {
            rdsBlink = 10;
        } else if (rdsBlink > 0) {
            rdsBlink--;
        }

        forcedMonoActive = detectForcedMono();

        stereoActive = detectStereoFromUi() && !forcedMonoActive;

        // Effective mono state
        monoActive = forcedMonoActive || !stereoActive;
    }

    function detectForcedMono() {
        return false;
    }

    function detectStereoFromUi() {
        const stereo = document.querySelector('.stereo-container .circle-container');

        if (!stereo) {
            return false;
        }

        return !stereo.classList.contains('opacity-half');
    }

    function drawIndicators() {
        const startX = 62;
        const y = 8;

        ledFadeST = updateLedFade(ledFadeST, stereoActive);
        ledFadeMO = updateLedFade(ledFadeMO, monoActive);
        ledFadeRDS = updateLedFade(ledFadeRDS, rdsActive);
        ledFadeCLIP = updateLedFade(ledFadeCLIP, clipActive);

        drawLed(startX, y, stereoActive, 'ST', '#7dff7d', false, ledFadeST);
        drawLed(startX + 48, y, monoActive, 'MO', '#9dc8ff', false, ledFadeMO);
        drawLed(startX + 96, y, rdsActive, 'RDS', '#7ddcff', rdsBlink > 0, ledFadeRDS);
        drawLed(startX + 154, y, clipActive, 'CLIP', '#ff4a4a', clipActive, ledFadeCLIP);
    }

    function updateLedFade(current, active) {
        if (active) {
            return Math.min(1, current + 0.22);
        }

        return Math.max(0, current - 0.06);
    }

    function drawLed(x, y, active, label, color, blink = false, fade = 0) {
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.textAlign = 'left';

        const blinkBoost = blink && (Math.floor(Date.now() / 220) % 2 === 0);
        const breathing = active && !blink
             ? 0.75 + Math.sin(Date.now() / 420) * 0.25
             : 1;

        const size = 8;

        if (active || blinkBoost || fade > 0) {
            ctx.globalAlpha = Math.max(fade, blinkBoost ? 1 : 0.25);
            ctx.fillStyle = color;
            ctx.shadowBlur = blinkBoost ? 18 : (10 + (6 * breathing)) * Math.max(fade, 0.35);
            ctx.shadowColor = color;
        } else {
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(120,120,120,0.25)';
            ctx.shadowBlur = 0;
        }

        // Square LED
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.globalAlpha = 1;

        ctx.shadowBlur = 0;

        ctx.fillStyle = active || blinkBoost
             ? 'rgba(230,245,255,0.95)'
             : 'rgba(180,190,200,0.45)';

        ctx.fillText(label, x + 10, y + 3);
    }

    function readSignalValuePercent() {
        const signalElement = document.getElementById('data-signal');
        const decimalElement = document.getElementById('data-signal-decimal');

        if (!signalElement)
            return targetS || 0;

        const main = parseFloat(signalElement.textContent || '0');
        const dec = decimalElement ? parseFloat(decimalElement.textContent || '0') : 0;

        let value = main + (main >= 0 ? dec : -dec);

        const unit = localStorage.getItem('signalUnit');

        if (unit === 'dbf' || !unit) {
            return clamp(value, 0, 100);
        }

        if (unit === 'dbm') {
            return clamp(value + 120, 0, 100);
        }

        if (unit === 'dbuv') {
            return clamp(value + 11.25, 0, 100);
        }

        return clamp(value, 0, 100);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

})();