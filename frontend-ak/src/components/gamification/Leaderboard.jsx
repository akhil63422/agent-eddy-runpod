import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export const Leaderboard = ({ users = [] }) => {
  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Award className="w-5 h-5 text-[var(--status-warn-text)]" />;
    return <span className="text-[var(--text-primary)] font-bold">#{rank}</span>;
  };

  return (
    <Card className="bg-black/60 border-2 border-[var(--border)]">
      <CardHeader>
        <CardTitle className="text-xl font-black bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent font-mono uppercase">
          LEADERBOARD
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {users.length === 0 ? (
            <p className="text-[var(--text-primary)]/50 text-center py-8 font-mono">No leaderboard data yet</p>
          ) : (
            users.map((user, index) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-[var(--border)] hover:border-[var(--border)] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 flex items-center justify-center">
                    {getRankIcon(index + 1)}
                  </div>
                  <Avatar className="w-10 h-10 border-2 border-purple-500/50">
                    <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-[var(--text-primary)] text-xs font-black">
                      {user.username?.substring(0, 2).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-[var(--text-primary)] font-mono">{user.username || 'Unknown'}</p>
                    <p className="text-xs text-[var(--text-secondary)]/70 font-mono">Level {user.level || 1}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-black text-[var(--text-primary)] font-mono">{user.totalScore || 0}</p>
                    <p className="text-xs text-[var(--text-secondary)]/70 font-mono">Score</p>
                  </div>
                  <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-[var(--text-primary)] border border-purple-400/50">
                    {user.documentsProcessed || 0} docs
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
