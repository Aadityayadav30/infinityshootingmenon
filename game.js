/**
 * ============================================
 * SKY FIGHTER - 2D Plane Shooting Game
 * A complete arcade-style shooting game
 * ============================================
 */

// ============================================
// GAME CONFIGURATION
// ============================================
const CONFIG = {
    // Player settings
    player: {
        speed: 6,
        size: 25,
        maxHealth: 100,
        shootCooldown: 200, // ms between shots
        invincibilityDuration: 1500, // ms after taking damage
        startBombs: 1, // Starting bomb count
    },

    // Bullet settings
    bullet: {
        speed: 14,
        size: 5,
        damage: 30,
        lifetime: 2000, // ms
    },

    // Enemy bullet settings
    enemyBullet: {
        speed: 6,
        size: 4,
        damage: 15,
    },

    // Enemy settings
    enemies: {
        spawnRate: 1800, // ms between spawns
        minSpawnRate: 600, // minimum spawn rate at high difficulty
        shootCooldown: 2000, // ms between enemy shots
        types: {
            fighter: { speed: 2.5, health: 60, size: 20, color: '#ff4444', score: 15, shootChance: 0.4 },
            bomber: { speed: 1.5, health: 120, size: 28, color: '#8844ff', score: 25, shootChance: 0.6 },
            ace: { speed: 4, health: 40, size: 16, color: '#ff8800', score: 20, shootChance: 0.3 },
        }
    },

    // Power-up settings
    powerups: {
        dropChance: 0.18, // 18% chance to drop
        types: {
            rapid: { duration: 6000, color: '#ff6b00', icon: '⚡', multiplier: 3 },
            shield: { duration: 5000, color: '#00e5ff', icon: '🛡️' },
            damage: { duration: 8000, color: '#ff3333', icon: '💥', multiplier: 2 },
            bomb: { duration: 0, color: '#ff00ff', icon: '💣' }, // Instant: adds bomb
            life: { duration: 0, color: '#00ff88', icon: '💚', heal: 40 }, // Instant: heals
        },
        size: 16,
        floatSpeed: 1.5,
    },

    // Visual settings
    particles: {
        explosionCount: 18,
        lifetime: 600,
    },

    // Difficulty scaling
    difficulty: {
        scoreThreshold: 150, // Score needed to increase difficulty
        spawnRateReduction: 120, // ms reduction per difficulty level
    },

    // Sky/clouds
    clouds: {
        count: 8,
        minSpeed: 0.5,
        maxSpeed: 2,
    }
};

// ============================================
// GAME STATE
// ============================================
const gameState = {
    isRunning: false,
    isPaused: false,
    score: 0,
    highScore: parseInt(localStorage.getItem('skyFighterHighScore')) || 0,
    enemiesDefeated: 0,
    startTime: 0,
    lastUpdate: 0,
    difficultyLevel: 1,
    bombs: CONFIG.player.startBombs,
    // Portal and level system
    currentLevel: 1,
    portalsSpawned: false,
    inTransition: false,
    gameMessage: null,
    gameMessageEndTime: 0,
};

// ============================================
// ENTITY CLASSES
// ============================================

/**
 * Base class for all game entities
 */
class Entity {
    constructor(x, y, size) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.active = true;
    }

    /**
     * Check collision with another entity (circle collision)
     */
    collidesWith(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.size + other.size;
    }
}

/**
 * Player Plane class
 */
class Player extends Entity {
    constructor(x, y) {
        super(x, y, CONFIG.player.size);
        this.health = CONFIG.player.maxHealth;
        this.velocityX = 0;
        this.velocityY = 0;
        this.lastShot = 0;
        this.isInvincible = false;
        this.invincibleUntil = 0;
        this.flashState = false;

        // Power-up states
        this.powerups = {
            rapid: { active: false, endTime: 0 },
            shield: { active: false, endTime: 0 },
            damage: { active: false, endTime: 0 },
        };

        // Input state
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            shooting: false,
        };

