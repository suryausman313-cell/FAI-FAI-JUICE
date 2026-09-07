import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, Crown, Gift, CheckCircle2, Sparkles, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import CustomerLayout from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { CustomerReward, getMyRewards, openRewardBox, RewardsPayload } from '@/lib/rewards';
import { useTranslation } from '@/lib/i18n';

function expiryLabel(value: string | null, language: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-GB', { month: 'short', day: 'numeric' });
}

function localizedRewardTitle(reward: CustomerReward, language: string) {
  if (language !== 'ar') return reward.title;
  if (reward.type === 'free_ice_cream') return 'آيس كريم صغير مجاناً';
  if (reward.type === 'golden_free_item') return 'ذهبي: منتج مختار مجاناً حتى 15 درهماً';
  if (reward.type === 'fixed') return reward.tier === 'golden'
    ? `ذهبي: خصم ${Number(reward.value || 0).toFixed(0)} درهم`
    : `خصم ${Number(reward.value || 0).toFixed(0)} درهم`;
  if (reward.type === 'percent') {
    const cap = Number(reward.max_discount || 0);
    return reward.tier === 'golden'
      ? `ذهبي: خصم ${Number(reward.value || 0).toFixed(0)}%${cap > 0 ? ` حتى ${cap.toFixed(0)} درهماً` : ''}`
      : `خصم ${Number(reward.value || 0).toFixed(0)}%${cap > 0 ? ` حتى ${cap.toFixed(0)} دراهم` : ''}`;
  }
  return reward.title;
}

function MiniGift({ opening = false, used = false }: { opening?: boolean; used?: boolean }) {
  return (
    <div className={`relative h-16 w-20 shrink-0 ${used ? 'opacity-45 grayscale' : ''}`} aria-hidden="true">
      <div className={`absolute left-2 top-5 h-10 w-16 rounded-b-lg border ${used ? 'border-gray-600 bg-gray-800' : 'border-emerald-400/50 bg-gray-950'} shadow-lg`} />
      <div className={`absolute left-1 top-4 h-3 w-[72px] rounded-md border ${used ? 'border-gray-600 bg-gray-700' : 'border-emerald-400/60 bg-gray-900'} ${opening ? 'animate-[faiLid_.55s_ease-out_forwards]' : ''}`} />
      <div className={`absolute left-[37px] top-4 h-11 w-2 ${used ? 'bg-gray-600' : 'bg-emerald-500'}`} />
      <div className={`absolute left-[25px] top-1 h-5 w-7 rounded-full border-2 ${used ? 'border-gray-600' : 'border-emerald-400'} -rotate-12`} />
      <div className={`absolute left-[39px] top-1 h-5 w-7 rounded-full border-2 ${used ? 'border-gray-600' : 'border-emerald-400'} rotate-12`} />
      {opening && <Sparkles className="absolute -top-1 right-0 h-5 w-5 animate-ping text-yellow-300" />}
    </div>
  );
}

