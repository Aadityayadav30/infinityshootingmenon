/**
 * ============================================
 * AUDIO MANAGER - Procedural Sound Effects
 * Uses Web Audio API to generate sounds
 * ============================================
 */

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.muted = false;
        this.initialized = false;
    }

    /**
     * Initialize the audio context (must be called after user interaction)
     */
    init() {
        if (this.initialized) return;

        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create master gain node for volume control
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3; // Default volume
            this.masterGain.connect(this.audioContext.destination);

            this.initialized = true;
            console.log('Audio initialized successfully');
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    /**
     * Resume audio context if suspended (required for some browsers)
     */
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Toggle mute state
     */
    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.3;
        }
        return this.muted;
    }

    /**
     * Set volume (0 to 1)
     */
    setVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Create an oscillator with envelope
     */
    createOscillator(type, frequency, startTime, duration, gainValue = 0.5) {
        if (!this.audioContext || this.muted) return null;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startTime);

        // Envelope
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(gainValue, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);

        return oscillator;
    }

    /**
     * Create noise for explosion effects
     */
    createNoise(startTime, duration, gainValue = 0.3) {
        if (!this.audioContext || this.muted) return;

        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = buffer.getChannelData(0);

        // Generate white noise
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.audioContext.createBufferSource();
        noiseNode.buffer = buffer;

        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        // Low-pass filter for more "explosion" sound
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(1000, startTime);
        filterNode.frequency.exponentialRampToValueAtTime(100, startTime + duration);

        // Envelope
        gainNode.gain.setValueAtTime(gainValue, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        noiseNode.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.masterGain);

        noiseNode.start(startTime);
        noiseNode.stop(startTime + duration);
    }

    // ============================================
    // SOUND EFFECTS
    // ============================================

    /**
     * Player shoot sound - machine gun burst
     */
    playShoot() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Machine gun sound
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.08);

        // Add some noise for realism
        this.createNoise(now, 0.04, 0.08);
    }

    /**
     * Enemy shoot sound - different pitch
     */
    playEnemyShoot() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    /**
     * Hit sound - impact
     */
    playHit() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Impact thud
        this.createOscillator('sine', 150, now, 0.08, 0.25);
        this.createNoise(now, 0.03, 0.15);
    }

    /**
     * Explosion sound - plane destroyed
     */
    playExplosion() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Noise burst
        this.createNoise(now, 0.4, 0.5);

        // Low boom
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.3);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.4);
    }

    /**
     * Big explosion for bomb
     */
    playBombExplosion() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Multiple noise layers
        this.createNoise(now, 0.8, 0.6);
        this.createNoise(now + 0.1, 0.6, 0.4);

        // Deep rumble
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(15, now + 0.6);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.7);

        // High frequency crack
        this.createOscillator('sawtooth', 800, now, 0.1, 0.3);
    }

    /**
     * Power-up pickup sound
     */
    playPowerup() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Ascending arcade chime
        const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6
        frequencies.forEach((freq, i) => {
            this.createOscillator('sine', freq, now + i * 0.07, 0.12, 0.2);
            this.createOscillator('triangle', freq * 2, now + i * 0.07, 0.08, 0.1);
        });
    }

    /**
     * Extra life sound
     */
    playExtraLife() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Triumphant fanfare
        const notes = [392, 523, 659, 784]; // G4, C5, E5, G5
        notes.forEach((freq, i) => {
            this.createOscillator('sine', freq, now + i * 0.12, 0.25, 0.25);
            this.createOscillator('triangle', freq, now + i * 0.12, 0.2, 0.15);
        });
    }

    /**
     * Player damage sound
     */
    playDamage() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Impact rumble
        this.createNoise(now, 0.2, 0.35);
        this.createOscillator('sawtooth', 100, now, 0.15, 0.3);
    }

    /**
     * Game over sound
     */
    playGameOver() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Descending defeat melody
        const frequencies = [392, 349, 294, 262]; // G4, F4, D4, C4
        frequencies.forEach((freq, i) => {
            this.createOscillator('sine', freq, now + i * 0.35, 0.5, 0.25);
        });

        // Low drone
        this.createOscillator('sine', 55, now, 1.8, 0.15);
    }

    /**
     * Button click sound
     */
    playClick() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;
        this.createOscillator('sine', 800, now, 0.04, 0.15);
        this.createOscillator('sine', 1200, now + 0.02, 0.03, 0.1);
    }

    /**
     * Shield activate sound
     */
    playShieldActivate() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Energy shield shimmer
        for (let i = 0; i < 6; i++) {
            this.createOscillator('sine', 600 + i * 150, now + i * 0.04, 0.18, 0.12);
        }
    }

    /**
     * Shield deactivate sound
     */
    playShieldDeactivate() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Descending shimmer
        for (let i = 0; i < 5; i++) {
            this.createOscillator('sine', 1200 - i * 150, now + i * 0.04, 0.12, 0.08);
        }
    }

    /**
     * Portal spawn sound - mysterious appearance
     */
    playPortalSpawn() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Ethereal whoosh
        this.createNoise(now, 0.5, 0.15);

        // Rising mystical tone
        this.createOscillator('sine', 200, now, 0.6, 0.15);
        this.createOscillator('sine', 400, now + 0.1, 0.5, 0.12);
        this.createOscillator('sine', 600, now + 0.2, 0.4, 0.1);
        this.createOscillator('triangle', 800, now + 0.3, 0.3, 0.08);
    }

    /**
     * Black hole enter sound - deep warping
     */
    playBlackHoleEnter() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Deep warping drone
        this.createOscillator('sine', 80, now, 1.0, 0.3);
        this.createOscillator('sine', 60, now + 0.2, 0.8, 0.25);

        // Descending sweep
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 1.0);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 1.0);

        // Rumble noise
        this.createNoise(now, 0.8, 0.25);
    }

    /**
     * White hole enter sound - bright reset chime
     */
    playWhiteHoleEnter() {
        if (!this.initialized) return;
        this.resume();

        const now = this.audioContext.currentTime;

        // Bright shimmer burst
        this.createNoise(now, 0.15, 0.2);

        // High-pitched chime cascade
        const frequencies = [880, 1320, 1760, 2200, 1760, 1320];
        frequencies.forEach((freq, i) => {
            this.createOscillator('sine', freq, now + i * 0.06, 0.15, 0.12);
            this.createOscillator('triangle', freq * 0.5, now + i * 0.06, 0.1, 0.08);
        });

        // Ethereal pad
        this.createOscillator('sine', 440, now, 0.5, 0.15);
        this.createOscillator('sine', 660, now + 0.05, 0.4, 0.12);
    }
}

// Create global audio manager instance
const audioManager = new AudioManager();
