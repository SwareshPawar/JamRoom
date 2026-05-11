#!/usr/bin/env node

/**
 * Generate JamRoom Brand Logo (1024x1024px PNG)
 * Circular badge with SWAR JRS, MUSIC STUDIO text, musical notes, and guitar background
 */

const fs = require('fs');
const path = require('path');

// Try to use canvas for image generation
let Canvas;
try {
  Canvas = require('canvas').Canvas;
} catch (error) {
  console.error('❌ canvas library not installed. Install with: npm install canvas');
  console.error('Alternative: Use the SVG version below and convert to PNG online or with ImageMagick');
  process.exit(1);
}

const SIZE = 1024;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 20;

const generateLogo = () => {
  const canvas = new Canvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Draw faded guitar background
  drawGuitarBackground(ctx);

  // Draw outer circle border
  drawCircleBorder(ctx);

  // Draw circular text (SWAR JRS at top, MUSIC STUDIO at bottom)
  drawCircularText(ctx);

  // Draw musical notes in center
  drawMusicalNotes(ctx);

  // Save to file
  const outputPath = path.join(__dirname, '..', 'public', 'icons', 'jamroom-brand-logo.png');
  const stream = fs.createWriteStream(outputPath);
  const pngStream = canvas.createPNGStream();

  pngStream.pipe(stream);

  stream.on('finish', () => {
    console.log(`✅ Logo generated successfully at: ${outputPath}`);
    console.log(`📐 Dimensions: ${SIZE}x${SIZE}px`);
  });

  stream.on('error', (err) => {
    console.error(`❌ Error writing logo: ${err.message}`);
    process.exit(1);
  });

  pngStream.on('error', (err) => {
    console.error(`❌ Error generating PNG: ${err.message}`);
    process.exit(1);
  });
};

const drawGuitarBackground = (ctx) => {
  // Faded guitar silhouette background
  ctx.fillStyle = 'rgba(100, 100, 100, 0.15)';
  
  // Simple guitar outline in background
  ctx.beginPath();
  // Guitar body
  ctx.ellipse(CENTER, CENTER - 80, 180, 220, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Guitar neck
  ctx.fillRect(CENTER - 40, CENTER - 280, 80, 200);
};

const drawCircleBorder = (ctx) => {
  // Outer circle border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle border
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS - 40, 0, Math.PI * 2);
  ctx.stroke();
};

const drawCircularText = (ctx) => {
  // Draw text along circular path
  const topRadius = RADIUS - 80;
  const bottomRadius = RADIUS - 80;

  // Top text: SWAR JRS (clockwise from top)
  drawTextOnCircle(ctx, 'SWAR JRS', topRadius, true);

  // Bottom text: MUSIC STUDIO (counter-clockwise from bottom)
  drawTextOnCircle(ctx, 'MUSIC STUDIO', bottomRadius, false);
};

const drawTextOnCircle = (ctx, text, radius, isTop) => {
  const charWidth = 32;
  const textWidth = text.length * charWidth;
  const startAngle = isTop ? -Math.PI / 2 : Math.PI / 2;
  const angleStep = textWidth / radius / text.length;
  
  ctx.font = 'bold 42px Arial, sans-serif';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let angle = startAngle - (textWidth / 2) / radius;

  for (let char of text) {
    const x = CENTER + radius * Math.cos(angle);
    const y = CENTER + radius * Math.sin(angle);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();

    angle += angleStep;
  }
};

const drawMusicalNotes = (ctx) => {
  // Draw large white musical notes in center
  const noteSize = 140;
  const noteX = CENTER - 60;
  const noteY = CENTER - 40;

  ctx.fillStyle = '#ffffff';

  // First note
  drawEighthNote(ctx, noteX, noteY, noteSize);

  // Second note (offset)
  drawEighthNote(ctx, noteX + 80, noteY + 40, noteSize);

  // Add some sparkle/texture around notes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  for (let i = 0; i < 20; i++) {
    const sparkleX = CENTER + (Math.random() - 0.5) * 200;
    const sparkleY = CENTER + (Math.random() - 0.5) * 200;
    const sparkleSize = Math.random() * 6 + 2;
    ctx.fillRect(sparkleX, sparkleY, sparkleSize, sparkleSize);
  }
};

const drawEighthNote = (ctx, x, y, size) => {
  // Note head (filled circle)
  ctx.beginPath();
  ctx.arc(x, y + size * 0.4, size * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Note stem
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.08;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.15, y + size * 0.4);
  ctx.lineTo(x + size * 0.15, y - size * 0.5);
  ctx.stroke();

  // Note flag/beam
  ctx.beginPath();
  ctx.moveTo(x + size * 0.15, y - size * 0.5);
  ctx.quadraticCurveTo(
    x + size * 0.35,
    y - size * 0.4,
    x + size * 0.25,
    y - size * 0.2
  );
  ctx.quadraticCurveTo(
    x + size * 0.3,
    y - size * 0.3,
    x + size * 0.15,
    y - size * 0.4
  );
  ctx.fill();
};

// Run generator
generateLogo();
