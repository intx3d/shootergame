// Basic Phaser 3 game setup for a top-down shooter
const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 960,
  backgroundColor: "#222",
  parent: "game-container",
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: {
    preload: preload,
    create: create,
    update: update,
  },
};

let potions;
let player;
let cursors;
let bullets;
let lastFired = 0;
let lastDirection = { x: 0, y: -1 }; // Default shoot up
// No need for custom pointer tracking; use this.input.activePointer
let enemies;
let enemySpawnTimer;
// Enemy types: speed and health
const ENEMY_TYPES = [
  { color: 0xff3333, speed: 80, health: 1 }, // Type 1: slow, weak
  { color: 0x33ff33, speed: 120, health: 2 }, // Type 2: medium
  { color: 0x3333ff, speed: 160, health: 3 }, // Type 3: fast, tough
];
let score = 0;
let scoreText;
let health = 100;
let healthText;
let gameOver = false;
let gameOverText;
let menuOverlay;
let startButton;
let gameStarted = false;
let pauseButton;
let pauseOverlay;
let resumeButton;
let restartButton;
let isPaused = false;
const POTION_HEAL = 30;
const game = new Phaser.Game(config);

function preload() {
  // Create a simple bullet texture using graphics
  const graphics = this.make.graphics({ x: 0, y: 0, add: false });
  graphics.fillStyle(0xffd700, 1);
  graphics.fillRect(0, 0, 8, 8);
  graphics.generateTexture("bullet", 8, 8);
}

function create() {
  const W = this.scale.width;
  const H = this.scale.height;

  // Game menu overlay
  menuOverlay = this.add
    .rectangle(W / 2, H / 2, 400, 200, 0x000000, 0.8)
    .setDepth(10);
  startButton = this.add
    .text(W / 2, H / 2, "START", {
      font: "48px Arial",
      fill: "#fff",
      backgroundColor: "#333",
      padding: { x: 32, y: 16 },
    })
    .setOrigin(0.5)
    .setInteractive()
    .setDepth(11);
  startButton.on("pointerdown", () => {
    menuOverlay.setVisible(false);
    startButton.setVisible(false);
    gameStarted = true;
    pauseButton.setVisible(true);
    // Start enemy spawn timer
    enemySpawnTimer = this.time.addEvent({
      delay: 1000,
      callback: spawnEnemy,
      callbackScope: this,
      loop: true,
    });
  });
  pauseButton = this.add
    .text(W - 20, 20, "II", {
      font: "32px Arial",
      fill: "#fff",
      backgroundColor: "#333",
      padding: { x: 10, y: 4 },
    })
    .setOrigin(1, 0)
    .setInteractive()
    .setDepth(20)
    .setVisible(false);
  pauseButton.on("pointerdown", () => {
    if (!isPaused && gameStarted && !gameOver) {
      isPaused = true;
      this.physics.pause();
      pauseOverlay.setVisible(true);
      resumeButton.setVisible(true);
      restartButton.setVisible(true);
      if (enemySpawnTimer) enemySpawnTimer.paused = true;
    }
  });

  // Pause overlay and buttons
  pauseOverlay = this.add
    .rectangle(W / 2, H / 2, 400, 200, 0x000000, 0.7)
    .setDepth(21)
    .setVisible(false);
  resumeButton = this.add
    .text(W / 2, H / 2 - 30, "RESUME", {
      font: "32px Arial",
      fill: "#fff",
      backgroundColor: "#333",
      padding: { x: 24, y: 8 },
    })
    .setOrigin(0.5)
    .setInteractive()
    .setDepth(22)
    .setVisible(false);
  restartButton = this.add
    .text(W / 2, H / 2 + 30, "RESTART", {
      font: "32px Arial",
      fill: "#fff",
      backgroundColor: "#333",
      padding: { x: 24, y: 8 },
    })
    .setOrigin(0.5)
    .setInteractive()
    .setDepth(22)
    .setVisible(false);
  resumeButton.on("pointerdown", () => {
    isPaused = false;
    this.physics.resume();
    pauseOverlay.setVisible(false);
    resumeButton.setVisible(false);
    restartButton.setVisible(false);
    if (enemySpawnTimer) enemySpawnTimer.paused = false;
  });
  restartButton.on("pointerdown", () => {
    window.location.reload();
  });
  // Player
  player = this.add.rectangle(W / 2, H / 2, 32, 16, 0xffffff);
  player.isIso = true; // For isometric scaling
  this.physics.add.existing(player);
  player.body.setCollideWorldBounds(true);
  cursors = this.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D,
  });

  // Mouse click to shoot
  this.input.on("pointerdown", (pointerEvent) => {
    if (!gameStarted || isPaused || gameOver) return;
    // Prefer left click or taps
    if (!pointerEvent || pointerEvent.leftButtonDown()) {
      fireBullet.call(this);
    }
  });

  // Bullets group (enable Arcade Physics for all children)
  bullets = this.physics.add.group({
    classType: Phaser.Physics.Arcade.Sprite,
    runChildUpdate: true,
  });

  // Enemies group
  enemies = this.physics.add.group();

  // Score and health UI
  scoreText = this.add.text(10, 10, "Score: 0", {
    font: "20px Arial",
    fill: "#fff",
  });
  healthText = this.add.text(10, 40, "Health: 100", {
    font: "20px Arial",
    fill: "#fff",
  });

  // Collisions
  this.physics.add.overlap(bullets, enemies, bulletHitsEnemy, null, this);
  this.physics.add.overlap(player, enemies, playerHitsEnemy, null, this);

  // Healing potions group
  potions = this.physics.add.group();
  // Spawn potions at random intervals (every 5-10 seconds)
  this.time.addEvent({
    delay: Phaser.Math.Between(5000, 10000),
    callback: spawnPotionTimer,
    callbackScope: this,
  });

  // Player can pick up potions
  this.physics.add.overlap(player, potions, collectPotion, null, this);
  // Optionally, potions could despawn after some time or animate
}
function spawnPotionTimer() {
  spawnPotion.call(this);
  this.time.addEvent({
    delay: Phaser.Math.Between(5000, 10000),
    callback: spawnPotionTimer,
    callbackScope: this,
  });
}
function spawnPotion() {
  // Spawn at random location inside game area
  const W = this.scale.width;
  const H = this.scale.height;
  let x = Phaser.Math.Between(40, Math.max(40, W - 40));
  let y = Phaser.Math.Between(40, Math.max(40, H - 40));
  let potion = this.add.rectangle(x, y, 20, 10, 0x00ffff);
  potion.isIso = true; // For isometric scaling
  this.physics.add.existing(potion);
  potion.body.setAllowGravity(false);
  potions.add(potion);
}