        // Animation
        this.bankAngle = 0; // For tilting when moving left/right
        this.engineFlicker = 0;
    }

    /**
     * Update player state
     */
    update(deltaTime, canvasWidth, canvasHeight) {
        // Calculate velocity from input
        this.velocityX = 0;
        this.velocityY = 0;

        if (this.input.left) this.velocityX -= 1;
        if (this.input.right) this.velocityX += 1;
        if (this.input.up) this.velocityY -= 1;
        if (this.input.down) this.velocityY += 1;

        // Normalize diagonal movement
        if (this.velocityX !== 0 && this.velocityY !== 0) {
            const length = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
            this.velocityX /= length;
            this.velocityY /= length;
        }

        // Apply speed
        this.x += this.velocityX * CONFIG.player.speed;
        this.y += this.velocityY * CONFIG.player.speed;

        // Keep player in bounds
        this.x = Math.max(this.size, Math.min(canvasWidth - this.size, this.x));
        this.y = Math.max(this.size + 60, Math.min(canvasHeight - this.size, this.y)); // Keep below UI

        // Update bank angle for visual effect
        const targetBank = this.velocityX * 0.3;
        this.bankAngle += (targetBank - this.bankAngle) * 0.15;

        // Engine flicker
        this.engineFlicker = Math.random();

        // Update invincibility
        const now = Date.now();
        if (this.isInvincible && now >= this.invincibleUntil) {
            this.isInvincible = false;
        }

        // Update flash state for visual feedback
        if (this.isInvincible && !this.powerups.shield.active) {
            this.flashState = Math.floor(now / 80) % 2 === 0;
        } else {
            this.flashState = false;
        }

        // Update power-ups
        this.updatePowerups(now);

        // Shield provides invincibility
        if (this.powerups.shield.active) {
            this.isInvincible = true;
        }
    }

    /**
     * Update power-up timers
     */
    updatePowerups(now) {
        for (const [type, state] of Object.entries(this.powerups)) {
            if (state.active && now >= state.endTime) {
                state.active = false;

                if (type === 'shield') {
                    audioManager.playShieldDeactivate();
                }
            }
        }
    }

    /**
     * Attempt to shoot
     */
    canShoot() {
        const now = Date.now();
        let cooldown = CONFIG.player.shootCooldown;

        // Rapid fire reduces cooldown
        if (this.powerups.rapid.active) {
            cooldown /= CONFIG.powerups.types.rapid.multiplier;
        }

        if (now - this.lastShot >= cooldown) {
            this.lastShot = now;
            return true;
        }
        return false;
    }

    /**
     * Take damage
     */
    takeDamage(amount) {
        if (this.isInvincible || this.powerups.shield.active) return;

        this.health -= amount;
        this.isInvincible = true;
        this.invincibleUntil = Date.now() + CONFIG.player.invincibilityDuration;

        audioManager.playDamage();

        // Screen shake
        document.body.classList.add('screen-shake');
        setTimeout(() => document.body.classList.remove('screen-shake'), 300);

        if (this.health <= 0) {
            this.health = 0;
            this.active = false;
        }
    }

    /**
     * Heal player
     */
    heal(amount) {
        this.health = Math.min(CONFIG.player.maxHealth, this.health + amount);
        audioManager.playExtraLife();
    }

    /**
     * Activate a power-up
     */
    activatePowerup(type) {
        const powerupConfig = CONFIG.powerups.types[type];
        if (!powerupConfig) return;

        // Handle instant power-ups
        if (type === 'bomb') {
            gameState.bombs++;
            audioManager.playPowerup();
            return;
        }

        if (type === 'life') {
            this.heal(powerupConfig.heal);
            return;
        }

        // Duration-based power-ups
        this.powerups[type].active = true;
        this.powerups[type].endTime = Date.now() + powerupConfig.duration;

        if (type === 'shield') {
            audioManager.playShieldActivate();
        } else {
            audioManager.playPowerup();
        }
    }

    /**
     * Get remaining time for a power-up
     */
    getPowerupTimeRemaining(type) {
        if (!this.powerups[type] || !this.powerups[type].active) return 0;
        return Math.max(0, this.powerups[type].endTime - Date.now());
    }

    /**
     * Draw player plane
     */
    draw(ctx) {
        if (this.flashState) return; // Skip drawing during flash

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.bankAngle);

        // Shield effect
        if (this.powerups.shield.active) {
            ctx.beginPath();
            ctx.arc(0, 0, this.size + 12, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Inner glow
            const gradient = ctx.createRadialGradient(0, 0, this.size, 0, 0, this.size + 18);
            gradient.addColorStop(0, 'rgba(0, 229, 255, 0.25)');
            gradient.addColorStop(1, 'rgba(0, 229, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // Engine flames
        const flameLength = 12 + this.engineFlicker * 8;
        ctx.beginPath();
        ctx.moveTo(-6, this.size * 0.6);
        ctx.lineTo(-3, this.size * 0.6 + flameLength);
        ctx.lineTo(0, this.size * 0.6 + flameLength * 0.7);
        ctx.lineTo(3, this.size * 0.6 + flameLength);
        ctx.lineTo(6, this.size * 0.6);
        ctx.closePath();
        const flameGradient = ctx.createLinearGradient(0, this.size * 0.6, 0, this.size * 0.6 + flameLength);
        flameGradient.addColorStop(0, '#ffff00');
        flameGradient.addColorStop(0.5, '#ff6600');
        flameGradient.addColorStop(1, '#ff0000');
        ctx.fillStyle = flameGradient;
        ctx.fill();

        // Plane body (fighter jet shape)
        ctx.beginPath();
        // Nose
        ctx.moveTo(0, -this.size);
        // Right side
        ctx.lineTo(5, -this.size * 0.5);
        ctx.lineTo(8, -this.size * 0.2);
        // Right wing
        ctx.lineTo(this.size * 1.2, this.size * 0.3);
        ctx.lineTo(this.size * 1.1, this.size * 0.5);
        ctx.lineTo(10, this.size * 0.3);
        // Tail right
        ctx.lineTo(8, this.size * 0.6);
        ctx.lineTo(12, this.size * 0.9);
        ctx.lineTo(6, this.size * 0.7);
        // Center tail
        ctx.lineTo(0, this.size * 0.5);
        // Left tail
        ctx.lineTo(-6, this.size * 0.7);
        ctx.lineTo(-12, this.size * 0.9);
        ctx.lineTo(-8, this.size * 0.6);
        // Left wing
        ctx.lineTo(-10, this.size * 0.3);
        ctx.lineTo(-this.size * 1.1, this.size * 0.5);
        ctx.lineTo(-this.size * 1.2, this.size * 0.3);
        ctx.lineTo(-8, -this.size * 0.2);
        ctx.lineTo(-5, -this.size * 0.5);
        ctx.closePath();

        // Plane gradient fill
        const bodyGradient = ctx.createLinearGradient(0, -this.size, 0, this.size);
        bodyGradient.addColorStop(0, '#4488ff');
        bodyGradient.addColorStop(0.5, '#2266dd');
        bodyGradient.addColorStop(1, '#1144aa');
        ctx.fillStyle = bodyGradient;
        ctx.shadowColor = '#4488ff';
        ctx.shadowBlur = 15;
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#66aaff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Cockpit
        ctx.beginPath();
        ctx.ellipse(0, -this.size * 0.3, 4, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 8;
        ctx.fill();

        ctx.restore();
    }
}

/**
 * Bullet class (for both player and enemy)
 */
class Bullet extends Entity {
    constructor(x, y, angle, speed, damage, isEnemy = false) {
        super(x, y, isEnemy ? CONFIG.enemyBullet.size : CONFIG.bullet.size);
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.isEnemy = isEnemy;
        this.createdAt = Date.now();
        this.lifetime = CONFIG.bullet.lifetime;

        // Trail positions
        this.trail = [];
    }

    update() {
        // Store trail position
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 4) this.trail.shift();

        // Move bullet
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // Check lifetime
        if (Date.now() - this.createdAt > this.lifetime) {
            this.active = false;
        }
    }

    isOutOfBounds(canvasWidth, canvasHeight) {
        return this.x < -this.size || this.x > canvasWidth + this.size ||
            this.y < -this.size || this.y > canvasHeight + this.size;
    }

    draw(ctx) {
        const color = this.isEnemy ? '#ff4444' : '#ffdd00';
        const glowColor = this.isEnemy ? '#ff0000' : '#ffff00';

        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
            const pos = this.trail[i];
            const alpha = (i + 1) / this.trail.length * 0.4;
            const size = this.size * (i + 1) / this.trail.length;

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
            ctx.fillStyle = this.isEnemy ? `rgba(255, 68, 68, ${alpha})` : `rgba(255, 221, 0, ${alpha})`;
            ctx.fill();
        }

        // Draw bullet
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        ctx.fill();
    }
}

/**
 * Enemy Plane class
 */
