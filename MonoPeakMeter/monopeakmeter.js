(() => {
    'use strict';

    const pluginName = 'Mono Peakmeter';
    const pluginVersion = '0.2.0';

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

    document.addEventListener('DOMContentLoaded', () => {
        createPanel();
        initAudio();
        startRenderLoop();
    });

    function initAudio() {
        if (audioConnected) return;

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

        dataArray = new Uint8Array(analyser.frequencyBinCount);

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
        if (!analyser || !dataArray) return 0;

        analyser.getByteFrequencyData(dataArray);

        let avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        avg *= 1.6;

        return clamp(avg, 0, 100);
    }

    function createPanel() {
        const panels = document.querySelectorAll('.panel-33');
        const signalPanel = Array.from(panels).find(panel =>
            panel.querySelector('h2') &&
            panel.querySelector('h2').textContent.toLowerCase().includes('signal')
        );

        if (!signalPanel || !signalPanel.parentNode) {
            console.warn(`[${pluginName}] Signal panel not found`);
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'panel-33';
        panel.id = 'mono-peakmeter-container';
        panel.style.width = '33%';
        panel.style.height = '123px';
        panel.style.position = 'relative';
        panel.style.overflow = 'hidden';

        const title = document.createElement('h2');
        title.textContent = 'MONO PEAKMETER';
        title.style.marginTop = '12px';
        title.style.letterSpacing = '1px';

        canvas = document.createElement('canvas');
        canvas.id = 'mono-peakmeter-canvas';
        canvas.width = 320;
        canvas.height = 74;
        canvas.title = `${pluginName} ${pluginVersion}`;
        canvas.style.width = '90%';
        canvas.style.maxWidth = '340px';
        canvas.style.height = '74px';
        canvas.style.imageRendering = 'auto';

        panel.appendChild(title);
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
            color: rgba(180, 255, 250, 0.85);
            text-shadow: 0 0 8px rgba(0, 255, 220, 0.25);
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

            drawMeter(displayS, displayA);
        }, 75);
    }

    function drawMeter(sValue, aValue) {
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawBar({
            label: 'S',
            y: 8,
            value: sValue,
            scale: ['1', '3', '5', '7', '9', '+10', '+20', '+30', '+40'],
            ticks: [10, 22, 34, 46, 58, 68, 78, 88, 98]
        });

        drawBar({
            label: 'A',
            y: 42,
            value: aValue,
            scale: ['0', '10', '30', '50', '70', '100'],
            ticks: [0, 10, 30, 50, 70, 100]
        });
    }

    function drawBar({ label, y, value, scale, ticks }) {
        const x = 36;
        const w = 250;
        const h = 7;

        const fillW = clamp((value / 100) * w, 0, w);

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillStyle = '#d9ffff';
        ctx.textAlign = 'right';
        ctx.fillText(label, x - 8, y + 7);

        ctx.fillStyle = 'rgba(10, 25, 28, 0.95)';
        ctx.fillRect(x, y, w, h);

       // Gradient fill
		const gradient = ctx.createLinearGradient(x, 0, x + w, 0);

		gradient.addColorStop(0.0, '#00ff66');
		gradient.addColorStop(0.68, '#9dff00');
		gradient.addColorStop(0.84, '#ffd000');
		gradient.addColorStop(1.0, '#ff3030');

		ctx.fillStyle = gradient;
		ctx.fillRect(x, y, fillW, h);
        ctx.fillStyle = 'rgba(190, 255, 230, 0.45)';
        ctx.fillRect(x, y, fillW, 1);

        ctx.strokeStyle = 'rgba(200, 255, 255, 0.16)';
        ctx.strokeRect(x, y, w, h);

        ctx.font = '10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';

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

    function readSignalValuePercent() {
        const signalElement = document.getElementById('data-signal');
        const decimalElement = document.getElementById('data-signal-decimal');

        if (!signalElement) return targetS || 0;

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

    function drawSegment(x, y, w, h, color) {
        if (w <= 0) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }
})();