export default function Rewards() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const [data, setData] = useState<RewardsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<CustomerReward | null>(null);

  const ar = language === 'ar';

  async function load() {
    try {
      setData(await getMyRewards());
    } catch (error: any) {
      toast.error(String(error?.message || (ar ? 'تعذر تحميل المكافآت' : 'Could not load rewards')));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function openBox(box: CustomerReward) {
    if (openingId) return;
    setOpeningId(box.id);
    setRevealed(null);
    try {
      // Keep the lid animation visible briefly, then show the server-revealed prize.
      const [reward] = await Promise.all([
        openRewardBox(box.id),
        new Promise(resolve => setTimeout(resolve, 650)),
      ]);
      setRevealed(reward);
      await load();
      setTimeout(() => setRevealed(null), 3200);
    } catch (error: any) {
      toast.error(String(error?.message || (ar ? 'تعذر فتح الصندوق' : 'Could not open box')));
    } finally {
      setOpeningId(null);
    }
  }

  function useReward(reward: CustomerReward) {
    localStorage.setItem('fai_fai_selected_reward_id', String(reward.id));
    navigate('/checkout');
  }

  const progress = Math.min(Number(data?.gold_progress || 0), Number(data?.gold_required || 3));
  const percent = Math.min(100, (progress / Math.max(1, Number(data?.gold_required || 3))) * 100);
  const usedHistory = useMemo(() => (data?.history || []).filter(r => ['redeemed', 'expired'].includes(String(r.status))), [data]);

  return (
    <CustomerLayout>
      <style>{`
        @keyframes faiLid { 0% { transform: translateY(0) rotate(0deg); } 55% { transform: translateY(-10px) rotate(-10deg); } 100% { transform: translateY(-15px) rotate(-16deg); } }
        @keyframes faiPrize { 0% { opacity: 0; transform: translate(-50%, 24px) scale(.65); } 55% { opacity: 1; transform: translate(-50%, -12px) scale(1.08); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }
      `}</style>
      <div className="mx-auto max-w-lg px-4 py-5 text-white">
        <div className="mb-4 flex items-center gap-3">
          <Gift className="h-7 w-7 text-emerald-400" />
          <div>
            <h1 className="text-2xl font-black">{ar ? 'مكافآت فاي فاي' : 'Fai Fai Rewards'}</h1>
            <p className="text-xs text-gray-400">{ar ? 'كل طلب مكتمل بقيمة 15 درهماً أو أكثر يفتح صندوق مفاجأة.' : 'Every AED 15+ completed order unlocks a Surprise Box.'}</p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-yellow-500/35 bg-gradient-to-br from-yellow-500/10 to-gray-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-400" />
              <span className="font-black text-yellow-300">{ar ? 'المكافأة الذهبية' : 'Golden Reward'}</span>
            </div>
            <span className="text-xl font-black">{progress}/{data?.gold_required || 3}</span>
          </div>
          <p className="mt-1 text-xs text-gray-300">{ar ? 'أكمل 3 طلبات بقيمة 100 درهم أو أكثر خلال 30 يوماً لفتح مكافأة خاصة.' : 'Complete 3 orders of AED 100+ within 30 days to unlock a special reward.'}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-yellow-400 transition-all" style={{ width: `${percent}%` }} /></div>
        </div>

        {revealed && (
          <div className="pointer-events-none fixed left-1/2 top-[26%] z-[80] w-[86%] max-w-sm -translate-x-1/2 rounded-2xl border border-yellow-300/70 bg-gray-950/95 p-4 text-center shadow-2xl shadow-emerald-500/20" style={{ animation: 'faiPrize .55s ease-out both' }}>
            <Sparkles className="mx-auto mb-1 h-6 w-6 text-yellow-300" />
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">{ar ? 'لقد حصلت على' : 'You got'}</p>
            <p className="mt-1 text-xl font-black text-white">{localizedRewardTitle(revealed, language)}</p>
            <p className="mt-1 text-xs text-gray-400">{ar ? 'تم حفظ المكافأة ويمكن استخدامها في الطلب القادم.' : 'Reward saved. Use it on your next order.'}</p>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">{ar ? 'جارٍ تحميل المكافآت…' : 'Loading rewards…'}</div>
        ) : data?.enabled === false ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">{ar ? 'المكافآت غير متاحة حالياً' : 'Rewards are currently unavailable'}</div>
        ) : (
          <div className="space-y-3">
            {(data?.boxes || []).map(box => (
              <div key={`box-${box.id}`} className="flex items-center gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/5 p-3">
                <MiniGift opening={openingId === box.id} />
                <div className="min-w-0 flex-1">
                  <p className="font-black">{ar ? 'صندوق مفاجأة جاهز' : 'Surprise Box Ready'}</p>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400"><Clock3 className="h-3 w-3" /> {ar ? 'ينتهي في' : 'Expires'} {expiryLabel(box.expires_at, language)}</div>
                  <Button disabled={openingId !== null} onClick={() => void openBox(box)} className="mt-2 h-9 w-full bg-emerald-500 font-black text-black hover:bg-emerald-400">
                    {openingId === box.id ? (ar ? 'جارٍ الفتح…' : 'Opening…') : (ar ? 'افتح الصندوق' : 'Open Box')}
                  </Button>
                </div>
              </div>
            ))}

            {(data?.available || []).map(reward => (
              <div key={`reward-${reward.id}`} className={`flex items-center gap-3 rounded-2xl border p-3 ${reward.tier === 'golden' ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-sky-500/35 bg-sky-500/5'}`}>
                <MiniGift />
                <div className="min-w-0 flex-1">
                  <p className="font-black">{localizedRewardTitle(reward, language)}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{ar ? 'الحد الأدنى للطلب القادم' : 'Minimum next order'}: AED {Number(reward.minimum_order || 0).toFixed(0)}</p>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400"><Clock3 className="h-3 w-3" /> {ar ? 'ينتهي في' : 'Expires'} {expiryLabel(reward.expires_at, language)}</div>
                  <Button onClick={() => useReward(reward)} className="mt-2 h-9 w-full bg-emerald-500 font-black text-black hover:bg-emerald-400">{ar ? 'استخدمه في الطلب القادم' : 'Use on next order'}</Button>
                </div>
              </div>
            ))}

            {usedHistory.slice(0, 8).map(reward => (
              <div key={`history-${reward.id}`} className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-3 opacity-70">
                <MiniGift used />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-300">{localizedRewardTitle(reward, language)}</p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {String(reward.status) === 'redeemed' ? (ar ? 'مستخدمة' : 'Used') : (ar ? 'منتهية' : 'Expired')}
                  </div>
                </div>
              </div>
            ))}

            {(data?.boxes || []).length === 0 && (data?.available || []).length === 0 && usedHistory.length === 0 && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
                <Gift className="mx-auto h-9 w-9 text-gray-600" />
                <p className="mt-2 font-bold">{ar ? 'لا يوجد صندوق مفاجأة الآن' : 'No Surprise Box yet'}</p>
                <p className="mt-1 text-xs text-gray-500">{ar ? 'أكمل طلباً بقيمة 15 درهماً أو أكثر لفتح مكافأتك التالية.' : 'Complete an order of AED 15 or more to unlock your next reward.'}</p>
                <Button onClick={() => navigate('/menu')} className="mt-4"><ShoppingBag className="mr-2 h-4 w-4" />{ar ? 'تصفح القائمة' : 'Browse Menu'}</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
