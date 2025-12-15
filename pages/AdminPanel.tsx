import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import { AppContext } from '../App';
import { AdminService } from '../src/services/adminService';
import { TMDBService } from '../src/services/tmdbService';
import { Stamp, TMDBSeries } from '../types';

const AdminPanel: React.FC = () => {
    const { user } = useContext(AppContext);
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    // Form States
    const [stampName, setStampName] = useState('');
    const [stampDesc, setStampDesc] = useState('');
    const [stampRarity, setStampRarity] = useState<'Comum' | 'Raro' | 'Épico' | 'Lendário'>('Comum');
    const [stampImage, setStampImage] = useState<File | null>(null);
    const [isPurchasable, setIsPurchasable] = useState(false);
    const [stampPrice, setStampPrice] = useState<number>(0);
    const [maxSupply, setMaxSupply] = useState<number | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Series Search State
    const [seriesQuery, setSeriesQuery] = useState('');
    const [seriesResults, setSeriesResults] = useState<TMDBSeries[]>([]);
    const [selectedSeries, setSelectedSeries] = useState<{ id: number; title: string } | null>(null);
    const [searchingSeries, setSearchingSeries] = useState(false);

    // Logic State
    const [reqType, setReqType] = useState<string>('none');
    const [reqValue, setReqValue] = useState<number>(1);

    const [creating, setCreating] = useState(false);

    // List States
    const [stamps, setStamps] = useState<Stamp[]>([]);

    useEffect(() => {
        checkAdmin();
        loadStamps();
    }, [user]);

    const checkAdmin = async () => {
        if (!user) return;
        const admin = await AdminService.isAdmin(user.id || '');
        if (!admin) {
            alert('Acesso negado. Área restrita a administradores.');
            navigate('/feed');
        }
        setIsAdmin(admin);
        setLoading(false);
    };

    const loadStamps = async () => {
        try {
            const data = await AdminService.getAllStamps();
            setStamps(data as Stamp[]);
        } catch (error) {
            console.error(error);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setStampImage(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stampName || !stampDesc || !stampImage) return;

        setCreating(true);
        try {
            await AdminService.createStamp(
                stampName,
                stampDesc,
                stampRarity,
                stampImage,
                isPurchasable,
                stampPrice,
                selectedSeries?.id,
                selectedSeries?.title,
                reqType,
                reqValue,
                maxSupply
            );
            alert('Selo criado com sucesso!');
            // Reset form
            setStampName('');
            setStampDesc('');
            setStampRarity('Comum');
            setStampImage(null);
            setIsPurchasable(false);
            setStampPrice(0);
            setImagePreview(null);
            setSelectedSeries(null); // Reset series
            setSeriesQuery('');
            setReqType('none');
            setReqValue(1);
            setMaxSupply(null);
            loadStamps();
        } catch (error) {
            console.error(error);
            alert('Erro ao criar selo.');
        } finally {
            setCreating(false);
        }
    };

    const handleSeriesSearch = async (query: string) => {
        setSeriesQuery(query);
        if (query.length > 2) {
            setSearchingSeries(true);
            try {
                const results = await TMDBService.searchSeries(query);
                setSeriesResults(results);
            } catch (error) {
                console.error(error);
            } finally {
                setSearchingSeries(false);
            }
        } else {
            setSeriesResults([]);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (confirm(`Tem certeza que deseja excluir o selo "${name}"?`)) {
            try {
                await AdminService.deleteStamp(id);
                setStamps(prev => prev.filter(s => s.id !== id));
            } catch (error) {
                console.error(error);
                alert('Erro ao excluir selo.');
            }
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-50 dark:bg-[#1a1122] flex items-center justify-center">Carregando...</div>;

    if (!isAdmin) return null;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#1a1122]">
            <Navigation page="settings" />

            <main className="max-w-4xl mx-auto p-4 md:p-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Painel do Administrador</h1>
                    <p className="text-slate-500 dark:text-text-secondary">Gerencie selos, usuários e configurações do sistema.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Create Stamp Form */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl shadow-sm border border-gray-200 dark:border-white/5 h-fit">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">add_circle</span>
                            Criar Novo Selo
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Image Upload */}
                            <div className="flex justify-center mb-6">
                                <label className="relative cursor-pointer group">
                                    <div className={`w-32 h-32 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${imagePreview ? 'border-primary' : 'border-gray-300 dark:border-gray-600 hover:border-primary'}`}>
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center p-2">
                                                <span className="material-symbols-outlined text-3xl text-gray-400 mb-1">upload</span>
                                                <p className="text-xs text-gray-400">Upload Imagem</p>
                                            </div>
                                        )}
                                    </div>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1">Nome do Selo</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2.5 text-sm"
                                    placeholder="Ex: Maratonista"
                                    value={stampName}
                                    onChange={e => setStampName(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1">Tarefa / Comando</label>
                                <textarea
                                    className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2.5 text-sm h-24 resize-none"
                                    placeholder="Ex: Assistir 10 horas de séries..."
                                    value={stampDesc}
                                    onChange={e => setStampDesc(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1">Raridade</label>
                                <select
                                    className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2.5 text-sm"
                                    value={stampRarity}
                                    onChange={e => setStampRarity(e.target.value as any)}
                                >
                                    <option value="Comum">Comum</option>
                                    <option value="Raro">Raro</option>
                                    <option value="Épico">Épico</option>
                                    <option value="Lendário">Lendário</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1">Quantidade Disponível (Estoque)</label>
                                <input
                                    type="number"
                                    className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2.5 text-sm"
                                    placeholder="Deixe em branco para ilimitado"
                                    value={maxSupply || ''}
                                    onChange={e => setMaxSupply(e.target.value ? Number(e.target.value) : null)}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Ex: 100 para criar um selo de edição limitada.</p>
                            </div>

                            {/* Series Search Input */}
                            <div className="relative">
                                <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1">Série Relacionada (Opcional)</label>
                                {selectedSeries ? (
                                    <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
                                        <span className="font-bold text-primary">{selectedSeries.title}</span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSeries(null)}
                                            className="text-red-500 hover:text-red-700 font-bold text-xs"
                                        >
                                            REMOVER
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2.5 text-sm"
                                            placeholder="Buscar série..."
                                            value={seriesQuery}
                                            onChange={e => handleSeriesSearch(e.target.value)}
                                        />
                                        {seriesResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto z-10">
                                                {seriesResults.map(series => (
                                                    <div
                                                        key={series.id}
                                                        className="p-2 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer flex items-center gap-2 border-b border-gray-100 dark:border-white/5 last:border-0"
                                                        onClick={() => {
                                                            setSelectedSeries({ id: series.id, title: series.name });
                                                            setSeriesQuery('');
                                                            setSeriesResults([]);
                                                        }}
                                                    >
                                                        {series.poster_path && (
                                                            <img src={`https://image.tmdb.org/t/p/w92${series.poster_path}`} alt={series.name} className="w-8 h-12 object-cover rounded" />
                                                        )}
                                                        <span className="text-sm font-bold text-slate-700 dark:text-gray-300">{series.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Logic Configuration */}
                            {selectedSeries && (
                                <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20">
                                    <h3 className="font-bold text-blue-900 dark:text-blue-100 text-sm">Automação (Regra para ganhar)</h3>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-gray-300 mb-1">Tipo de Requisito</label>
                                        <select
                                            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2 text-sm"
                                            value={reqType}
                                            onChange={e => setReqType(e.target.value)}
                                        >
                                            <option value="none">Manual (Sem automação)</option>
                                            <option value="post_count">Quantidade de Posts sobre a Série</option>
                                        </select>
                                    </div>

                                    {reqType === 'post_count' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-gray-300 mb-1">Quantidade Necessária</label>
                                            <input
                                                type="number"
                                                className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2 text-sm"
                                                value={reqValue}
                                                onChange={e => setReqValue(Number(e.target.value))}
                                                min="1"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="purchasable"
                                    checked={isPurchasable}
                                    onChange={(e) => setIsPurchasable(e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <label htmlFor="purchasable" className="text-sm font-bold text-slate-700 dark:text-gray-300 select-none">
                                    Disponível para venda na Loja?
                                </label>
                            </div>

                            {isPurchasable && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                    <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1">Preço (Moedas)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-2.5 pl-9 text-sm"
                                            placeholder="0"
                                            value={stampPrice}
                                            onChange={e => setStampPrice(Number(e.target.value))}
                                            min="0"
                                        />
                                        <span className="absolute left-3 top-2.5 text-base">🪙</span>
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={creating}
                                className="w-full bg-primary text-white font-bold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {creating ? 'Criando...' : 'Criar Selo'}
                            </button>
                        </form>
                    </div>

                    {/* Existing Stamps List */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl shadow-sm border border-gray-200 dark:border-white/5">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-yellow-500">military_tech</span>
                            Selos Existentes
                        </h2>

                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                            {stamps.length > 0 ? (
                                stamps.map(stamp => (
                                    <div key={stamp.id} className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                        <div className="size-12 rounded-lg bg-gray-200 dark:bg-white/10 shrink-0 overflow-hidden">
                                            <img src={stamp.image_url} alt={stamp.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 dark:text-white">{stamp.name}</h3>
                                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${stamp.rarity === 'Lendário' ? 'text-yellow-500 border-yellow-500 bg-yellow-500/10' :
                                                stamp.rarity === 'Épico' ? 'text-purple-500 border-purple-500 bg-purple-500/10' :
                                                    stamp.rarity === 'Raro' ? 'text-blue-500 border-blue-500 bg-blue-500/10' :
                                                        'text-gray-500 border-gray-500 bg-gray-500/10'
                                                }`}>
                                                {stamp.rarity}
                                            </span>
                                            {stamp.purchasable && (
                                                <span className="ml-2 text-[10px] font-bold text-green-600 dark:text-green-400 flex items-center gap-1 inline-flex">
                                                    <span className="material-symbols-outlined text-[12px]">storefront</span>
                                                    {stamp.price}
                                                </span>
                                            )}
                                            <p className="text-xs text-slate-500 dark:text-text-secondary mt-1">{stamp.description}</p>

                                            {stamp.max_supply && (
                                                <p className="text-[10px] font-mono text-gray-400 mt-1">
                                                    Estoque: {stamp.current_supply || 0} / {stamp.max_supply}
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleDelete(stamp.id, stamp.name)}
                                            className="ml-auto text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                                            title="Excluir Selo"
                                        >
                                            <span className="material-symbols-outlined">delete</span>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-slate-500 py-10">Nenhum selo criado ainda.</p>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminPanel;
