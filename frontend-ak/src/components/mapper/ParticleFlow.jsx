import React, { useEffect, useRef } from 'react';
import { Stage, Layer, Circle } from 'react-konva';
import { useMapperStore } from '@/store/mapperStore';

export const ParticleFlow = ({ edgeId, isActive }) => {
  const particlesRef = useRef([]);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      particlesRef.current = [];
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    // Create particles
    const createParticle = () => ({
      x: 0,
      y: 0,
      progress: Math.random(),
      speed: 0.01 + Math.random() * 0.02,
      size: 3 + Math.random() * 2,
    });

    particlesRef.current = Array.from({ length: 5 }, createParticle);

    const animate = () => {
      particlesRef.current = particlesRef.current.map((particle) => ({
        ...particle,
        progress: (particle.progress + particle.speed) % 1,
      }));

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <Stage width={window.innerWidth} height={window.innerHeight} className="pointer-events-none absolute inset-0">
      <Layer>
        {particlesRef.current.map((particle, idx) => (
          <Circle
            key={idx}
            x={particle.x}
            y={particle.y}
            radius={particle.size}
            fill="#06b6d4"
            opacity={1 - particle.progress}
          />
        ))}
      </Layer>
    </Stage>
  );
};
