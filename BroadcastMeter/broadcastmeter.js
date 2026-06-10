(() => {
    'use strict';

    const pluginName = 'Broadcast Meter';
    const pluginVersion = '0.5.1';
    const AUDIO_SENSITIVITY = 520;
    const AUDIO_NOISE_FLOOR = 0.012;
    const CLIP_THRESHOLD = 98;
    const COMPACT_MODE = false;

    const pluginSetupOnlyNotify = true;
    const CHECK_FOR_UPDATES = true;
    const pluginHomepageUrl = 'https://github.com/fmatic/BroadcastMeter/releases';
    const pluginUpdateUrl = 'https://raw.githubusercontent.com/fmatic/BroadcastMeter/main/BroadcastMeter/broadcastmeter.js';

    let stereoActive = false;
    let forcedMonoActive = false;
    let rdsActive = false;
    let rdsBlink = 0;

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

    if (CHECK_FOR_UPDATES) {
        checkUpdate(pluginSetupOnlyNotify, pluginName, pluginHomepageUrl, pluginUpdateUrl);
    }

    document.addEventListener('DOMContentLoaded', () => {
        createPanel();
        initAudio();
        startRenderLoop();
    });

    function cssVar(name, fallback) {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();

        return value || fallback;
    }

    function getThemeColors() {
        return {
            text: cssVar('--color-text', '#d9ffff'),
            accent: cssVar('--color-5', '#00ff66'),
            panelBg: cssVar('--color-2-transparent', 'rgba(10, 25, 28, 0.95)'),
            border: cssVar('--color-3-transparent', 'rgba(200, 255, 255, 0.16)')
        };
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

            if (updateIcon && !document.getElementById('broadcast-meter-update-dot')) {
                const redDot = document.createElement('span');
                redDot.id = 'broadcast-meter-update-dot';
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
            console.log(`[${pluginName}] Audio analyser connected`);
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
        panel.className = 'panel-33';
        panel.id = 'mono-peakmeter-container';
        panel.style.width = '33%';
        panel.style.height = COMPACT_MODE ? '96px' : '123px';
        panel.style.position = 'relative';
        panel.style.overflow = 'hidden';

        const title = document.createElement('h2');
        title.textContent = 'BROADCAST METER';
        title.style.letterSpacing = '1px';

        if (COMPACT_MODE) {
            title.style.fontSize = '22px';
            title.style.opacity = '0.85';
            title.style.marginTop = '8px';
            title.style.marginBottom = '0';
        } else {
            title.style.marginTop = '4px';
            title.style.marginBottom = '0';
        }

        panel.appendChild(title);

        canvas = document.createElement('canvas');
        canvas.id = 'mono-peakmeter-canvas';
        canvas.width = 320;
        canvas.height = COMPACT_MODE ? 44 : 74;
        canvas.title = `${pluginName} ${pluginVersion}`;
        canvas.style.width = COMPACT_MODE ? '260px' : '90%';
        canvas.style.maxWidth = COMPACT_MODE ? '260px' : '340px';
        canvas.style.height = COMPACT_MODE ? '44px' : '74px';
        canvas.style.marginTop = COMPACT_MODE ? '-2px' : '0';
        canvas.style.marginLeft = COMPACT_MODE ? 'auto' : '0';
        canvas.style.marginRight = COMPACT_MODE ? 'auto' : '0';
        canvas.style.display = 'block';
        canvas.style.imageRendering = 'auto';

        panel.appendChild(canvas);

        signalPanel.parentNode.insertBefore(panel, signalPanel.nextSibling);

        ctx = canvas.getContext('2d');

        injectStyles();
    }

    function injectStyles() {
        const style = document.createElement('style');

        style.textContent = `
        #mono-peakmeter-container {
            background: transparent !important;
            backdrop-filter: none !important;
            border-radius: 0;
            box-shadow: none;
        }

       #mono-peakmeter-container h2 {
    text-shadow: none !important;
}
        @media only screen and (max-width: 768px) {
            #mono-peakmeter-container {
                width: 100% !important;
                height: 118px;
                margin-top: 8px;
            }

            #mono-peakmeter-canvas {
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

            peakS = Math.max(peakS - 0.12, displayS);
            peakA = Math.max(peakA - 0.18, displayA);
            if (displayA > CLIP_THRESHOLD) {
                clipHold = 12;
                clipActive = true;
            } else if (clipHold > 0) {
                clipHold--;
                clipActive = true;
            } else {
                clipActive = false;
            }
            drawMeter(displayS, displayA);
        }, 75);
    }

    function drawMeter(sValue, aValue) {
        if (!ctx || !canvas)
            return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateIndicators();
        drawIndicators();
        drawBar({
            label: 'S',
            y: COMPACT_MODE ? 5 : 18,
            value: sValue,
            scale: COMPACT_MODE ? [] : ['1', '3', '5', '7', '9', '+10', '+20', '+30', '+40'],
            ticks: COMPACT_MODE ? [] : [10, 22, 34, 46, 58, 68, 78, 88, 98]
        });

        drawBar({
            label: 'A',
            y: COMPACT_MODE ? 24 : 50,
            value: aValue,
            scale: COMPACT_MODE ? [] : ['0', '10', '30', '50', '70', '100'],
            ticks: COMPACT_MODE ? [] : [0, 10, 30, 50, 70, 100]
        });

    }

    function drawBar({
        label,
        y,
        value,
        scale,
        ticks
    }) {
        const x = COMPACT_MODE ? 22 : 36;
        const w = COMPACT_MODE ? 230 : 250;
        const h = COMPACT_MODE ? 8 : 7;

        const fillW = clamp((value / 100) * w, 0, w);
        const theme = getThemeColors();

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'right';
        ctx.fillText(label, x - 8, y + 7);

        // Background
        ctx.fillStyle = theme.panelBg;
        ctx.fillRect(x, y, w, h);

        // Gradient fill
        const gradient = ctx.createLinearGradient(x, 0, x + w, 0);

        gradient.addColorStop(0.0, theme.accent);
        gradient.addColorStop(0.68, '#9dff00');
        gradient.addColorStop(0.84, '#ffd000');
        gradient.addColorStop(1.0, '#ff3030');

        ctx.shadowBlur = 8;
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
            ctx.shadowBlur = 8;
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

        drawLed(startX, y, stereoActive, 'ST', '#7dff7d');
        drawLed(startX + 48, y, forcedMonoActive, 'MO', '#9dc8ff');
        drawLed(startX + 96, y, rdsActive, 'RDS', '#7ddcff', rdsBlink > 0);
        drawLed(startX + 154, y, clipActive, 'CLIP', '#ff4a4a', clipActive);
    }

    function drawLed(x, y, active, label, color, blink = false) {
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.textAlign = 'left';

        const blinkBoost = blink && (Math.floor(Date.now() / 120) % 2 === 0);

        const size = 8;

        if (active || blinkBoost) {
            ctx.fillStyle = color;
            ctx.shadowBlur = blinkBoost ? 18 : 12;
            ctx.shadowColor = color;
        } else {
            ctx.fillStyle = 'rgba(120,120,120,0.25)';
            ctx.shadowBlur = 0;
        }

        // Square LED
        ctx.fillRect(x - size / 2, y - size / 2, size, size);

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