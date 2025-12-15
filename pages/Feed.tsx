import React, { useState, useContext, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import { Post, RatingCategory } from '../types';
import { AppContext } from '../App';
import { PostService } from '../src/services/postService';
import { TMDBService, TMDBSeries } from '../src/services/tmdbService';
import { UserSeriesService } from '../src/services/userSeriesService';
import { ProfileService } from '../src/services/profileService';
import CongratsModal from '../components/CongratsModal';
import { Stamp } from '../types';

// Dados mockados removidos
const INITIAL_POSTS: Post[] = [];


// Helper Component for Content Rendering
// Helper Component for Content Rendering
const PostContent: React.FC<{
  content: string,
  onSeriesClick: (name: string) => void,
  onUserClick: (handle: string) => void
}> = ({ content, onSeriesClick, onUserClick }) => {
  if (!content) return null;

  // Regex matches:
  // 1. Mentions: @User.name (includes dots)
  // 2. Series: *Series Name*
  const parts = content.split(/(\*.*?\*|@[\w.]+)/g);

  return (
    <p className="text-slate-700 dark:text-gray-300 text-sm leading-relaxed mb-4">
      {parts.map((part, i) => {
        if (part.startsWith('*') && part.endsWith('*')) {
          const seriesName = part.slice(1, -1);
          return (
            <span
              key={i}
              onClick={(e) => { e.stopPropagation(); onSeriesClick(seriesName); }}
              className="bg-primary/20 text-primary px-1.5 py-0.5 rounded mx-0.5 font-bold cursor-pointer hover:bg-primary/30 transition-colors"
            >
              {seriesName}
            </span>
          );
        }
        if (part.startsWith('@')) {
          const handle = part.slice(1);
          return (
            <span
              key={i}
              className="text-blue-500 font-bold hover:underline cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onUserClick(handle); }}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
};

const FeedPage: React.FC = () => {
  const { user } = useContext(AppContext);
  const [posts, setPosts] = useState<Post[]>([]);
  // const [feedType, setFeedType] = useState<'following' | 'global'>('following'); // Removed
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [trendingSeries, setTrendingSeries] = useState<TMDBSeries[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [spoilerRevealed, setSpoilerRevealed] = useState<Record<string, boolean>>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [commentsData, setCommentsData] = useState<Record<string, any[]>>({});
  const [newCommentText, setNewCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<TMDBSeries | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Mention System State
  const [mentionType, setMentionType] = useState<'user' | 'series' | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [showMentionList, setShowMentionList] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0 });
  const [mentionTarget, setMentionTarget] = useState<'post' | 'comment'>('post'); // Track where we are mentioning
  const [postRelatedSeries, setPostRelatedSeries] = useState<{ tmdb_id: number, series_title: string } | null>(null);
  const [justEarnedBadge, setJustEarnedBadge] = useState<Stamp | null>(null); // For immediate modal
  // Calculation for dropdown position
  const getCaretCoordinates = () => {
    const textarea = document.querySelector('textarea');
    if (!textarea) return { top: 0, left: 0 };
    const { selectionStart } = textarea;

    // Canvas hack to measure text width approx
    // This is a rough estimation, for perfect results we need a mirror div
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    for (const prop of Array.from(style)) {
      div.style[prop as any] = style.getPropertyValue(prop);
    }
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = textarea.value.substring(0, selectionStart);
    const span = document.createElement('span');
    span.textContent = textarea.value.substring(selectionStart) || '.';
    div.appendChild(span);
    document.body.appendChild(div);

    const { offsetLeft, offsetTop } = span;
    // Adjust relative to textarea
    const rect = textarea.getBoundingClientRect();

    document.body.removeChild(div);
    return {
      top: div.clientHeight > textarea.clientHeight ? textarea.clientHeight : div.clientHeight + 20, // simplistic line height 
      left: (div.textContent.length * 8) % textarea.clientWidth // very rough
    };
    // actually, let's just stick to a simpler "bottom left" or "relative to line" if possible without external lib
    // We will just place it under the textarea for safety or fixed top-left of the line?
    // Let's rely on a simpler approach: Just check line count.
  };

  const updateMentionSearch = (text: string, cursor: number) => {
    // Find the last trigger before cursor
    const textBefore = text.slice(0, cursor);
    const atIndex = textBefore.lastIndexOf('@');
    const slashIndex = textBefore.lastIndexOf('/');

    let triggerIndex = -1;
    let type: 'user' | 'series' | null = null;

    // Choose the closest trigger
    if (atIndex > slashIndex && atIndex !== -1) {
      triggerIndex = atIndex;
      type = 'user';
    } else if (slashIndex > atIndex && slashIndex !== -1) {
      triggerIndex = slashIndex;
      type = 'series';
    }

    if (triggerIndex !== -1) {
      // If user, valid only if no spaces (usually), but let's allow 1 space for full names?
      // If series, allow spaces.
      const query = textBefore.slice(triggerIndex + 1);

      // Basic heuristic: searching stops if double newline or if too long?
      // Allow dots for user handles (e.g. adriano.ti)
      // The query itself shouldn't contain the trigger symbol
      if (query.length < 30 && !query.includes('\n')) {
        setMentionType(type);
        setMentionQuery(query);
        return;
      }
    }

    setMentionType(null);
    setShowMentionList(false);
  };


  useEffect(() => {
    if (!mentionType) {
      setMentionResults([]);
      setShowMentionList(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (mentionQuery.length < 1) return;

      try {
        if (mentionType === 'user') {
          const results = await ProfileService.searchUsers(mentionQuery);
          setMentionResults(results || []);
        } else {
          // Allow spaces, TMDB handles it
          const results = await TMDBService.searchSeries(mentionQuery);
          // Only show top 5 to keep list small
          setMentionResults(results?.slice(0, 5) || []);
        }
        setShowMentionList(true);
        setSelectedIndex(0);
      } catch (e) {
        console.error(e);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [mentionQuery, mentionType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setMentionTarget('post'); // Set target
    setNewPostContent(val);
    setCursorPosition(pos);
    updateMentionSearch(val, pos);
  };

  const handleCommentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart || val.length;
    setMentionTarget('comment'); // Set target
    setNewCommentText(val);
    setCursorPosition(pos);
    updateMentionSearch(val, pos);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentionList || mentionResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % mentionResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + mentionResults.length) % mentionResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      insertMention(mentionResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowMentionList(false);
    }
  };

  const insertMention = (item: any) => {
    const currentContent = mentionTarget === 'post' ? newPostContent : newCommentText;
    const setContent = mentionTarget === 'post' ? setNewPostContent : setNewCommentText;

    const textBefore = currentContent.slice(0, cursorPosition);
    const textAfter = currentContent.slice(cursorPosition);

    // Find start of trigger based on the type we are currently searching for
    // We search backwards from cursor
    let triggerIndex = -1;
    if (mentionType === 'user') {
      triggerIndex = textBefore.lastIndexOf('@');
    } else {
      triggerIndex = textBefore.lastIndexOf('/');
    }

    // Safety check
    if (triggerIndex === -1) return;

    const prefix = textBefore.slice(0, triggerIndex);

    // Handle for user might not be present, fallback to name
    // Important: We strip any leading @ from handle if it exists to avoid double @
    let handle = item.handle || item.name;
    if (handle && handle.startsWith('@')) handle = handle.slice(1);

    // Generate text
    const mentionText = mentionType === 'user' ? `@${handle} ` : `*${item.name || item.title}* `;

    // START CHANGE: Capture Series Logic
    if (mentionType === 'series' && mentionTarget === 'post') {
      // Store selected series ID for later usage in createPost
      // We will need a new state for this or pass it?
      // Let's create a temporary state 'postRelatedSeries' 
      setPostRelatedSeries({
        tmdb_id: item.id,
        series_title: item.name || item.title
      });
    }
    // END CHANGE

    setContent(prefix + mentionText + textAfter);
    setMentionType(null);
    setShowMentionList(false);
    setMentionResults([]);

    // Focus hack
    setTimeout(() => {
      const selector = mentionTarget === 'post' ? 'textarea' : 'input[type="text"]'; // simplified selector
      const element = document.querySelector(selector) as HTMLElement; // might need more specific selector for comments
      if (element && (element as any).setSelectionRange) {
        element.focus();
        const newPos = prefix.length + mentionText.length;
        (element as any).setSelectionRange(newPos, newPos);
      }
    }, 0);
  };


  useEffect(() => {
    if (user?.id) {
      setPage(1);
      setPosts([]);
      setHasMore(true);
      loadFeed(1, true); // Reset load
    }
    loadTrending();
  }, [user?.id]); // Removed feedType dependency

  const loadFeed = async (pageToLoad = 1, reset = false) => {
    try {
      setLoadingPosts(true);
      const limit = 5;
      const response = await PostService.getFeed(pageToLoad, limit, 'global', user?.id); // Always global
      const newPosts = response?.data || [];
      // const count = response?.count || 0;

      // Transform and add userHasLiked
      const formattedFeed = newPosts.map((p: any) => ({
        ...p,
        userHasLiked: p.post_likes?.some((l: any) => l.user_id === user?.id) || false
      }));

      if (reset) {
        setPosts(formattedFeed as any);
      } else {
        setPosts(prev => [...prev, ...formattedFeed as any]);
      }

      // Check if we have more
      // If we got fewer than limit, or if total count reached
      if (newPosts.length < limit) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

    } catch (error) {
      console.error("Erro ao carregar feed:", error);
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadFeed(nextPage);
  };

  const loadTrending = async () => {
    const trending = await TMDBService.getTrendingSeries();
    setTrendingSeries(trending.slice(0, 5));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewPostImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handlePostSubmit = async () => {
    if (!newPostContent.trim()) return;
    setSubmitting(true);

    try {
      // Pass the captured series data if available
      await PostService.createPost(
        user.id,
        newPostContent,
        newPostImage,
        postRelatedSeries?.tmdb_id, // tmdbId
        postRelatedSeries?.series_title // seriesTitle
      );

      // Check for immediate badge award
      if (postRelatedSeries?.tmdb_id) {
        const { BadgeService } = await import('../src/services/badgeService');
        const badge = await BadgeService.checkPostBadges(user.id, postRelatedSeries.tmdb_id);
        if (badge) {
          setJustEarnedBadge(badge as unknown as Stamp);
        }
      }

      setNewPostContent('');
      setNewPostImage(null);
      setImagePreview(null);
      setPostRelatedSeries(null); // Reset
      // Reload feed from scratch to show new post
      setPage(1);
      loadFeed(1, true);
    } catch (error) {
      alert('Erro ao criar post: ' + (error as any).message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSpoiler = (id: number) => {
    setSpoilerRevealed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLike = async (post: Post) => {
    try {
      // Optimistic Update
      const isLiked = post.userHasLiked; // Need to track this in Post type or separately
      const newLikes = isLiked ? post.likes - 1 : post.likes + 1;

      setPosts(posts.map(p => p.id === post.id ? { ...p, likes: newLikes, userHasLiked: !isLiked } : p));

      if (isLiked) {
        await PostService.unlikePost(String(post.id), user.id as string);
      } else {
        await PostService.likePost(String(post.id), user.id as string);
      }
    } catch (err) {
      console.error(err);
      loadFeed(); // Revert on error
    }
  };

  const toggleComments = async (postId: string) => {
    if (activeCommentsPostId === postId) {
      setActiveCommentsPostId(null);
      return;
    }
    setActiveCommentsPostId(postId);
    if (!commentsData[postId]) {
      setLoadingComments(true);
      try {
        const comments = await PostService.getComments(postId);
        setCommentsData(prev => ({ ...prev, [postId]: comments }));
      } catch (err) { console.error(err); }
      finally { setLoadingComments(false); }
    }
  };

  const submitComment = async (postId: string) => {
    if (!newCommentText.trim()) return;
    try {
      const comment = await PostService.addComment(postId, user.id, newCommentText);
      setCommentsData(prev => ({ ...prev, [postId]: [...(prev[postId] || []), comment] }));
      setPosts(posts.map(p => p.id === postId ? { ...p, comments: p.comments + 1 } : p));
      setNewCommentText('');
    } catch (err: any) { alert(err.message); }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta publicação?')) return;
    try {
      await PostService.deletePost(postId);
      setPosts(posts.filter(p => p.id !== postId));
      setActiveMenuId(null);
    } catch (error: any) {
      alert('Erro ao excluir: ' + error.message);
    }
  };

  const handleSeriesClick = async (seriesName: string) => {
    try {
      const results = await TMDBService.searchSeries(seriesName);
      if (results && results.length > 0) {
        setSelectedSeries(results[0]);
        setIsModalOpen(true); // Re-using the trending modal
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUserClick = async (handle: string) => {
    try {
      // Try to search for user by handle (fuzzy)
      const results = await ProfileService.searchUsers(handle);
      // Filter for exact handle match if possible, or take first
      const user = results?.find((u: any) => u.handle === handle || u.handle === `@${handle}` || u.name === handle) || results?.[0];

      if (user) {
        navigate(`/user/${user.id}`);
      } else {
        alert('Usuário não encontrado');
      }
    } catch (e) {
      console.error(e);
    }
  };


  const [activeTab, setActiveTab] = useState<RatingCategory>('Recomendadas');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newReview, setNewReview] = useState<{
    title: string;
    image: string;
    category: RatingCategory;
    comment: string;
  }>({
    title: '',
    image: '',
    category: 'Recomendadas',
    comment: ''
  });
  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300 pb-20 md:pb-0">
      <Navigation page="feed" />

      {justEarnedBadge && (
        <CongratsModal
          stamp={justEarnedBadge}
          onClose={() => setJustEarnedBadge(null)}
          onViewCollection={() => {
            setJustEarnedBadge(null);
            // Navigate to collection or open modal? 
            // For now close, maybe navigate to profile?
            navigate(`/user/${user.id}`);
          }}
        />
      )}

      <main className="flex-1 w-full max-w-[1280px] mx-auto p-4 lg:px-6 lg:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Main Feed Column */}
          <div className="lg:col-span-8 flex flex-col gap-6">

            <div className="flex items-center justify-between pb-2">
              <h1 className="text-slate-900 dark:text-white text-2xl lg:text-3xl font-bold tracking-tight">Feed de Séries</h1>
              <button className="md:hidden text-primary">
                <span className="material-symbols-outlined">search</span>
              </button>
            </div>

            {/* Composer */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-surface-border shadow-sm dark:shadow-lg transition-colors duration-300">
              <div className="p-4 flex gap-4">
                <div className="shrink-0">
                  <div className="size-12 rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${user.avatar}')` }}></div>
                </div>
                <div className="flex-1 flex flex-col gap-3 relative">
                  <textarea
                    className="w-full bg-gray-50 dark:bg-[#1a1122] border border-gray-200 dark:border-surface-border rounded-lg p-3 text-slate-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-text-secondary focus:border-primary focus:ring-1 focus:ring-primary resize-none text-base min-h-[80px] transition-colors"
                    placeholder="O que você está assistindo? Compartilhe sua opinião..."
                    value={newPostContent}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onSelect={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
                  ></textarea>

                  {/* Mention List Dropdown */}
                  {showMentionList && mentionResults.length > 0 && mentionTarget === 'post' && (
                    <div
                      className="absolute bg-white dark:bg-surface-dark border border-gray-200 dark:border-surface-border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto w-72"
                      style={{ top: '100%', left: '0' }} // Simple positioning relative to container for now, improving "way down" issue by being contextual
                    >
                      {mentionResults.map((item: any, index: number) => (
                        <button
                          key={item.id}
                          onClick={() => insertMention(item)}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b border-gray-100 dark:border-white/5 last:border-0 transition-colors ${index === selectedIndex ? 'bg-primary/10 dark:bg-primary/20' : 'hover:bg-gray-100 dark:hover:bg-white/10'
                            }`}
                        >
                          {mentionType === 'user' ? (
                            <>
                              <div className="size-6 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${item.avatar || 'https://placeholder.pics/svg/50'}')` }}></div>
                              <div className="flex flex-col truncate">
                                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.name}</span>
                                <span className="text-xs text-slate-500 truncate">{item.handle}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-6 h-8 bg-cover bg-center rounded shrink-0" style={{ backgroundImage: `url('${TMDBService.getImageUrl(item.poster_path)}')` }}></div>
                              <div className="flex flex-col truncate">
                                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.name || item.title}</span>
                                <span className="text-xs text-slate-500 truncate">{item.first_air_date?.split('-')[0]}</span>
                              </div>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageChange}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-2 rounded-full transition-colors ${newPostImage ? 'text-green-500 bg-green-50' : 'text-primary hover:bg-primary/10'}`}
                        title="Adicionar Imagem"
                      >
                        <span className="material-symbols-outlined text-[22px]">{newPostImage ? 'check_circle' : 'image'}</span>
                      </button>
                      <button className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors" title="Marcar Série">
                        <span className="material-symbols-outlined text-[22px]">movie</span>
                      </button>
                      <button className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors" title="Alerta de Spoiler">
                        <span className="material-symbols-outlined text-[22px]">visibility_off</span>
                      </button>
                    </div>
                    <button
                      onClick={handlePostSubmit}
                      className="px-6 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg transition-colors shadow-md"
                    >
                      Publicar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Tabs Removed */}

            {/* Posts */}
            {posts.map(post => (
              <article key={post.id} className="bg-white dark:bg-surface-dark rounded-xl overflow-hidden shadow-sm dark:shadow-lg border border-gray-200 dark:border-surface-border/50 hover:border-primary/30 dark:hover:border-surface-border transition-colors p-5">

                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${post.user.avatar}')` }}></div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <Link to={`/user/${post.user.id || ''}`} className="text-slate-900 dark:text-white font-bold text-sm hover:underline cursor-pointer">
                          {post.user.name}
                        </Link>
                        {post.tag?.type === 'watching' && (
                          <>
                            <span className="text-slate-500 dark:text-text-secondary text-sm hidden sm:inline">está assistindo</span>
                            <span className="text-primary font-bold text-sm">{post.tag.text}</span>
                          </>
                        )}
                      </div>
                      <span className="text-slate-500 dark:text-text-secondary text-xs">{post.user.handle} • {post.timeAgo}</span>
                    </div>
                  </div>
                  {post.isSpoiler && (
                    <span className="bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs font-bold uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">warning</span> Spoiler
                    </span>
                  )}
                  <div className="relative">
                    {user?.id === post.user_id && (
                      <>
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === post.id ? null : post.id)}
                          className="text-slate-500 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white"
                        >
                          <span className="material-symbols-outlined">more_horiz</span>
                        </button>
                        {activeMenuId === post.id && (
                          <div className="absolute right-0 top-8 bg-white dark:bg-surface-dark border border-gray-200 dark:border-surface-border rounded-lg shadow-xl z-20 min-w-[140px] overflow-hidden">
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-lg">delete</span> Excluir
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Content */}
                {post.isSpoiler && !spoilerRevealed[post.id] ? (
                  <div
                    onClick={() => toggleSpoiler(post.id)}
                    className="relative bg-gray-100 dark:bg-black/40 rounded-lg p-8 text-center border border-dashed border-gray-300 dark:border-surface-border cursor-pointer hover:bg-gray-200 dark:hover:bg-black/60 transition-colors group mb-4"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-slate-500 dark:text-text-secondary text-[32px] group-hover:text-slate-900 dark:group-hover:text-white transition-colors">visibility_off</span>
                      <p className="text-slate-600 dark:text-text-secondary font-medium group-hover:text-slate-900 dark:group-hover:text-white">
                        Este post contém spoilers de <strong className="text-slate-900 dark:text-white">{post.spoilerTopic}</strong>
                      </p>
                      <button className="mt-2 text-primary text-sm font-bold hover:underline">Clique para revelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {post.tag?.type === 'review' && (
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 leading-tight">{post.tag.text}</h3>
                    )}


                    <PostContent
                      content={post.content}
                      onSeriesClick={handleSeriesClick}
                      onUserClick={handleUserClick}
                    />

                    {post.image && (
                      <div className="relative w-full rounded-lg overflow-hidden mb-4 group border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black">
                        <img
                          src={post.image}
                          alt="Post content"
                          className="w-full h-auto max-h-[600px] object-contain mx-auto"
                        />
                        {post.tag?.type === 'review' && (
                          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-primary">star</span> Review
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/5 mt-2">
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleLike(post)}
                      className={`flex items-center gap-1.5 transition-colors group ${post.userHasLiked ? 'text-red-500' : 'text-slate-500 dark:text-text-secondary hover:text-red-500'}`}
                    >
                      <span className={`material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform ${post.userHasLiked ? 'filled' : ''}`}>favorite</span>
                      <span className="text-xs font-bold">{post.likes}</span>
                    </button>
                    <button
                      onClick={() => toggleComments(post.id)}
                      className="flex items-center gap-1.5 text-slate-500 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white transition-colors group"
                    >
                      <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">chat_bubble</span>
                      <span className="text-xs font-bold">{post.comments}</span>
                    </button>
                    <button className="flex items-center gap-1.5 text-slate-500 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white transition-colors group">
                      <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">share</span>
                      <span className="text-xs font-bold">{post.shares}</span>
                    </button>
                  </div>
                </div>

                {/* Comments Section */}
                {activeCommentsPostId === post.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 -mx-5 -mb-5 p-5">
                    <div className="flex gap-2 mb-4">
                      <div className="relative flex-1">
                        <input
                          className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm"
                          placeholder="Escreva um comentário..."
                          value={newCommentText}
                          onChange={handleCommentInputChange}
                          onKeyDown={(e) => {
                            if (showMentionList) {
                              // Pass verify to main handleKeyDown handler if needed or duplicate logic
                              // For simplicity let's duplicate the key check for now
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setSelectedIndex(prev => (prev + 1) % mentionResults.length);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setSelectedIndex(prev => (prev - 1 + mentionResults.length) % mentionResults.length);
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                insertMention(mentionResults[selectedIndex]);
                              } else if (e.key === 'Escape') {
                                setShowMentionList(false);
                              }
                            } else if (e.key === 'Enter') {
                              // Submit comment if not selecting mention
                              // submitComment(post.id); // Optional: submit on enter
                            }
                          }}
                          onSelect={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart || 0)}
                        />

                        {/* Comment Mention Dropdown */}
                        {showMentionList && mentionResults.length > 0 && mentionTarget === 'comment' && (
                          <div
                            className="absolute bottom-full left-0 mb-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-surface-border rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto w-full md:w-72"
                          >
                            {mentionResults.map((item: any, index: number) => (
                              <button
                                key={item.id}
                                onClick={() => insertMention(item)}
                                className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b border-gray-100 dark:border-white/5 last:border-0 transition-colors ${index === selectedIndex ? 'bg-primary/10 dark:bg-primary/20' : 'hover:bg-gray-100 dark:hover:bg-white/10'
                                  }`}
                              >
                                {mentionType === 'user' ? (
                                  <>
                                    <div className="size-6 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${item.avatar || 'https://placeholder.pics/svg/50'}')` }}></div>
                                    <div className="flex flex-col truncate">
                                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.name}</span>
                                      <span className="text-xs text-slate-500 truncate">{item.handle}</span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-6 h-8 bg-cover bg-center rounded shrink-0" style={{ backgroundImage: `url('${TMDBService.getImageUrl(item.poster_path)}')` }}></div>
                                    <div className="flex flex-col truncate">
                                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.name || item.title}</span>
                                      <span className="text-xs text-slate-500 truncate">{item.first_air_date?.split('-')[0]}</span>
                                    </div>
                                  </>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => submitComment(post.id)}
                        className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                        disabled={!newCommentText.trim()}
                      >
                        Enviar
                      </button>
                    </div>
                    <div className="space-y-3">
                      {loadingComments ? (
                        <p className="text-center text-xs text-gray-500">Carregando...</p>
                      ) : commentsData[post.id]?.length > 0 ? (
                        commentsData[post.id].map((comment: any) => (
                          <div key={comment.id} className="flex gap-2">
                            <div className="size-8 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${comment.author?.avatar || 'https://placeholder.pics/svg/50'}')` }}></div>
                            <div className="flex flex-col">
                              <div className="bg-white dark:bg-white/10 p-2 rounded-lg rounded-tl-none">
                                <span className="font-bold text-xs text-slate-900 dark:text-white block">{comment.author?.name}</span>
                                <PostContent
                                  content={comment.content}
                                  onSeriesClick={handleSeriesClick}
                                  onUserClick={handleUserClick}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500 mt-0.5 ml-1">{new Date(comment.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-xs text-gray-500">Seja o primeiro a comentar!</p>
                      )}
                    </div>
                  </div>
                )}
              </article>
            ))}

            {hasMore && (
              <div className="flex justify-center mt-4 mb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingPosts}
                  className="px-6 py-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-surface-border rounded-full text-sm font-bold text-slate-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  {loadingPosts ? 'Carregando...' : 'Ver mais'}
                </button>
              </div>
            )}

          </div>

          {/* Right Sidebar */}
          <aside className="hidden lg:flex flex-col col-span-4 gap-6">

            {/* Trending */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-surface-border p-5 shadow-sm dark:shadow-lg transition-colors duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-900 dark:text-white font-bold text-lg">Em Alta na Semana</h3>
                <a className="text-primary text-xs font-bold hover:underline" href="#">Ver tudo</a>
              </div>
              <div className="flex flex-col gap-4">
                {trendingSeries.map((series, index) => (
                  <div
                    key={series.id}
                    className="flex gap-3 items-center group cursor-pointer"
                    onClick={() => setSelectedSeries(series)}
                  >
                    <div className="w-12 h-16 rounded bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${TMDBService.getImageUrl(series.poster_path)}')` }}></div>
                    <div className="flex flex-col flex-1">
                      <h4 className="text-slate-900 dark:text-white font-bold text-sm group-hover:text-primary transition-colors line-clamp-1">{series.name}</h4>
                      <span className="text-slate-500 dark:text-text-secondary text-xs truncate">{series.first_air_date?.split('-')[0] || 'N/A'}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined text-yellow-500 text-[14px] filled">star</span>
                        <span className="text-slate-900 dark:text-white text-xs font-bold">{series.vote_average.toFixed(1)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => UserSeriesService.addSeries(user.id, series).then(() => alert('Série adicionada!')).catch(e => alert(e.message))}
                      className="text-slate-400 dark:text-slate-500 hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined">add_circle</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested Users */}
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-surface-border p-5 shadow-sm dark:shadow-lg transition-colors duration-300">
              <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-4">Quem Seguir</h3>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="size-9 rounded-full bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDy8w3I1Ke7fsx8OLarppjjM8chhQAimrp35lStCrcx1fg0Igd4AXzRhoU_q4h79JLoV89mWqS6GMKUwHt5j7kN9lS0Mfsw9xLPEykYbAfALo2Ncfheh6mrfb6FP4vf8tfc3K2LCe0Vch07UC1rwDef2rRag-riM27WQHrAx7hGkSJxjvzW0OXp1TCmvTCwsvENsweIfic3KF7ADZPXhfqGzS5vVFWmt-02hwkCM36RUyoiki-OfZkbDacGdK-nJBJCmi3J7gx-9efs')" }}></div>
                    <div className="flex flex-col">
                      <span className="text-slate-900 dark:text-white text-sm font-bold">Carol Cine</span>
                      <span className="text-slate-500 dark:text-text-secondary text-[10px]">Crítica de TV</span>
                    </div>
                  </div>
                  <button className="text-primary text-xs font-bold border border-primary/30 hover:bg-primary hover:text-white px-3 py-1 rounded-full transition-all">Seguir</button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="size-9 rounded-full bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDONS0psR0GKrBFnyPN5QLHf0OkVDuFI5HEI-D-bb-Ru7qCSk-KW4meRtJkdKHJSm2DWgR1O9jaxrfUBXsV01SWKngiRcCbWZUDm6Nxikgxuenc1_rz0tOhm715wVgu_WM7Bo5RDGipguUx0mYBwMsB2MssLZYA5OD1I-VG6GRZdJNKrr83S_CEZ1umRvmwnaRje2eCpNdHC52695OtqyMsYgp_I_vnzZlhjh0rkjt8pOPZ73EezTJYJ2-I_ZHCu2UKA3UhPsb1Masg')" }}></div>
                    <div className="flex flex-col">
                      <span className="text-slate-900 dark:text-white text-sm font-bold">Geek Zone</span>
                      <span className="text-slate-500 dark:text-text-secondary text-[10px]">Notícias</span>
                    </div>
                  </div>
                  <button className="text-primary text-xs font-bold border border-primary/30 hover:bg-primary hover:text-white px-3 py-1 rounded-full transition-all">Seguir</button>
                </div>
              </div>
              <button className="w-full mt-4 py-2 text-slate-500 dark:text-text-secondary text-sm font-medium hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                Ver mais sugestões
              </button>
            </div>
          </aside>

        </div>

        {/* Simple Modal for Trending Series */}
        {
          selectedSeries && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSeries(null)}>
              <div className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedSeries(null)} className="absolute top-2 right-2 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white z-10">
                  <span className="material-symbols-outlined">close</span>
                </button>
                <div className="h-48 bg-cover bg-center relative" style={{ backgroundImage: `url('${TMDBService.getImageUrl(selectedSeries.backdrop_path || selectedSeries.poster_path)}')` }}>
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h2 className="text-xl font-bold text-white">{selectedSeries.name}</h2>
                    <div className="flex gap-2 text-xs text-gray-300">
                      <span>{selectedSeries.first_air_date?.split('-')[0]}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[10px] text-yellow-500 filled">star</span> {selectedSeries.vote_average}</span>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-sm text-slate-700 dark:text-gray-300 leading-relaxed max-h-40 overflow-y-auto mb-6">
                    {selectedSeries.overview || 'Sinopse não disponível.'}
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        UserSeriesService.addSeries(user.id, selectedSeries).then(() => alert('Adicionado!')).catch(e => alert(e.message));
                        setSelectedSeries(null);
                      }}
                      className="px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary/90 transition-colors"
                    >
                      Adicionar à Minha Lista
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }

      </main >
    </div >
  );
};

export default FeedPage;