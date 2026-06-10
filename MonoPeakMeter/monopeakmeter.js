(() => {
    'use strict';

    const pluginName = 'Mono Peakmeter';
    const pluginVersion = '0.5.0';
    const AUDIO_SENSITIVITY = 520;
    const AUDIO_NOISE_FLOOR = 0.012;
    const CLIP_THRESHOLD = 98;
    const COMPACT_MODE = false;

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
        analyser.fftSize = 256;
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
        title.textContent = 'MONO PEAKMETER';
        title.style.letterSpacing = '1px';

        if (COMPACT_MODE) {
            title.style.fontSize = '22px';
            title.style.opacity = '0.85';
            title.style.marginTop = '8px';
            title.style.marginBottom = '0';
        } else {
            title.style.marginTop = '4';
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
            } else if (clipHold > 0) {
                clipHold--;
            }
            drawMeter(displayS, displayA);
        }, 75);
    }

    function drawMeter(sValue, aValue) {
        if (!ctx || !canvas)
            return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawBar({
            label: 'S',
            y: COMPACT_MODE ? 5 : 8,
            value: sValue,
            scale: COMPACT_MODE ? [] : ['1', '3', '5', '7', '9', '+10', '+20', '+30', '+40'],
            ticks: COMPACT_MODE ? [] : [10, 22, 34, 46, 58, 68, 78, 88, 98]
        });

        drawBar({
            label: 'A',
            y: COMPACT_MODE ? 24 : 42,
            value: aValue,
            scale: COMPACT_MODE ? [] : ['0', '10', '30', '50', '70', '100'],
            ticks: COMPACT_MODE ? [] : [0, 10, 30, 50, 70, 100]
        });

        drawClipIndicator();
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

    function drawClipIndicator() {
        if (clipHold <= 0)
            return;

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 60, 60, 1)';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255, 0, 0, 0.7)';

        ctx.fillText('CLIP', canvas.width - 18, 18);

        ctx.shadowBlur = 0;
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