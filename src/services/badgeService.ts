import { supabase } from '../lib/supabase';
import { Post } from '../../types';

export const BadgeService = {
    // Check if a user qualifies for any badges after posting content
    async checkPostBadges(userId: string, tmdbId?: number) {
        if (!tmdbId) return null;

        try {
            // 1. Find all badges that require 'post_count' for this series
            const { data: potentialBadges } = await supabase
                .from('stamps')
                .select('*')
                .eq('req_type', 'post_count')
                .eq('tmdb_id', tmdbId);

            if (!potentialBadges || potentialBadges.length === 0) return null;

            // 2. Count how many posts the user has for this series
            const { count, error } = await supabase
                .from('posts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('tmdb_id', tmdbId);

            if (error || count === null) return null;

            const currentPostCount = count;

            // 3. For each badge, check if count >= req_value
            for (const badge of potentialBadges) {
                if (currentPostCount >= badge.req_value) {
                    const awarded = await this.awardBadge(userId, badge.id, badge.name);
                    if (awarded) {
                        return badge; // Return the first badge won for immediate display
                    }
                }
            }
        } catch (err) {
            console.error('Error checking post badges:', err);
        }
        return null;
    },

    async awardBadge(userId: string, stampId: string, badgeName: string) {
        // 1. Check if already owns
        const { data: existing } = await supabase
            .from('user_stamps')
            .select('id')
            .match({ user_id: userId, stamp_id: stampId })
            .single();

        if (existing) return false; // Already has it

        // 2. Award!
        const { error } = await supabase
            .from('user_stamps')
            .insert({ user_id: userId, stamp_id: stampId });

        if (!error) {
            // 3. Notify
            await supabase.from('notifications').insert({
                user_id: userId,
                actor_id: userId,
                type: 'badge_earned',
                content: `Você desbloqueou uma nova conquista: ${badgeName}!`,
                read: false,
                link: `badge:${stampId}`
            });
            return true;
        }
        return false;
    },

    async getUserBadges(userId: string) {
        const { data, error } = await supabase
            .from('user_stamps')
            .select(`
            id,
            obtained_at,
            stamp:stamps (*)
        `)
            .eq('user_id', userId);

        if (error) throw error;
        return data.map((item: any) => item.stamp);
    }
};