function collectPotion(playerObj, potion) {
  potion.destroy();
  health = Math.min(100, health + POTION_HEAL);
  healthText.setText("Health: " + health);
}

function update(time, delta) {
  const H = this.scale.height;
  const W = this.scale.width;
  let isoScale = (y) => 0.7 + 0.6 * (1 - y / H); // scale from 1.3 (bottom) to 0.7 (top)
  if (player.isIso) player.setScale(isoScale(player.y), isoScale(player.y));
  enemies.children.each(function (enemy) {
    if (enemy.isIso) enemy.setScale(isoScale(enemy.y), isoScale(enemy.y));
  }, this);
  if (potions && potions.children) {
    potions.children.each(function (potion) {
      if (potion.isIso) potion.setScale(isoScale(potion.y), isoScale(potion.y));
    }, this);
  }

  if (!gameStarted || gameOver || isPaused) return;
  const speed = 200;
  // Keyboard movement
  let vx = 0,
    vy = 0;
  if (cursors.left.isDown) vx = -1;
  if (cursors.right.isDown) vx = 1;
  if (cursors.up.isDown) vy = -1;
  if (cursors.down.isDown) vy = 1;
  // Normalize
  if (vx !== 0 || vy !== 0) {
    let len = Math.sqrt(vx * vx + vy * vy);
    vx /= len;
    vy /= len;
  }
  player.body.setVelocity(vx * speed, vy * speed);

  // Remove offscreen bullets
  bullets.children.each(function (bullet) {
    if (bullet.x < 0 || bullet.x > W || bullet.y < 0 || bullet.y > H) {
      bullet.destroy();
    }
  }, this);

  // Move enemies toward player
  enemies.children.each(function (enemy) {
    if (enemy.active && player.active) {
      let speed =
        enemy.enemyType && enemy.enemyType.speed ? enemy.enemyType.speed : 100;
      this.physics.moveToObject(enemy, player, speed);
    }
  }, this);
}

function fireBullet() {
  // Bullets go toward mouse pointer
  let bullet = bullets.get(player.x, player.y, "bullet");
  if (!bullet) return;
  bullet.setActive(true);
  bullet.setVisible(true);
  bullet.setTint(0xffd700);
  bullet.body.setAllowGravity(false);
  // Use Phaser's input.activePointer for mouse position
  let pointer = this.input.activePointer;
  let dx = pointer.worldX - player.x;
  let dy = pointer.worldY - player.y;
  let dist = Math.sqrt(dx * dx + dy * dy);
  let speed = 400;
  let vx = 0,
    vy = -speed;
  if (dist > 0) {
    vx = (dx / dist) * speed;
    vy = (dy / dist) * speed;
  }
  bullet.body.setVelocity(vx, vy);
}

function spawnEnemy() {
  const W = this.scale.width;
  const H = this.scale.height;
  let typeIdx = Phaser.Math.Between(0, ENEMY_TYPES.length - 1);
  let type = ENEMY_TYPES[typeIdx];
  // Spawn at random edge
  let edge = Phaser.Math.Between(0, 3);
  let x, y;
  if (edge === 0) {
    x = 0;
    y = Phaser.Math.Between(0, H);
  } else if (edge === 1) {
    x = W;
    y = Phaser.Math.Between(0, H);
  } else if (edge === 2) {
    x = Phaser.Math.Between(0, W);
    y = 0;
  } else {
    x = Phaser.Math.Between(0, W);
    y = H;
  }
  let enemy = this.add.rectangle(x, y, 28, 14, type.color);
  enemy.isIso = true; // For isometric scaling
  this.physics.add.existing(enemy);
  enemy.body.setAllowGravity(false);
  // Attach custom properties
  enemy.enemyType = type;
  enemy.hp = type.health;
  enemies.add(enemy);
}

function bulletHitsEnemy(bullet, enemy) {
  bullet.destroy();
  // Reduce enemy HP, destroy if 0
  if (enemy.hp === undefined) enemy.hp = 1;
  enemy.hp -= 1;
  if (enemy.hp <= 0) {
    enemy.destroy();
    score += 10;
    scoreText.setText("Score: " + score);
  }
}

function playerHitsEnemy(playerObj, enemy) {
  enemy.destroy();
  health -= 20;
  healthText.setText("Health: " + health);
  if (health <= 0) {
    endGame.call(this);
  }
}

function endGame() {
  gameOver = true;
  if (enemySpawnTimer) enemySpawnTimer.remove(false);
  gameOverText = this.add.text(400, 300, "GAME OVER\nPress F5 to Restart", {
    font: "32px Arial",
    fill: "#fff",
    align: "center",
  });
  gameOverText.setOrigin(0.5);
  player.body.setVelocity(0);
  enemies.clear(true, true);
  bullets.clear(true, true);
}
