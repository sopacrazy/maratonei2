import { supabase } from '../lib/supabase';

export interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  likes_count: number;
  created_at: string;
  user?: {
    name: string;
    handle: string;
    avatar: string;
  }
}

export const PostService = {
  async createPost(userId: string, content: string, imageFile: File | null, tmdbId?: number, seriesTitle?: string) {
    let imageUrl = null;

    // 1. Upload da imagem se existir
    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
      imageUrl = data.publicUrl;
    }

    // 2. Criar registro no banco
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content,
        image_url: imageUrl,
        tmdb_id: tmdbId,
        series_title: seriesTitle
      })
      .select()
      .single();

    if (!error && data) {
      await this.notifyMentions(content, data.id, userId, 'post');

      // Check for badges
      if (data.tmdb_id) {
        // Dynamic Import to avoid circular dependency if BadgeService imports PostService (it doesn't yet, but good practice)
        // Actually static import is fine here
        const { BadgeService } = await import('./badgeService');
        BadgeService.checkPostBadges(userId, data.tmdb_id);
      }
    }

    if (error) throw error;
    return data;
  },

  async notifyMentions(content: string, postId: string, actorId: string, type: 'post' | 'comment') {
    const mentions = content.match(/@[\w.]+/g);
    if (!mentions) return;

    const uniqueHandles = [...new Set(mentions.map(m => m.slice(1)))];

    for (const handle of uniqueHandles) {
      // Find user by handle (or name if exact match fallback)
      const { data: users } = await supabase
        .from('profiles')
        .select('id')
        .or(`handle.eq.${handle},name.eq.${handle}`) // simple verification
        .limit(1);

      const mentionedUser = users?.[0];

      if (mentionedUser && mentionedUser.id !== actorId) {
        await supabase.from('notifications').insert({
          user_id: mentionedUser.id,
          actor_id: actorId,
          type: 'mention',
          content: `mencionou você em ${type === 'post' ? 'uma publicação' : 'um comentário'}.`,
          read: false,
          // link: `/post/${postId}` // If we had a link field, or use metadata
        });
      }
    }
  },

  async likePost(postId: string, userId: string) {
    // 1. Add to post_likes
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId });

    if (error) throw error;

    // 2. Increment likes_count (optional optimization, or just count relationship)
    // We will stick to counting relationship for accuracy, but let's update count for display speed if needed
    // For now, let's just trigger a notification

    // Fetch post author to notify
    const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single();
    if (post && post.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: post.user_id,
        actor_id: userId,
        type: 'like',
        content: 'curtiu sua publicação.',
        read: false
      });
    }
  },

  async unlikePost(postId: string, userId: string) {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .match({ post_id: postId, user_id: userId });

    if (error) throw error;
  },

  async hasLiked(postId: string, userId: string) {
    const { data, error } = await supabase
      .from('post_likes')
      .select('*')
      .match({ post_id: postId, user_id: userId })
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },

  async getComments(postId: string) {
    const { data, error } = await supabase
      .from('post_comments')
      .select('*, author:profiles(id, name, avatar)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  async addComment(postId: string, userId: string, content: string) {
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: userId, content })
      .select('*, author:profiles(id, name, avatar)')
      .single();

    if (!error && data) {
      await this.notifyMentions(content, postId, userId, 'comment');
    }

    if (error) throw error;

    // Notify author
    const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single();
    if (post && post.user_id !== userId) {
      await supabase.from('notifications').insert({
        user_id: post.user_id,
        actor_id: userId,
        type: 'comment',
        content: 'comentou na sua publicação.',
        read: false
      });
    }

    return data;
  },

  // Type fix helper
  async getFeed(page = 1, limit = 5, type: 'global' | 'following' = 'global', userId?: string) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('posts')
      // Explicitly specify the FK column 'user_id' for the profiles query to avoid ambiguity
      .select('*, user:profiles!user_id(name, handle, avatar), post_likes(user_id), post_comments(count)', { count: 'exact' });

    if (type === 'following' && userId) {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
      const ids = follows?.map(f => f.following_id) || [];
      if (ids.length > 0) {
        query = query.in('user_id', ids);
      } else {
        // If following no one, return empty or fallback? Returning empty is correct for "Following" tab.
        return { data: [], count: 0 };
      }
      query = query.order('created_at', { ascending: false });
    } else {
      // 'global' / Em Alta -> Could be ordered by likes? For now keep chronological
      query = query.order('created_at', { ascending: false });
    }

    const { data, count, error } = await query.range(from, to);

    if (error) throw error;

    const posts = data.map((post: any) => ({
      id: post.id,
      user_id: post.user_id,
      user: post.user,
      content: post.content,
      image: post.image_url,
      timeAgo: new Date(post.created_at).toLocaleDateString(),
      likes: post.post_likes ? post.post_likes.length : (post.likes_count || 0),
      comments: post.post_comments ? post.post_comments[0].count : 0,
      shares: 0,
      isSpoiler: false, // Placeholder
      post_likes: post.post_likes || [], // Pass for hasLiked check
      tag: post.tmdb_id ? {
        type: 'watching',
        text: post.series_title || 'Série'
      } : undefined
    }));

    return { data: posts, count };
  },

  async getUserPosts(userId: string) {
    const { data, error } = await supabase
      .from('posts')
      .select('*, user:profiles!user_id(name, handle, avatar), post_likes(user_id), post_comments(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map((post: any) => ({
      id: post.id,
      user_id: post.user_id,
      user: post.user,
      content: post.content,
      image: post.image_url,
      timeAgo: calculateTimeAgo(post.created_at),
      likes: post.post_likes ? post.post_likes.length : (post.likes_count || 0),
      comments: post.post_comments ? post.post_comments[0].count : 0,
      shares: 0,
      isSpoiler: false,
      post_likes: post.post_likes || [],
      tag: post.tmdb_id ? {
        type: 'watching',
        text: post.series_title || 'Série'
      } : undefined
    }));
  },

  async deletePost(postId: string) {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId); // RLS protege para apagar apenas se for dono

    if (error) throw error;
  }
};

function calculateTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Agora mesmo';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

