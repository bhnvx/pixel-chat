import React from 'react';
import { AnimalSprite } from '../assets/animals';

interface PixelAnimalProps {
  animal: AnimalSprite;
  size: number;
}

export default function PixelAnimal({ animal, size }: PixelAnimalProps) {
  const width = animal.pixels[0].length * size;
  const height = animal.pixels.length * size;

  return (
    <canvas
      width={width}
      height={height}
      style={{ imageRendering: 'pixelated' }}
      ref={(canvas) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        animal.pixels.forEach((row, y) => {
          row.forEach((cell, x) => {
            if (!cell) return;
            switch (cell) {
              case 'fill':
                ctx.fillStyle = animal.color;
                break;
              case 'e':
                ctx.fillStyle = '#111';
                break;
              case 'n':
                ctx.fillStyle = '#ff6b6b';
                break;
              case 'b':
                ctx.fillStyle = '#ffa726';
                break;
              case 'w':
                ctx.fillStyle = '#ffffff';
                break;
              default:
                ctx.fillStyle = animal.color;
            }
            ctx.fillRect(x * size, y * size, size, size);
          });
        });
      }}
    />
  );
}
