import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useGamificationStore = create(
  persist(
    (set, get) => ({
      // User stats
      level: 1,
      experience: 0,
      totalScore: 0,
      streak: 0,
      lastActivityDate: null,
      
      // Achievements
      achievements: [],
      badges: [],
      
      // Stats
      documentsProcessed: 0,
      exceptionsResolved: 0,
      mappingsCreated: 0,
      errorFreeRuns: 0,
      perfectMappings: 0,
      
      // Actions
      addExperience: (points) => {
        const state = get();
        const newExp = state.experience + points;
        const newLevel = Math.floor(newExp / 100) + 1;
        const levelUp = newLevel > state.level;
        
        set({
          experience: newExp,
          level: newLevel,
          totalScore: state.totalScore + points,
        });
        
        if (levelUp) {
          // Trigger level up notification
          return { levelUp: true, newLevel };
        }
        return { levelUp: false };
      },
      
      addAchievement: (achievement) => {
        const state = get();
        if (!state.achievements.find(a => a.id === achievement.id)) {
          set({
            achievements: [...state.achievements, { ...achievement, earnedAt: new Date().toISOString() }]
          });
          return true; // New achievement
        }
        return false;
      },
      
      addBadge: (badge) => {
        const state = get();
        if (!state.badges.find(b => b.id === badge.id)) {
          set({
            badges: [...state.badges, { ...badge, earnedAt: new Date().toISOString() }]
          });
          return true;
        }
        return false;
      },
      
      updateStreak: () => {
        const state = get();
        const today = new Date().toDateString();
        const lastDate = state.lastActivityDate ? new Date(state.lastActivityDate).toDateString() : null;
        
        if (lastDate === today) {
          return; // Already counted today
        }
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
        
        if (lastDate === yesterdayStr) {
          // Consecutive day
          set({
            streak: state.streak + 1,
            lastActivityDate: today
          });
        } else {
          // New streak
          set({
            streak: 1,
            lastActivityDate: today
          });
        }
      },
      
      incrementDocumentsProcessed: () => {
        set((state) => ({
          documentsProcessed: state.documentsProcessed + 1
        }));
        get().addExperience(10);
        get().updateStreak();
      },
      
      incrementExceptionsResolved: () => {
        set((state) => ({
          exceptionsResolved: state.exceptionsResolved + 1
        }));
        get().addExperience(25);
      },
      
      incrementMappingsCreated: () => {
        set((state) => ({
          mappingsCreated: state.mappingsCreated + 1
        }));
        get().addExperience(50);
      },
      
      incrementErrorFreeRuns: () => {
        set((state) => ({
          errorFreeRuns: state.errorFreeRuns + 1
        }));
        get().addExperience(100);
        
        // Check for achievement
        if (get().errorFreeRuns === 10) {
          get().addAchievement({
            id: 'error_free_10',
            name: 'Perfect Run',
            description: '10 error-free document processing runs',
            icon: 'trophy',
            rarity: 'rare'
          });
        }
      },
      
      reset: () => {
        set({
          level: 1,
          experience: 0,
          totalScore: 0,
          streak: 0,
          achievements: [],
          badges: [],
          documentsProcessed: 0,
          exceptionsResolved: 0,
          mappingsCreated: 0,
          errorFreeRuns: 0,
          perfectMappings: 0,
        });
      },
    }),
    {
      name: 'gamification-storage',
    }
  )
);