class Enemy extends Entity {
    constructor(x, y, type) {
        const config = CONFIG.enemies.types[type];
        super(x, y, config.size);

        this.type = type;
        this.speed = config.speed;
        this.maxHealth = config.health;
        this.health = config.health;
        this.color = config.color;
        this.score = config.score;
        this.shootChance = config.shootChance;
        this.damage = 25; // Collision damage
        this.lastShot = Date.now() - Math.random() * CONFIG.enemies.shootCooldown; // Stagger initial shots

        // Movement pattern
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.03 + Math.random() * 0.02;
        this.wobbleAmount = 1 + Math.random() * 1.5;

        // Animation
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update(playerX, playerY, canvasWidth) {
        // Move downward with wobble
        this.wobblePhase += this.wobbleSpeed;
        this.x += Math.sin(this.wobblePhase) * this.wobbleAmount;
        this.y += this.speed;

        // Keep in horizontal bounds
        this.x = Math.max(this.size, Math.min(canvasWidth - this.size, this.x));

        // Update pulse animation
        this.pulsePhase += 0.08;
    }

    /**
     * Check if enemy can shoot
     */
    canShoot() {
        const now = Date.now();
        if (now - this.lastShot >= CONFIG.enemies.shootCooldown) {
            if (Math.random() < this.shootChance) {
                this.lastShot = now;
                return true;
            }
            this.lastShot = now; // Reset even if not shooting
        }
        return false;
    }

    /**
     * Calculate angle to player for shooting
     */
    getAngleToPlayer(playerX, playerY) {
        return Math.atan2(playerY - this.y, playerX - this.x);
    }

    takeDamage(amount) {
        this.health -= amount;
        audioManager.playHit();

        if (this.health <= 0) {
            this.active = false;
            return true; // Enemy died
        }
        return false;
    }

    isOutOfBounds(canvasHeight) {
        return this.y > canvasHeight + this.size * 2;
    }

    draw(ctx) {
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.05;
        const displaySize = this.size * pulse;

        ctx.save();
        ctx.translate(this.x, this.y);
        // Enemies face downward (rotated 180 degrees)
        ctx.rotate(Math.PI);

        // Different plane designs based on type
        if (this.type === 'bomber') {
            this.drawBomber(ctx, displaySize);
        } else if (this.type === 'ace') {
            this.drawAce(ctx, displaySize);
        } else {
            this.drawFighter(ctx, displaySize);
        }

        ctx.restore();

        // Health bar (not rotated)
        const healthPercent = this.health / this.maxHealth;
        const barWidth = displaySize * 2;
        const barHeight = 4;
        const barY = this.y - displaySize - 12;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);

        ctx.fillStyle = healthPercent > 0.3 ? '#00ff00' : '#ff0000';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthPercent, barHeight);
    }

    drawFighter(ctx, size) {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.8, size * 0.3);
        ctx.lineTo(size * 0.3, size * 0.5);
        ctx.lineTo(0, size * 0.8);
        ctx.lineTo(-size * 0.3, size * 0.5);
        ctx.lineTo(-size * 0.8, size * 0.3);
        ctx.closePath();

        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    drawBomber(ctx, size) {
        // Larger, bulkier shape
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.7);
        ctx.lineTo(size * 0.5, -size * 0.3);
        ctx.lineTo(size, size * 0.2);
        ctx.lineTo(size * 0.8, size * 0.6);
        ctx.lineTo(size * 0.3, size * 0.8);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.3, size * 0.8);
        ctx.lineTo(-size * 0.8, size * 0.6);
        ctx.lineTo(-size, size * 0.2);
        ctx.lineTo(-size * 0.5, -size * 0.3);
        ctx.closePath();

        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawAce(ctx, size) {
        // Sleek, fast design
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.1);
        ctx.lineTo(size * 0.4, -size * 0.2);
        ctx.lineTo(size * 1.1, size * 0.3);
        ctx.lineTo(size * 0.3, size * 0.4);
        ctx.lineTo(size * 0.4, size * 0.8);
        ctx.lineTo(0, size * 0.5);
        ctx.lineTo(-size * 0.4, size * 0.8);
        ctx.lineTo(-size * 0.3, size * 0.4);
        ctx.lineTo(-size * 1.1, size * 0.3);
        ctx.lineTo(-size * 0.4, -size * 0.2);
        ctx.closePath();

        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

/**
 * Power-up class
 */
class PowerUp extends Entity {
    constructor(x, y, type) {
        super(x, y, CONFIG.powerups.size);
        this.type = type;
        this.config = CONFIG.powerups.types[type];
        this.floatPhase = Math.random() * Math.PI * 2;
        this.createdAt = Date.now();
        this.lifetime = 12000; // 12 seconds to collect
        this.baseY = y;
    }

    update() {
        // Float down slowly
        this.y += 0.8;

        // Horizontal float animation
        this.floatPhase += 0.06;
        this.x += Math.sin(this.floatPhase) * 0.5;

        // Check lifetime
        if (Date.now() - this.createdAt > this.lifetime) {
            this.active = false;
        }
    }

    isOutOfBounds(canvasHeight) {
        return this.y > canvasHeight + this.size;
    }

    draw(ctx) {
        const pulse = 1 + Math.sin(this.floatPhase * 2) * 0.15;
        const displaySize = this.size * pulse;

        // Fading effect when about to expire
        const timeLeft = this.lifetime - (Date.now() - this.createdAt);
        const alpha = timeLeft < 3000 ? 0.3 + (timeLeft / 3000) * 0.7 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);

        // Outer glow
        ctx.beginPath();
        ctx.arc(0, 0, displaySize + 8, 0, Math.PI * 2);
        const glowGradient = ctx.createRadialGradient(0, 0, displaySize, 0, 0, displaySize + 12);
        glowGradient.addColorStop(0, this.config.color);
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.fill();

        // Inner circle
        ctx.beginPath();
        ctx.arc(0, 0, displaySize, 0, Math.PI * 2);
        ctx.fillStyle = this.config.color;
        ctx.shadowColor = this.config.color;
        ctx.shadowBlur = 20;
        ctx.fill();

        // Icon
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${displaySize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(this.config.icon, 0, 2);

        ctx.restore();
    }
}

/**
 * BlackHole class - Portal that transitions to a new level
 * Dark rotating spiral with gravitational visual effects
 */
class BlackHole extends Entity {
    constructor(x, y) {
        super(x, y, 40);
        this.rotationAngle = 0;
        this.pulsePhase = 0;
        this.createdAt = Date.now();
        this.particles = [];

        // Generate initial accretion disk particles
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                angle: Math.random() * Math.PI * 2,
                distance: 25 + Math.random() * 25,
                speed: 0.02 + Math.random() * 0.03,
                size: 2 + Math.random() * 3,
                color: Math.random() > 0.5 ? '#ff4400' : '#ff8800'
            });
        }
    }

    update() {
        this.rotationAngle += 0.03;
        this.pulsePhase += 0.08;

        // Update accretion disk particles
        this.particles.forEach(p => {
            p.angle += p.speed;
            // Spiral inward slowly
            p.distance -= 0.05;
            if (p.distance < 15) {
                p.distance = 25 + Math.random() * 25;
            }
        });
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const pulse = 1 + Math.sin(this.pulsePhase) * 0.1;

        // Outer gravitational distortion effect (dark purple halo)
        const outerGlow = ctx.createRadialGradient(0, 0, this.size * 0.5, 0, 0, this.size * 2);
        outerGlow.addColorStop(0, 'rgba(50, 0, 80, 0.6)');
        outerGlow.addColorStop(0.5, 'rgba(30, 0, 50, 0.3)');
        outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 2 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = outerGlow;
        ctx.fill();

        // Accretion disk particles (rotating around the hole)
        ctx.save();
        ctx.rotate(this.rotationAngle);
        this.particles.forEach(p => {
            const px = Math.cos(p.angle) * p.distance;
            const py = Math.sin(p.angle) * p.distance * 0.4; // Elliptical orbit
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fill();
        });
        ctx.restore();

        // Event horizon ring (orange-red glow)
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.8 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 20;
        ctx.stroke();

        // Inner black core with gradient
        const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size * 0.7);
        coreGradient.addColorStop(0, '#000000');
        coreGradient.addColorStop(0.7, '#0a0015');
        coreGradient.addColorStop(1, '#1a0030');
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = coreGradient;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 30;
        ctx.fill();

        // Rotating spiral lines
        ctx.save();
        ctx.rotate(this.rotationAngle * 2);
        for (let i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(
                this.size * 0.3, this.size * 0.2,
                this.size * 0.5, 0
            );
            ctx.strokeStyle = 'rgba(100, 50, 150, 0.4)';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            ctx.stroke();
        }
        ctx.restore();

        ctx.restore();
    }
}

