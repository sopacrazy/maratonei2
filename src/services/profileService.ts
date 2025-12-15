import { supabase } from '../lib/supabase';
import { User } from '../../types';

export const ProfileService = {
  // Buscar perfil do usuário
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  // Criar perfil inicial
  async createProfile(userId: string, email: string) {
    const name = email.split('@')[0];
    const handle = `@${name}`;

    const newProfile = {
      id: userId,
      email,
      name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize
      handle,
      avatar: `https://ui-avatars.com/api/?name=${name}&background=random`,
      bio: 'Novo na comunidade Maratonei!',
      coins: 50,
      profile_theme: 'default'
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert(newProfile)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar perfil:', error); // Log para debug
      // Se der erro de duplicidade (handle já existe), tentamos ajustar
      if (error.code === '23505') { // Postgres Unique Violation
        newProfile.handle = `${handle}_${Math.floor(Math.random() * 1000)}`;
        return await supabase.from('profiles').insert(newProfile).select().single().then(res => res.data);
      }
      throw error;
    }

    return data;
  },

  // Atualizar perfil
  async updateProfile(userId: string, updates: Partial<User>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async uploadAvatar(userId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars') // Assuming 'avatars' bucket exists
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      // Fallback: try 'public' or 'images' if avatars doesn't exist? 
      // For now let's hope 'avatars' exists or the user created it. 
      // If not, we might error.
      throw uploadError;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    return data.publicUrl;
  },

  async searchUsers(query: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, handle, avatar')
      .ilike('name', `%${query}%`)
      .limit(10);

    if (error) throw error;
    return data;
  },

  // --- SOCIAL FEATURES ---

  async followUser(followerId: string, followingId: string) {
    // 1. Criar o relacionamento
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: followerId, following_id: followingId });

    if (error) throw error;

    // 2. Criar Notificação
    await supabase.from('notifications').insert({
      user_id: followingId, // Quem recebe
      actor_id: followerId, // Quem seguiu
      type: 'follow',
      content: 'começou a seguir você.',
      read: false
    });
  },

  async unfollowUser(followerId: string, followingId: string) {
    const { error } = await supabase
      .from('follows')
      .delete()
      .match({ follower_id: followerId, following_id: followingId });

    if (error) throw error;
  },

  async isFollowing(followerId: string, followingId: string) {
    const { data, error } = await supabase
      .from('follows')
      .select('*')
      .match({ follower_id: followerId, following_id: followingId })
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignora erro de nao encontrado
    return !!data;
  },

  async getFollowersCount(userId: string) {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    if (error) return 0;
    return count || 0;
  },

  async getFollowingCount(userId: string) {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    if (error) return 0;
    return count || 0;
  },

  // --- NOTIFICATIONS ---

  async getNotifications(userId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:profiles!actor_id (id, name, avatar)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data;
  },

  async markNotificationRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) throw error;
  },

  async markAllNotificationsRead(userId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId);

    if (error) throw error;
  }
};
