import React, { useState, useContext, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import { AppContext } from '../App';
import { ProfileService } from '../src/services/profileService';
import { UserSeriesService, UserSeries } from '../src/services/userSeriesService';
import { PostService } from '../src/services/postService';
import { TMDBService } from '../src/services/tmdbService';
import { RatingCategory, Post, User } from '../types';

// Componente para o efeito de neve (reaproveitado)
const SnowEffect = () => {
    return (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-xl">
            <style>{`
        @keyframes snowfall {
          0% { transform: translateY(-10px) translateX(0px); opacity: 0; }
          10% { opacity: 0.9; }
          100% { transform: translateY(100%) translateX(20px); opacity: 0; }
        }
        .snowflake {
          position: absolute;
          top: -10px;
          color: white;
          text-shadow: 0 0 2px rgba(0,0,0,0.3);
          opacity: 0;
          font-size: 10px;
          animation: snowfall linear infinite;
        }
      `}</style>
            {[...Array(25)].map((_, i) => {
                const left = `${Math.random() * 100}%`;
                const animDuration = `${4 + Math.random() * 6}s`;
                const animDelay = `${Math.random() * 5}s`;
                const size = `${8 + Math.random() * 14}px`;
                return <div key={i} className="snowflake" style={{ left, animationDuration: animDuration, animationDelay: animDelay, fontSize: size }}>❄</div>;
            })}
        </div>
    );
};

const PublicProfilePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { user: currentUser } = useContext(AppContext); // Meu usuário logado
    const navigate = useNavigate();

    const [profileUser, setProfileUser] = useState<any>(null); // Perfil sendo visitado
    const [userSeries, setUserSeries] = useState<UserSeries[]>([]);
    const [userPosts, setUserPosts] = useState<Post[]>([]);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<RatingCategory>('Recomendadas');
    const [mySeriesIds, setMySeriesIds] = useState<Set<number>>(new Set());

    const isMe = currentUser?.id === id;



    useEffect(() => {
        if (!id) return;

        const loadProfile = async () => {
            setLoading(true);
            try {
                // 1. Carregar dados do perfil
                const profile = await ProfileService.getProfile(id);
                if (!profile) {
                    alert('Usuário não encontrado');
                    navigate('/feed');
                    return;
                }
                setProfileUser(profile);

                // 2. Carregar Séries
                const series = await UserSeriesService.getUserSeries(id);
                setUserSeries(series);

                // 3. Carregar Posts
                const posts = await PostService.getUserPosts(id);
                setUserPosts(posts);

                // 4. Carregar Contadores Social
                const followers = await ProfileService.getFollowersCount(id);
                setFollowersCount(followers);
                const following = await ProfileService.getFollowingCount(id);
                setFollowingCount(following);

                // 5. Carregar MINHAS séries para saber o que eu já tenho (para o botão adicionar)
                if (currentUser?.id) {
                    const mySeries = await UserSeriesService.getUserSeries(currentUser.id);
                    setMySeriesIds(new Set(mySeries.map(s => s.tmdb_id)));
                }

                // 6. Verificar se eu sigo esse cara (se não for eu mesmo)

                // 5. Verificar se eu sigo esse cara (se não for eu mesmo)
                if (currentUser?.id && !isMe) {
                    const followingStatus = await ProfileService.isFollowing(currentUser.id, id);
                    setIsFollowing(followingStatus);
                }

            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        loadProfile();
    }, [id, currentUser?.id]);

    const handleFollowToggle = async () => {
        if (!currentUser?.id || !profileUser?.id) return;
        if (isMe) return;

        try {
            if (isFollowing) {
                await ProfileService.unfollowUser(currentUser.id, profileUser.id);
                setIsFollowing(false);
                setFollowersCount(prev => prev - 1);
            } else {
                await ProfileService.followUser(currentUser.id, profileUser.id);
                setIsFollowing(true);
                setFollowersCount(prev => prev + 1);
            }
        } catch (error) {
            console.error('Erro ao seguir/deixar de seguir:', error);
            alert('Falha ao atualizar status de seguir.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    if (!profileUser) return null;

    // Reuse logic from Profile.tsx for theme and layout roughly
    const isIceTheme = profileUser.profile_theme === 'ice';
    const headerClasses = isIceTheme
        ? "relative flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 p-6 md:p-8 rounded-xl bg-gradient-to-b from-sky-200 to-sky-50 dark:from-[#1e293b] dark:to-[#0f172a] border-2 border-sky-300 dark:border-blue-900 shadow-lg shadow-sky-500/10 transition-colors duration-300"
        : "flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 p-6 md:p-8 rounded-xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#362348] shadow-sm transition-colors duration-300";

    const getRatingFromCategory = (cat: RatingCategory): number => {
        switch (cat) {
            case 'Recomendadas': return 3;
            case 'Passa tempo': return 2;
            case 'Perdi meu tempo': return 1;
            default: return 3;
        }
    };

    const getCategoryColor = (cat: RatingCategory) => {
        switch (cat) {
            case 'Recomendadas': return 'text-green-500 border-green-500 bg-green-500/10';
            case 'Passa tempo': return 'text-blue-400 border-blue-400 bg-blue-400/10';
            case 'Perdi meu tempo': return 'text-red-500 border-red-500 bg-red-500/10';
            default: return '';
        }
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('Link do perfil copiado!');
    };

    const handleAddSeries = async (e: React.MouseEvent, series: any) => {
        e.stopPropagation();
        if (!currentUser?.id) return alert('Faça login para adicionar.');
        if (mySeriesIds.has(series.tmdb_id)) return alert('Você já tem essa série.');

        try {
            // Need to reconstruct TMDBSeries object mostly or allow generic
            const seriesObj = {
                id: series.tmdb_id,
                name: series.title,
                poster_path: series.poster_path,
                overview: '', // Missing in UserSeries, but optional in addSeries
                backdrop_path: '',
                vote_average: 0,
                first_air_date: ''
            };
            await UserSeriesService.addSeries(currentUser.id, seriesObj as any);
            setMySeriesIds(prev => new Set(prev).add(series.tmdb_id));
            alert('Série adicionada à sua lista!');
        } catch (err: any) {
            alert(err.message);
        }
    };

    const watchingSeries = userSeries.filter(s => s.status === 'watching');
    const filteredSeries = userSeries.filter(s => s.rating === getRatingFromCategory(activeTab));

    return (
        <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col overflow-x-hidden transition-colors duration-300 pb-24 md:pb-8">
            <Navigation page="profile" />

            <main className="flex h-full grow flex-col px-4 md:px-10 lg:px-40 py-6 md:py-8 relative">
                <div className="flex flex-1 justify-center">
                    <div className="flex flex-col max-w-[960px] flex-1 gap-6 md:gap-8 w-full">

                        {/* Profile Header */}
                        <section className={headerClasses}>
                            {isIceTheme && <SnowEffect />}

                            <div className="flex flex-col items-center gap-4 shrink-0 relative z-10 w-full md:w-auto">
                                <div className="relative group">
                                    <div className={`bg-center bg-no-repeat bg-cover rounded-full h-28 w-28 md:h-40 md:w-40 ring-4 ${isIceTheme ? 'ring-sky-300 dark:ring-blue-900' : 'ring-slate-100 dark:ring-[#362348]'}`} style={{ backgroundImage: `url('${profileUser.avatar}')` }}></div>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto justify-center">
                                    {isMe ? (
                                        <button onClick={() => navigate('/settings')} className="flex items-center justify-center rounded-lg h-9 px-4 bg-slate-100 dark:bg-[#362348] text-slate-900 dark:text-white text-sm font-bold transition-colors">
                                            Editar Perfil
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleFollowToggle}
                                            className={`flex items-center justify-center rounded-lg h-9 px-6 text-sm font-bold transition-all shadow-sm ${isFollowing
                                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-white'
                                                : 'bg-primary text-white hover:bg-primary/90'
                                                }`}
                                        >
                                            {isFollowing ? 'Seguindo' : 'Seguir'}
                                        </button>
                                    )}
                                    <button
                                        onClick={handleShare}
                                        className="flex cursor-pointer items-center justify-center rounded-lg h-9 w-9 bg-slate-100 dark:bg-[#362348] text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-[#4d3267] transition-colors"
                                        title="Compartilhar Perfil"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">share</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col items-center md:items-start flex-1 w-full text-center md:text-left gap-4 relative z-10">
                                <div className="flex flex-col gap-1 w-full">
                                    <div className="flex items-center gap-2 justify-center md:justify-start">
                                        <h1 className="text-2xl md:text-3xl font-bold leading-tight text-slate-900 dark:text-white flex items-center gap-2 flex-wrap justify-center md:justify-start">
                                            {profileUser.name}
                                            {isIceTheme && <span className="text-sky-500 dark:text-blue-400 animate-pulse text-lg" title="Tema Gelo Ativo">❄️</span>}
                                        </h1>
                                        {/* Fake verified for everyone or specific logic later */}
                                        <span className="material-symbols-outlined text-primary text-[20px] shrink-0" title="Verificado">verified</span>
                                    </div>
                                    <p className="text-slate-500 dark:text-text-secondary text-sm font-medium">{profileUser.handle}</p>
                                </div>

                                <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base max-w-lg leading-relaxed">
                                    {profileUser.bio || "Sem biografia."}
                                </p>

                                <div className="w-full h-px bg-slate-200 dark:bg-[#362348]/50 my-2"></div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-3 gap-2 w-full md:flex md:gap-10">
                                    <div className="flex flex-col items-center md:items-start p-2 md:p-0 bg-white/50 dark:bg-white/5 md:bg-transparent rounded-lg md:rounded-none">
                                        <span className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">{userSeries.length}</span>
                                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-text-secondary uppercase tracking-wider font-semibold">Séries</span>
                                    </div>
                                    <div className="flex flex-col items-center md:items-start p-2 md:p-0 bg-white/50 dark:bg-white/5 md:bg-transparent rounded-lg md:rounded-none">
                                        <span className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">{followersCount}</span>
                                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-text-secondary uppercase tracking-wider font-semibold">Seguidores</span>
                                    </div>
                                    <div className="flex flex-col items-center md:items-start p-2 md:p-0 bg-white/50 dark:bg-white/5 md:bg-transparent rounded-lg md:rounded-none">
                                        <span className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">{followingCount}</span>
                                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-text-secondary uppercase tracking-wider font-semibold">Seguindo</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Currently Watching */}
                        <section>
                            <div className="flex items-center justify-between px-1 mb-4">
                                <h2 className="text-lg md:text-xl font-bold leading-tight text-slate-900 dark:text-white">Acompanhando</h2>
                            </div>
                            <div className="relative group/carousel -mx-4 md:mx-0 px-4 md:px-0">
                                <div className="flex overflow-x-auto hide-scrollbar gap-3 md:gap-4 pb-4 snap-x pr-4">
                                    {watchingSeries.length > 0 ? (
                                        watchingSeries.map((series) => (
                                            <div key={series.id} className="flex flex-col gap-2 min-w-[110px] md:min-w-[150px] snap-start cursor-pointer group/card relative">
                                                <div className="w-full aspect-[2/3] bg-center bg-cover rounded-xl shadow-md relative overflow-hidden"
                                                    style={{ backgroundImage: `url('${TMDBService.getImageUrl(series.poster_path)}')` }}>
                                                    <div className="absolute bottom-2 left-2">
                                                        <div className="bg-primary text-white text-[10px] md:text-xs font-bold px-2 py-0.5 rounded shadow-sm">
                                                            Assistindo
                                                        </div>
                                                    </div>
                                                    {/* Add Button Overlay */}
                                                    {!isMe && !mySeriesIds.has(series.tmdb_id) && (
                                                        <button
                                                            onClick={(e) => handleAddSeries(e, series)}
                                                            className="absolute top-2 right-2 p-1.5 bg-white/90 text-primary rounded-full opacity-0 group-hover/card:opacity-100 transition-opacity shadow-sm hover:scale-110"
                                                            title="Adicionar à minha lista"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">add</span>
                                                        </button>
                                                    )}
                                                    {!isMe && mySeriesIds.has(series.tmdb_id) && (
                                                        <div className="absolute top-2 right-2 p-1.5 bg-green-500/90 text-white rounded-full shadow-sm" title="Você já tem esta série">
                                                            <span className="material-symbols-outlined text-lg">check</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-slate-900 dark:text-white text-sm md:text-base font-bold leading-tight truncate px-0.5">{series.title}</p>
                                                    <p className="text-slate-500 dark:text-text-secondary text-xs px-0.5">Em dia</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-slate-500 dark:text-text-secondary text-sm italic py-4">
                                            Não está acompanhando nenhuma série no momento.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Public View: Recommendations */}
                        <section className="bg-white dark:bg-surface-dark rounded-xl p-4 md:p-6 shadow-sm border border-gray-200 dark:border-[#362348] transition-colors duration-300">
                            <div className="mb-6">
                                <h2 className="text-lg md:text-xl font-bold leading-tight text-slate-900 dark:text-white mb-1">Recomendações</h2>
                                <p className="text-sm text-slate-500 dark:text-text-secondary">O que {profileUser.name.split(' ')[0]} achou.</p>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 border-b border-gray-100 dark:border-white/5 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                                {(['Recomendadas', 'Passa tempo', 'Perdi meu tempo'] as RatingCategory[]).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-2 rounded-full text-xs md:text-sm font-bold whitespace-nowrap transition-all border shrink-0 ${activeTab === tab
                                            ? getCategoryColor(tab)
                                            : 'bg-transparent text-slate-500 dark:text-text-secondary border-transparent hover:bg-gray-100 dark:hover:bg-white/5'
                                            }`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredSeries.length > 0 ? (
                                    filteredSeries.map(series => (
                                        <div key={series.id} className="relative group/item flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-[#1a1122] border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-colors">
                                            <div className="w-16 h-24 sm:w-20 sm:h-28 shrink-0 bg-cover bg-center rounded-md shadow-sm" style={{ backgroundImage: `url('${TMDBService.getImageUrl(series.poster_path)}')` }}></div>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg leading-tight mb-1 truncate pr-8">{series.title}</h3>
                                                <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 px-2 py-0.5 rounded w-fit ${getCategoryColor(activeTab)}`}>
                                                    {activeTab}
                                                </div>
                                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 italic line-clamp-3">"{series.review || 'Sem crítica'}"</p>
                                            </div>

                                            {/* Add Button */}
                                            {!isMe && (
                                                <button
                                                    onClick={(e) => handleAddSeries(e, series)}
                                                    className={`absolute top-2 right-2 p-1.5 rounded-full shadow-sm transition-all ${mySeriesIds.has(series.tmdb_id)
                                                        ? 'bg-green-100 text-green-600 cursor-default'
                                                        : 'bg-white text-primary hover:bg-primary hover:text-white hover:scale-110 shadow'
                                                        }`}
                                                    title={mySeriesIds.has(series.tmdb_id) ? "Adicionada" : "Adicionar à lista"}
                                                    disabled={mySeriesIds.has(series.tmdb_id)}
                                                >
                                                    <span className="material-symbols-outlined text-lg">
                                                        {mySeriesIds.has(series.tmdb_id) ? 'check' : 'add'}
                                                    </span>
                                                </button>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full py-10 text-center text-slate-400 dark:text-text-secondary">
                                        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">movie_off</span>
                                        <p>Nenhuma série nesta categoria.</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Badges & Posts (Grid on Desktop, Stack on Mobile) */}
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Badges */}
                            <div className="flex flex-col bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#362348] rounded-xl overflow-hidden hover:border-primary/50 transition-colors group h-full">
                                <div className="p-4 md:p-6 pb-2">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="material-symbols-outlined text-yellow-500 text-3xl">military_tech</span>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Coleção de Selos</h3>
                                    </div>
                                    <p className="text-slate-500 dark:text-text-secondary text-sm mb-6">{profileUser.name.split(' ')[0]} desbloqueou 12 selos.</p>

                                    <div className="flex flex-wrap gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center border border-slate-300 dark:border-slate-700">
                                            <img alt="badge" className="w-8 h-8 opacity-80" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDadY-bYXN2nRVwB3KzAt9JxNsBVsA8bC5tpHBLck3KXTAIz83hCrVfYwzaXjDueCm4zlLNzD4hP1mEIJ0qqBtB2al55edGB6CJQfhyYp-7B8kmdlEsvbe-PiwGH7zRaITQmTL2fkyaXlPumjS4udh6e3JqvReW8JWXzbEAAqgVJXGTq5KVYxS256vrwqdBuDrZnXzUtnB2u1zADbQIZtkrCDK78P1F46WbUt64jBQRBcCSrsua3soefwNsauqKAMYDLRfzEsCO051V" />
                                        </div>
                                        <div className="w-12 h-12 rounded-lg bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center border border-slate-300 dark:border-slate-700 border-dashed text-slate-500 text-xs font-bold">
                                            +9
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Posts */}
                            <div className="flex flex-col bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#362348] rounded-xl overflow-hidden hover:border-primary/50 transition-colors group h-full">
                                <div className="p-4 md:p-6 pb-2">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="material-symbols-outlined text-blue-400 text-3xl">forum</span>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Publicações</h3>
                                    </div>
                                    <p className="text-slate-500 dark:text-text-secondary text-sm mb-4">Atividade recente.</p>
                                    <div className="bg-slate-50 dark:bg-[#1a1122] rounded-lg p-4 border border-slate-100 dark:border-[#362348] mb-2">
                                        {userPosts.length > 0 ? (
                                            <>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="size-6 bg-cover rounded-full" style={{ backgroundImage: `url('${profileUser.avatar}')` }}></div>
                                                    <span className="text-xs font-bold text-slate-500 dark:text-text-secondary line-clamp-1">{profileUser.name.split(' ')[0]} <span className="font-normal">publicou:</span></span>
                                                </div>
                                                <p className="text-sm italic text-slate-600 dark:text-slate-300 line-clamp-3">"{userPosts[0].content}"</p>
                                                <span className="text-[10px] text-slate-400 mt-2 block">{userPosts[0].timeAgo}</span>
                                            </>
                                        ) : (
                                            <p className="text-xs text-slate-500 dark:text-text-secondary text-center py-2">Nenhuma atividade recente.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </section>

                    </div>
                </div>
            </main>
        </div>
    );
};

export default PublicProfilePage;
