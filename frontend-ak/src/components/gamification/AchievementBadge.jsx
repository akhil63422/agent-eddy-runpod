import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Star, Award, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const iconMap = {
  trophy: Trophy,
  star: Star,
  award: Award,
  medal: Medal,
};

const rarityColors = {
  common: 'bg-gray-500',
  uncommon: 'bg-green-500',
  rare: 'bg-blue-500',
  epic: 'bg-purple-500',
  legendary: 'bg-yellow-500',
};

export const AchievementBadge = ({ achievement, size = 'md' }) => {
  const Icon = iconMap[achievement.icon] || Trophy;
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };
  
  return (
    <motion.div
      className="relative"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      title={achievement.description}
    >
      <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 p-0.5`}>
        <div className={`w-full h-full rounded-full bg-black flex items-center justify-center border-2 border-cyan-400/50`}>
          <Icon className={`${size === 'lg' ? 'w-8 h-8' : size === 'md' ? 'w-6 h-6' : 'w-4 h-4'} text-[var(--text-primary)]`} />
        </div>
      </div>
      {achievement.rarity && (
        <Badge 
          className={`absolute -bottom-1 -right-1 ${rarityColors[achievement.rarity]} text-[var(--text-primary)] text-[8px] px-1 py-0`}
        >
          {achievement.rarity.charAt(0).toUpperCase()}
        </Badge>
      )}
    </motion.div>
  );
};