/**
 * WhiteHole class - Portal that resets the score
 * Bright glowing portal with light rays
 */
class WhiteHole extends Entity {
    constructor(x, y) {
        super(x, y, 40);
        this.glowPhase = 0;
        this.rayRotation = 0;
        this.createdAt = Date.now();
        this.sparkles = [];

        // Generate sparkle particles
        for (let i = 0; i < 15; i++) {
            this.sparkles.push({
                angle: Math.random() * Math.PI * 2,
                distance: 30 + Math.random() * 30,
                size: 1 + Math.random() * 3,
                speed: 0.01 + Math.random() * 0.02,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    update() {
        this.glowPhase += 0.06;
        this.rayRotation += 0.015;

        // Update sparkles
        this.sparkles.forEach(s => {
            s.phase += 0.1;
            s.angle += s.speed;
        });
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const glowIntensity = 0.7 + Math.sin(this.glowPhase) * 0.3;
        const pulse = 1 + Math.sin(this.glowPhase * 0.5) * 0.1;

        // Outer glow aura
        const outerGlow = ctx.createRadialGradient(0, 0, this.size * 0.3, 0, 0, this.size * 2.5);
        outerGlow.addColorStop(0, `rgba(255, 255, 255, ${0.4 * glowIntensity})`);
        outerGlow.addColorStop(0.3, `rgba(200, 230, 255, ${0.25 * glowIntensity})`);
        outerGlow.addColorStop(0.6, `rgba(150, 200, 255, ${0.1 * glowIntensity})`);
        outerGlow.addColorStop(1, 'rgba(100, 150, 255, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 2.5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = outerGlow;
        ctx.fill();

        // Light rays emanating outward
        ctx.save();
        ctx.rotate(this.rayRotation);
        for (let i = 0; i < 12; i++) {
            ctx.rotate(Math.PI / 6);
            ctx.beginPath();
            ctx.moveTo(this.size * 0.5, 0);
            ctx.lineTo(this.size * 1.8, 0);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * glowIntensity})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();

        // Sparkle particles
        this.sparkles.forEach(s => {
            const sparkleAlpha = 0.3 + Math.sin(s.phase) * 0.4;
            const sx = Math.cos(s.angle) * s.distance;
            const sy = Math.sin(s.angle) * s.distance;

            ctx.beginPath();
            ctx.arc(sx, sy, s.size * (0.5 + Math.sin(s.phase) * 0.5), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, sparkleAlpha)})`;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 10;
            ctx.fill();
        });

        // Middle ring
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.7 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(200, 230, 255, ${0.8 * glowIntensity})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#88ccff';
        ctx.shadowBlur = 25;
        ctx.stroke();

        // Bright white core
        const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size * 0.6);
        coreGradient.addColorStop(0, '#ffffff');
        coreGradient.addColorStop(0.5, '#eeffff');
        coreGradient.addColorStop(1, '#aaddff');
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = coreGradient;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 40;
        ctx.fill();

        ctx.restore();
    }
}

/**
 * Particle class for explosions
 */
class Particle {
    constructor(x, y, color, isBig = false) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = isBig ? Math.random() * 8 + 4 : Math.random() * 5 + 2;

        const angle = Math.random() * Math.PI * 2;
        const speed = isBig ? Math.random() * 8 + 4 : Math.random() * 6 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.life = 1;
        this.decay = isBig ? 0.015 : 0.02 + Math.random() * 0.02;
        this.gravity = 0.1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= 0.98;
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    isDead() {
        return this.life <= 0;
    }
}

/**
 * Cloud class for background
 */
class Cloud {
    constructor(canvasWidth, canvasHeight, startAtTop = false) {
        this.x = Math.random() * canvasWidth;
        this.y = startAtTop ? -50 : Math.random() * canvasHeight;
        this.width = 60 + Math.random() * 100;
        this.height = 30 + Math.random() * 40;
        this.speed = CONFIG.clouds.minSpeed + Math.random() * (CONFIG.clouds.maxSpeed - CONFIG.clouds.minSpeed);
        this.opacity = 0.1 + Math.random() * 0.15;
    }

    update(canvasHeight) {
        this.y += this.speed;
        if (this.y > canvasHeight + this.height) {
            return false; // Remove cloud
        }
        return true;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = '#ffffff';

        // Simple cloud shape
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.width * 0.5, this.height * 0.5, 0, 0, Math.PI * 2);
        ctx.ellipse(this.x - this.width * 0.3, this.y + 5, this.width * 0.35, this.height * 0.4, 0, 0, Math.PI * 2);
        ctx.ellipse(this.x + this.width * 0.3, this.y + 5, this.width * 0.35, this.height * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ============================================
// MAIN GAME CLASS
// ============================================
class Game {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Entity arrays
        this.player = null;
        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.powerups = [];
        this.particles = [];
        this.clouds = [];

        // Portal objects
        this.blackHole = null;
        this.whiteHole = null;

        // Background gradient
        this.skyGradient = null;

        // Level transition effect
        this.transitionAlpha = 0;
        this.transitionDirection = 0; // 0 = none, 1 = fade out, -1 = fade in

        // Timers
        this.lastEnemySpawn = 0;
        this.lastFrameTime = 0;

        // UI Elements
        this.ui = {
            healthFill: document.getElementById('health-fill'),
            healthText: document.getElementById('health-text'),
            scoreValue: document.getElementById('score-value'),
            startScreen: document.getElementById('start-screen'),
            gameoverScreen: document.getElementById('gameover-screen'),
            finalScore: document.getElementById('final-score-value'),
            highScore: document.getElementById('high-score-value'),
            enemiesDefeated: document.getElementById('enemies-defeated'),
            timeSurvived: document.getElementById('time-survived'),
            soundToggle: document.getElementById('sound-toggle'),
            powerupRapid: document.getElementById('powerup-rapid'),
            powerupShield: document.getElementById('powerup-shield'),
            powerupDamage: document.getElementById('powerup-damage'),
            powerupBomb: document.getElementById('powerup-bomb'),
            powerupLife: document.getElementById('powerup-life'),
            levelValue: document.getElementById('level-value'),
        };

        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);

        // Mobile joystick state
        this.joystick = {
            active: false,
            touchId: null,
            startX: 0,
            startY: 0,
        };

        // Initialize
        this.init();
    }

    /**
     * Initialize game
     */
    init() {
        this.resizeCanvas();
        this.createSkyGradient();
        this.generateClouds();
        this.setupEventListeners();
        this.updateHighScoreDisplay();

        // Start render loop (for start screen background)
        this.renderBackground();
    }

    /**
     * Resize canvas to fill window
     */
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Create sky gradient based on current level
     */
    createSkyGradient() {
        this.skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);

        // Different themes based on level
        const level = gameState.currentLevel || 1;

        switch (level) {
            case 1: // Default purple sky
                this.skyGradient.addColorStop(0, '#1a1a3a');
                this.skyGradient.addColorStop(0.5, '#2a2a5a');
                this.skyGradient.addColorStop(1, '#4a2a6a');
                break;
            case 2: // Sunset orange-red
                this.skyGradient.addColorStop(0, '#1a0a2a');
                this.skyGradient.addColorStop(0.3, '#4a1a3a');
                this.skyGradient.addColorStop(0.6, '#8a3030');
                this.skyGradient.addColorStop(1, '#cc5522');
                break;
            case 3: // Deep space blue-black with stars effect
                this.skyGradient.addColorStop(0, '#000010');
                this.skyGradient.addColorStop(0.5, '#0a1030');
                this.skyGradient.addColorStop(1, '#102050');
                break;
            case 4: // Alien green nebula
                this.skyGradient.addColorStop(0, '#0a1a0a');
                this.skyGradient.addColorStop(0.4, '#1a3a2a');
                this.skyGradient.addColorStop(0.7, '#2a4a3a');
                this.skyGradient.addColorStop(1, '#1a5a4a');
                break;
            default: // Intense warzone red for high levels
                const intensity = Math.min((level - 4) * 0.1, 0.5);
                this.skyGradient.addColorStop(0, `rgb(${30 + intensity * 50}, 10, 20)`);
                this.skyGradient.addColorStop(0.5, `rgb(${50 + intensity * 80}, 20, 40)`);
                this.skyGradient.addColorStop(1, `rgb(${80 + intensity * 100}, 30, 50)`);
        }
    }

    /**
     * Generate initial clouds
     */
    generateClouds() {
        this.clouds = [];
        for (let i = 0; i < CONFIG.clouds.count; i++) {
            this.clouds.push(new Cloud(this.canvas.width, this.canvas.height, false));
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.createSkyGradient();
        });

        // Keyboard
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        // Mouse
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);

        // Touch controls for mobile
        this.setupMobileControls();

        // Buttons
        document.getElementById('start-button').addEventListener('click', () => this.startGame());
        document.getElementById('restart-button').addEventListener('click', () => this.startGame());

        // Sound toggle
        this.ui.soundToggle.addEventListener('click', () => {
            audioManager.init();
            const muted = audioManager.toggleMute();
            this.ui.soundToggle.textContent = muted ? '🔇' : '🔊';
            this.ui.soundToggle.classList.toggle('muted', muted);
        });
    }

    /**
     * Setup mobile touch controls with improved responsiveness
     */
    setupMobileControls() {
        // Fire button - continuous firing while held
        const fireButton = document.getElementById('fire-button');
        if (fireButton) {
            fireButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                audioManager.init(); // Initialize audio on first touch
                if (this.player && gameState.isRunning) {
                    this.player.input.shooting = true;
                }
            }, { passive: false });

            fireButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.player) {
                    this.player.input.shooting = false;
                }
            }, { passive: false });

            fireButton.addEventListener('touchcancel', (e) => {
                if (this.player) {
                    this.player.input.shooting = false;
                }
            });
        }

        // Bomb button
        const bombButton = document.getElementById('bomb-button');
        if (bombButton) {
            bombButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                audioManager.init();
                this.useBomb();
            }, { passive: false });
        }

        // Joystick Zone - touch anywhere in the left zone to activate joystick
        const joystickZone = document.getElementById('joystick-zone');
        if (joystickZone) {
            joystickZone.addEventListener('touchstart', (e) => this.handleJoystickStart(e), { passive: false });
            joystickZone.addEventListener('touchmove', (e) => this.handleJoystickMove(e), { passive: false });
            joystickZone.addEventListener('touchend', (e) => this.handleJoystickEnd(e), { passive: false });
            joystickZone.addEventListener('touchcancel', (e) => this.handleJoystickEnd(e), { passive: false });
        }

        // Also attach to joystick base directly for backward compatibility
        const joystickBase = document.getElementById('joystick-base');
        if (joystickBase) {
            joystickBase.addEventListener('touchstart', (e) => this.handleJoystickStart(e), { passive: false });
            joystickBase.addEventListener('touchmove', (e) => this.handleJoystickMove(e), { passive: false });
            joystickBase.addEventListener('touchend', (e) => this.handleJoystickEnd(e), { passive: false });
            joystickBase.addEventListener('touchcancel', (e) => this.handleJoystickEnd(e), { passive: false });
        }

        // Prevent default touch behaviors on canvas to avoid scrolling/zooming
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
    }


    // ============================================
    // INPUT HANDLERS
    // ============================================

    handleKeyDown(e) {
        // Prevent default for game keys
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyB'].includes(e.code)) {
            e.preventDefault();
        }

        if (!this.player || !gameState.isRunning) return;

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.player.input.up = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.player.input.down = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.player.input.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.player.input.right = true;
                break;
            case 'Space':
                this.player.input.shooting = true;
                break;
            case 'KeyB':
                this.useBomb();
                break;
        }
    }

    handleKeyUp(e) {
        if (!this.player) return;

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.player.input.up = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.player.input.down = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.player.input.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.player.input.right = false;
                break;
            case 'Space':
                this.player.input.shooting = false;
                break;
        }
    }

    handleMouseDown(e) {
        if (!this.player || !gameState.isRunning) return;
        if (e.button === 0) {
            this.player.input.shooting = true;
        }
    }

    handleMouseUp(e) {
        if (!this.player) return;
        if (e.button === 0) {
            this.player.input.shooting = false;
        }
    }

    handleJoystickStart(e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.touches.length === 0) return;

        const touch = e.touches[0];
        const joystickBase = document.getElementById('joystick-base');

        if (!joystickBase) return;

        const rect = joystickBase.getBoundingClientRect();

        this.joystick.active = true;
        this.joystick.touchId = touch.identifier;
        this.joystick.startX = rect.left + rect.width / 2;
        this.joystick.startY = rect.top + rect.height / 2;

        // Immediately process this touch as a move
        this.processJoystickTouch(touch);
    }

    handleJoystickMove(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!this.joystick.active) return;

        // Find the touch that started the joystick
        let touch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === this.joystick.touchId) {
                touch = e.touches[i];
                break;
            }
        }

        if (!touch && e.touches.length > 0) {
            touch = e.touches[0];
        }

        if (touch) {
            this.processJoystickTouch(touch);
        }
    }

    processJoystickTouch(touch) {
        const dx = touch.clientX - this.joystick.startX;
        const dy = touch.clientY - this.joystick.startY;
        const maxOffset = 45;

        // Clamp to max offset
        const distance = Math.sqrt(dx * dx + dy * dy);
        const clampedDistance = Math.min(distance, maxOffset);
        const angle = Math.atan2(dy, dx);

        const offsetX = Math.cos(angle) * clampedDistance;
        const offsetY = Math.sin(angle) * clampedDistance;

        // Move joystick stick visually
        const stick = document.getElementById('joystick-stick');
        if (stick) {
            stick.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        }

        // Update player input based on normalized distance
        if (this.player && gameState.isRunning) {
            const threshold = 12;
            const normalizedDistance = distance / maxOffset;

            // Use cardinal directions with some dead zone
            this.player.input.left = dx < -threshold;
            this.player.input.right = dx > threshold;
            this.player.input.up = dy < -threshold;
            this.player.input.down = dy > threshold;
        }
    }

    handleJoystickEnd(e) {
        e.preventDefault();
        e.stopPropagation();

        // Check if our tracked touch ended
        let touchEnded = true;
        if (e.touches) {
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.joystick.touchId) {
                    touchEnded = false;
                    break;
                }
            }
        }

        if (touchEnded) {
            this.joystick.active = false;
            this.joystick.touchId = null;

            const stick = document.getElementById('joystick-stick');
            if (stick) {
                stick.style.transform = 'translate(0, 0)';
            }

            if (this.player) {
                this.player.input.left = false;
                this.player.input.right = false;
                this.player.input.up = false;
                this.player.input.down = false;
            }
        }
    }


    // ============================================
    // GAME CONTROL
    // ============================================

    /**
     * Start a new game
     */
    startGame() {
        // Initialize audio on first interaction
        audioManager.init();
        audioManager.playClick();

        // Reset game state
        gameState.isRunning = true;
        gameState.isPaused = false;
        gameState.score = 0;
        gameState.enemiesDefeated = 0;
        gameState.startTime = Date.now();
        gameState.difficultyLevel = 1;
        gameState.bombs = CONFIG.player.startBombs;

        // Reset portal and level state
        gameState.currentLevel = 1;
        gameState.portalsSpawned = false;
        gameState.inTransition = false;
        gameState.gameMessage = null;
        gameState.gameMessageEndTime = 0;

        // Create player at center bottom
        this.player = new Player(
            this.canvas.width / 2,
            this.canvas.height - 100
        );

        // Clear entities
        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.powerups = [];
        this.particles = [];

        // Clear portals
        this.blackHole = null;
        this.whiteHole = null;
        this.transitionAlpha = 0;
        this.transitionDirection = 0;

        // Reset clouds and background
        this.generateClouds();
        this.createSkyGradient();

        // Reset timers
        this.lastEnemySpawn = Date.now();
        this.lastFrameTime = Date.now();

        // Hide screens
        this.ui.startScreen.classList.add('hidden');
        this.ui.gameoverScreen.classList.add('hidden');

        // Start game loop
        requestAnimationFrame(this.gameLoop);
    }

    /**
     * Use bomb - destroy all enemies
     */
    useBomb() {
        if (!gameState.isRunning || gameState.bombs <= 0) return;

        gameState.bombs--;
        audioManager.playBombExplosion();

        // Flash effect
        document.body.classList.add('bomb-flash');
        setTimeout(() => document.body.classList.remove('bomb-flash'), 300);

        // Destroy all enemies and enemy bullets
        for (const enemy of this.enemies) {
            gameState.score += enemy.score;
            gameState.enemiesDefeated++;
            this.createExplosion(enemy.x, enemy.y, enemy.color, true);
        }
        this.enemies = [];
        this.enemyBullets = [];
    }

    /**
     * End the game
     */
    endGame() {
        gameState.isRunning = false;

        audioManager.playGameOver();

        // Create big explosion for player
        this.createExplosion(this.player.x, this.player.y, '#4488ff', true);

        // Update high score
        if (gameState.score > gameState.highScore) {
            gameState.highScore = gameState.score;
            localStorage.setItem('skyFighterHighScore', gameState.highScore);
        }

        // Calculate time survived
        const timeSurvivedMs = Date.now() - gameState.startTime;
        const minutes = Math.floor(timeSurvivedMs / 60000);
        const seconds = Math.floor((timeSurvivedMs % 60000) / 1000);

        // Update game over screen
        this.ui.finalScore.textContent = gameState.score;
        this.ui.highScore.textContent = gameState.highScore;
        this.ui.enemiesDefeated.textContent = gameState.enemiesDefeated;
        this.ui.timeSurvived.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Show game over screen after short delay
        setTimeout(() => {
            this.ui.gameoverScreen.classList.remove('hidden');
        }, 500);
    }

    /**
     * Update high score display
     */
    updateHighScoreDisplay() {
        this.ui.highScore.textContent = gameState.highScore;
    }

    // ============================================
    // GAME LOOP
    // ============================================

    /**
     * Main game loop
     */
    gameLoop(timestamp) {
        if (!gameState.isRunning) {
            // Continue rendering particles after game over
            this.renderGameOver();
            return;
        }

        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        // Update
        this.update(deltaTime);

        // Render
        this.render();

        // Continue loop
        requestAnimationFrame(this.gameLoop);
    }

    /**
     * Render after game over (for particles)
     */
    renderGameOver() {
        // Update and render remaining particles
        this.particles = this.particles.filter(p => {
            p.update();
            return !p.isDead();
        });

        if (this.particles.length > 0) {
            this.render();
            requestAnimationFrame(() => this.renderGameOver());
        }
    }

    /**
     * Update game state
     */
    update(deltaTime) {
        const now = Date.now();

        // Update clouds
        this.updateClouds();

        // Update player (skip if in transition)
        if (!gameState.inTransition) {
            this.player.update(deltaTime, this.canvas.width, this.canvas.height);

            // Handle shooting
            if (this.player.input.shooting && this.player.canShoot()) {
                this.shoot();
            }
        }

        // Spawn enemies
        this.spawnEnemies(now);

        // Spawn portals when score threshold reached
        this.spawnPortals();

        // Update portals
        if (this.blackHole) {
            this.blackHole.update();
        }
        if (this.whiteHole) {
            this.whiteHole.update();
        }

        // Update player bullets
        this.bullets = this.bullets.filter(bullet => {
            bullet.update();
            return bullet.active && !bullet.isOutOfBounds(this.canvas.width, this.canvas.height);
        });

        // Update enemy bullets
        this.enemyBullets = this.enemyBullets.filter(bullet => {
            bullet.update();
            return bullet.active && !bullet.isOutOfBounds(this.canvas.width, this.canvas.height);
        });

        // Update enemies
        this.enemies.forEach(enemy => {
            enemy.update(this.player.x, this.player.y, this.canvas.width);

            // Enemy shooting
            if (enemy.canShoot() && enemy.y > 50 && enemy.y < this.canvas.height * 0.7) {
                this.enemyShoot(enemy);
            }
        });

        // Remove enemies that went off screen
        this.enemies = this.enemies.filter(e => !e.isOutOfBounds(this.canvas.height));

        // Update power-ups
        this.powerups = this.powerups.filter(powerup => {
            powerup.update();
            return powerup.active && !powerup.isOutOfBounds(this.canvas.height);
        });

        // Update particles
        this.particles = this.particles.filter(particle => {
            particle.update();
            return !particle.isDead();
        });

        // Check collisions
        this.checkCollisions();

        // Check portal collisions (only if not in transition)
        if (!gameState.inTransition) {
            this.checkPortalCollisions();
        }

        // Handle level transition animation
        this.updateTransition();

        // Update game message
        if (gameState.gameMessage && now > gameState.gameMessageEndTime) {
            gameState.gameMessage = null;
        }

        // Update difficulty
        this.updateDifficulty();

        // Update UI
        this.updateUI();

        // Check game over
        if (!this.player.active) {
            this.endGame();
        }
    }

    /**
     * Update clouds
     */
    updateClouds() {
        // Update existing clouds
        this.clouds = this.clouds.filter(cloud => cloud.update(this.canvas.height));

        // Add new clouds
        if (Math.random() < 0.02 && this.clouds.length < CONFIG.clouds.count * 1.5) {
            this.clouds.push(new Cloud(this.canvas.width, this.canvas.height, true));
        }
    }

    /**
     * Spawn portals when score threshold is reached
     * Portals spawn only once per level/area
     */
    spawnPortals() {
        // Spawn portals when score reaches threshold and not already spawned
        const spawnThreshold = 50 + (gameState.currentLevel - 1) * 100; // Increases each level

        if (gameState.score >= spawnThreshold && !gameState.portalsSpawned && !gameState.inTransition) {
            gameState.portalsSpawned = true;

            // Calculate spawn positions (upper portion of screen, away from edges)
            const margin = 100;
            const minDistance = 150; // Minimum distance between portals

            // Random position for Black Hole
            const blackHoleX = margin + Math.random() * (this.canvas.width - margin * 2);
            const blackHoleY = 120 + Math.random() * (this.canvas.height * 0.3);

            // Random position for White Hole (ensure distance from Black Hole)
            let whiteHoleX, whiteHoleY;
            let attempts = 0;
            do {
                whiteHoleX = margin + Math.random() * (this.canvas.width - margin * 2);
                whiteHoleY = 120 + Math.random() * (this.canvas.height * 0.3);
                attempts++;
            } while (
                Math.sqrt(Math.pow(whiteHoleX - blackHoleX, 2) + Math.pow(whiteHoleY - blackHoleY, 2)) < minDistance
                && attempts < 20
            );

            this.blackHole = new BlackHole(blackHoleX, blackHoleY);
            this.whiteHole = new WhiteHole(whiteHoleX, whiteHoleY);

            audioManager.playPortalSpawn();
        }
    }

    /**
     * Check collisions between player and portals
     */
    checkPortalCollisions() {
        if (!this.player || !this.player.active) return;

        // Check Black Hole collision
        if (this.blackHole && this.player.collidesWith(this.blackHole)) {
            this.enterBlackHole();
            return;
        }

        // Check White Hole collision
        if (this.whiteHole && this.player.collidesWith(this.whiteHole)) {
            this.enterWhiteHole();
            return;
        }
    }

    /**
     * Handle entering Black Hole - transition to new level
     */
    enterBlackHole() {
        if (gameState.inTransition) return;

        gameState.inTransition = true;
        this.transitionDirection = 1; // Start fade out

        audioManager.playBlackHoleEnter();

        // Remove both portals
        this.blackHole = null;
        this.whiteHole = null;
    }

    /**
     * Handle entering White Hole - reset score
     */
    enterWhiteHole() {
        // Reset score to 0
        gameState.score = 0;

        audioManager.playWhiteHoleEnter();

        // Show message
        this.showGameMessage('⚪ SCORE RESET', 2000);

        // Remove only the White Hole (Black Hole stays if exists)
        this.whiteHole = null;

        // Flash effect
        document.body.classList.add('whitehole-flash');
        setTimeout(() => document.body.classList.remove('whitehole-flash'), 300);
    }

    /**
     * Update level transition animation
     */
    updateTransition() {
        if (this.transitionDirection === 0) return;

        const fadeSpeed = 0.02;

        if (this.transitionDirection === 1) {
            // Fade out
            this.transitionAlpha += fadeSpeed;
            if (this.transitionAlpha >= 1) {
                this.transitionAlpha = 1;
                this.completeTransition();
            }
        } else if (this.transitionDirection === -1) {
            // Fade in
            this.transitionAlpha -= fadeSpeed;
            if (this.transitionAlpha <= 0) {
                this.transitionAlpha = 0;
                this.transitionDirection = 0;
                gameState.inTransition = false;
            }
        }
    }

    /**
     * Complete transition to new level
     */
    completeTransition() {
        // Increment level
        gameState.currentLevel++;

        // Reset portal spawn flag for new level
        gameState.portalsSpawned = false;

        // Increase difficulty
        gameState.difficultyLevel = Math.max(gameState.difficultyLevel, gameState.currentLevel);

        // Clear enemies and bullets
        this.enemies = [];
        this.enemyBullets = [];
        this.powerups = [];

        // Reset portals
        this.blackHole = null;
        this.whiteHole = null;

        // Update background for new level
        this.createSkyGradient();

        // Show message
        this.showGameMessage(`🌌 ENTERING AREA ${gameState.currentLevel}`, 2500);

        // Start fade in
        this.transitionDirection = -1;

        // Reset enemy spawn timer to give player a brief pause
        this.lastEnemySpawn = Date.now() + 2000;
    }

    /**
     * Show a temporary game message on screen
     */
    showGameMessage(text, duration = 2000) {
        gameState.gameMessage = text;
        gameState.gameMessageEndTime = Date.now() + duration;
    }


    /**
     * Create a player bullet
     */
    shoot() {
        audioManager.playShoot();

        let damage = CONFIG.bullet.damage;
        if (this.player.powerups.damage.active) {
            damage *= CONFIG.powerups.types.damage.multiplier;
        }

        // Shoot upward
        const bullet = new Bullet(
            this.player.x,
            this.player.y - this.player.size,
            -Math.PI / 2, // Straight up
            CONFIG.bullet.speed,
            damage,
            false
        );

        this.bullets.push(bullet);
    }

    /**
     * Enemy shoots at player
     */
    enemyShoot(enemy) {
        audioManager.playEnemyShoot();

        const angle = enemy.getAngleToPlayer(this.player.x, this.player.y);

        const bullet = new Bullet(
            enemy.x,
            enemy.y + enemy.size,
            angle,
            CONFIG.enemyBullet.speed,
            CONFIG.enemyBullet.damage,
            true
        );

        this.enemyBullets.push(bullet);
    }

    /**
     * Spawn enemies
     */
    spawnEnemies(now) {
        // Calculate spawn rate based on difficulty
        const spawnRate = Math.max(
            CONFIG.enemies.minSpawnRate,
            CONFIG.enemies.spawnRate - (gameState.difficultyLevel - 1) * CONFIG.difficulty.spawnRateReduction
        );

        if (now - this.lastEnemySpawn >= spawnRate) {
            this.lastEnemySpawn = now;

            // Choose enemy type based on probability and difficulty
            const rand = Math.random();
            let type;
            if (gameState.difficultyLevel < 3) {
                // Early game: mostly fighters
                if (rand < 0.7) type = 'fighter';
                else if (rand < 0.9) type = 'ace';
                else type = 'bomber';
            } else {
                // Later game: more variety
                if (rand < 0.5) type = 'fighter';
                else if (rand < 0.75) type = 'ace';
                else type = 'bomber';
            }

            // Spawn at top of screen, random x position
            const config = CONFIG.enemies.types[type];
            const x = config.size + Math.random() * (this.canvas.width - config.size * 2);
            const y = -config.size;

            this.enemies.push(new Enemy(x, y, type));
        }
    }

    /**
     * Check all collisions
     */
    checkCollisions() {
        // Player bullets vs Enemies
        for (const bullet of this.bullets) {
            if (!bullet.active) continue;

            for (const enemy of this.enemies) {
                if (!enemy.active) continue;

                if (bullet.collidesWith(enemy)) {
                    bullet.active = false;

                    if (enemy.takeDamage(bullet.damage)) {
                        // Enemy destroyed
                        gameState.score += enemy.score;
                        gameState.enemiesDefeated++;

                        audioManager.playExplosion();
                        this.createExplosion(enemy.x, enemy.y, enemy.color);

                        // Chance to drop power-up
                        if (Math.random() < CONFIG.powerups.dropChance) {
                            this.spawnPowerup(enemy.x, enemy.y);
                        }
                    }

                    break;
                }
            }
        }

        // Remove destroyed enemies
        this.enemies = this.enemies.filter(e => e.active);

        // Enemy bullets vs Player
        for (const bullet of this.enemyBullets) {
            if (!bullet.active) continue;

            if (bullet.collidesWith(this.player)) {
                bullet.active = false;
                this.player.takeDamage(bullet.damage);
            }
        }

        // Enemies vs Player (collision)
        for (const enemy of this.enemies) {
            if (enemy.collidesWith(this.player)) {
                this.player.takeDamage(enemy.damage);
                enemy.active = false;
                this.createExplosion(enemy.x, enemy.y, enemy.color);
                audioManager.playExplosion();
            }
        }

        // Power-ups vs Player
        for (const powerup of this.powerups) {
            if (powerup.collidesWith(this.player)) {
                this.player.activatePowerup(powerup.type);
                powerup.active = false;
            }
        }
    }

    /**
     * Create explosion particles
     */
    createExplosion(x, y, color, isBig = false) {
        const count = isBig ? CONFIG.particles.explosionCount * 2 : CONFIG.particles.explosionCount;
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color, isBig));
            // Add some fire-colored particles
            if (i % 3 === 0) {
                this.particles.push(new Particle(x, y, '#ff6600', isBig));
            }
        }
    }

    /**
     * Spawn a random power-up
     */
    spawnPowerup(x, y) {
        const types = Object.keys(CONFIG.powerups.types);
        const type = types[Math.floor(Math.random() * types.length)];
        this.powerups.push(new PowerUp(x, y, type));
    }

    /**
     * Update difficulty based on score
     */
    updateDifficulty() {
        const newLevel = Math.floor(gameState.score / CONFIG.difficulty.scoreThreshold) + 1;
        if (newLevel > gameState.difficultyLevel) {
            gameState.difficultyLevel = newLevel;
        }
    }

    /**
     * Update UI elements
     */
    updateUI() {
        // Health bar
        const healthPercent = (this.player.health / CONFIG.player.maxHealth) * 100;
        this.ui.healthFill.style.width = `${healthPercent}%`;
        this.ui.healthText.textContent = Math.ceil(this.player.health);

        if (healthPercent <= 25) {
            this.ui.healthFill.classList.add('low');
        } else {
            this.ui.healthFill.classList.remove('low');
        }

        // Score
        this.ui.scoreValue.textContent = gameState.score;

        // Level/Area
        if (this.ui.levelValue) {
            this.ui.levelValue.textContent = gameState.currentLevel;
        }

        // Power-up indicators
        this.updatePowerupIndicator('rapid', this.ui.powerupRapid);
        this.updatePowerupIndicator('shield', this.ui.powerupShield);
        this.updatePowerupIndicator('damage', this.ui.powerupDamage);

        // Bomb count
        const bombActive = gameState.bombs > 0;
        this.ui.powerupBomb.classList.toggle('active', bombActive);
        const bombCount = this.ui.powerupBomb.querySelector('.powerup-count');
        bombCount.textContent = bombActive ? `x${gameState.bombs}` : '';

        // Life indicator (always show as reminder)
        this.ui.powerupLife.classList.remove('active');
    }

    /**
     * Update a single power-up indicator
     */
    updatePowerupIndicator(type, element) {
        const remaining = this.player.getPowerupTimeRemaining(type);
        const isActive = remaining > 0;

        element.classList.toggle('active', isActive);

        const timerEl = element.querySelector('.powerup-timer');
        if (isActive) {
            timerEl.textContent = Math.ceil(remaining / 1000) + 's';
        } else {
            timerEl.textContent = '';
        }
    }

    // ============================================
    // RENDERING
    // ============================================

    /**
     * Render background (for start screen)
     */
    renderBackground() {
        // Draw sky gradient
        this.ctx.fillStyle = this.skyGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw clouds
        this.updateClouds();
        this.clouds.forEach(cloud => cloud.draw(this.ctx));

        if (!gameState.isRunning) {
            requestAnimationFrame(() => this.renderBackground());
        }
    }

    /**
     * Main render function
     */
    render() {
        // Draw sky gradient
        this.ctx.fillStyle = this.skyGradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw clouds
        this.clouds.forEach(cloud => cloud.draw(this.ctx));

        // Draw portals (behind other entities)
        if (this.blackHole) {
            this.blackHole.draw(this.ctx);
        }
        if (this.whiteHole) {
            this.whiteHole.draw(this.ctx);
        }

        // Draw entities
        this.powerups.forEach(p => p.draw(this.ctx));
        this.enemyBullets.forEach(b => b.draw(this.ctx));
        this.bullets.forEach(b => b.draw(this.ctx));
        this.enemies.forEach(e => e.draw(this.ctx));
        this.particles.forEach(p => p.draw(this.ctx));

        if (this.player && this.player.active) {
            this.player.draw(this.ctx);
        }

        // Draw game message
        if (gameState.gameMessage) {
            this.renderGameMessage();
        }

        // Draw transition overlay
        if (this.transitionAlpha > 0) {
            this.ctx.fillStyle = `rgba(0, 0, 0, ${this.transitionAlpha})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    /**
     * Render game message on screen
     */
    renderGameMessage() {
        const ctx = this.ctx;
        const message = gameState.gameMessage;
        const timeLeft = gameState.gameMessageEndTime - Date.now();
        const duration = 2000; // Approximate, used for fade calculation

        // Calculate alpha for fade in/out effect
        let alpha = 1;
        if (timeLeft < 500) {
            alpha = timeLeft / 500; // Fade out
        } else if (timeLeft > duration - 500) {
            alpha = (duration - timeLeft + 500) / 500; // Fade in
        }
        alpha = Math.max(0, Math.min(1, alpha));

        ctx.save();
        ctx.globalAlpha = alpha;

        // Message background
        const fontSize = Math.min(36, this.canvas.width * 0.06);
        ctx.font = `bold ${fontSize}px Impact, Arial Black, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(message).width;
        const padding = 20;
        const bgX = (this.canvas.width - textWidth) / 2 - padding;
        const bgY = this.canvas.height / 2 - 40;
        const bgWidth = textWidth + padding * 2;
        const bgHeight = fontSize + padding * 1.5;

        // Rounded rectangle background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 10);
        ctx.fill();

        // Border glow
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 15;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 5;
        ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2 - 40 + bgHeight / 2);

        ctx.restore();
    }
}

// ============================================
// INITIALIZE GAME
// ============================================
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
});
