import { supabase } from '../lib/supabase';
import { Stamp } from '../../types';

export const AdminService = {
    // Check if current user is admin
    async isAdmin(userId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error checking admin status:', error);
            return false;
        }

        return data?.role === 'admin';
    },

    // Create a new stamp
    async createStamp(
        name: string,
        description: string,
        rarity: string,
        imageFile: File,
        isPurchasable: boolean = false,
        price: number = 0,
        tmdbId?: number | null,
        seriesTitle?: string | null,
        reqType?: string,
        reqValue?: number,
        maxSupply?: number | null
    ): Promise<Stamp | null> {
        try {
            // 1. Upload Image
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `badges/${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('badges')
                .upload(fileName, imageFile);

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('badges').getPublicUrl(fileName);
            const imageUrl = publicUrlData.publicUrl;

            // 2. Insert into DB
            const { data, error } = await supabase
                .from('stamps')
                .insert({
                    name,
                    description,
                    rarity,
                    image_url: imageUrl,
                    purchasable: isPurchasable,
                    price: isPurchasable ? price : 0,
                    tmdb_id: tmdbId,
                    series_title: seriesTitle,
                    req_type: reqType || 'none',
                    req_value: reqValue || 0,
                    max_supply: maxSupply
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating stamp:', error);
            throw error;
        }
    },

    async deleteStamp(stampId: string) {
        const { error } = await supabase
            .from('stamps')
            .delete()
            .eq('id', stampId);

        if (error) throw error;
    },

    async getAllStamps() {
        const { data, error } = await supabase
            .from('stamps')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }
};
