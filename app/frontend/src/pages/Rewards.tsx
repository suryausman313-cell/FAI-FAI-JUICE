import { useEffect, useMemo, useState } from 'react';
import { Gift, Crown, Clock3, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { CustomerReward, getMyRewards, RewardsPayload } from '@/lib/rewards';
import { useTranslation } from '@/lib/i18n';


function rewardTitle(reward: CustomerReward, language: string) {
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

function expiryLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function RewardCard({ reward, onUse, language }: { reward: CustomerReward; onUse: (reward: CustomerReward) => void; language: string }) {
  const golden = reward.tier === 'golden';
  return (
    <div className={`rounded-2xl border p-4 ${golden ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-red-900/40 bg-black/40'}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2 ${golden ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-600/15 text-red-400'}`}>
          {golden ? <Crown className="h-6 w-6" /> : <Gift className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-white">{rewardTitle(reward, language)}</p>
            {golden && <span className="rounded-full bg-yellow-500 px-2 py-0.5 text-[10px] font-black text-black">{language === 'ar' ? 'ذهبي' : 'GOLDEN'}</span>}
          </div>
          <p className="mt-1 text-xs text-gray-400">{language === 'ar' ? 'الحد الأدنى للطلب القادم' : 'Minimum next order'}: AED {Number(reward.minimum_order || 0).toFixed(0)}</p>
          {reward.expires_at && (
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500"><Clock3 className="h-3 w-3" /> {language === 'ar' ? 'ينتهي في' : 'Expires'} {expiryLabel(reward.expires_at)}</p>
          )}
        </div>
      </div>
      <Button onClick={() => onUse(reward)} className="mt-4 w-full bg-red-600 hover:bg-red-700">{language === 'ar' ? 'استخدمه في الطلب القادم' : 'Use on next order'}</Button>
    </div>
  );
}

export default function Rewards() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const [data, setData] = useState<RewardsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMyRewards()
      .then(payload => { if (active) setData(payload); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : language === 'ar' ? 'تعذر تحميل المكافآت' : 'Could not load rewards'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const enabled = data?.enabled !== false;

  const progress = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, Math.min(100, (Number(data.gold_progress || 0) / Math.max(1, Number(data.gold_required || 3))) * 100));
  }, [data]);

  function useReward(reward: CustomerReward) {
    localStorage.setItem('fai_fai_selected_reward_id', String(reward.id));
    navigate('/checkout');
  }

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-2xl space-y-5 p-4 pb-28">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white"><Gift className="h-7 w-7 text-red-500" /> {language === 'ar' ? 'مكافآت فاي فاي' : 'Fai Fai Rewards'}</h1>
          <p className="mt-1 text-sm text-gray-400">{language === 'ar' ? 'كل طلب مكتمل بقيمة 15 درهماً أو أكثر يفتح صندوق مفاجأة.' : 'Every AED 15+ completed order unlocks a Surprise Box.'}</p>
        </div>

        <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-black p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-black text-yellow-400"><Crown className="h-5 w-5" /> {language === 'ar' ? 'المكافأة الذهبية' : 'Golden Reward'}</p>
              <p className="mt-1 text-sm text-gray-300">{language === 'ar' ? 'أكمل 3 طلبات بقيمة 100 درهم أو أكثر خلال 30 يوماً لفتح مكافأة خاصة.' : 'Complete 3 orders of AED 100+ within 30 days to unlock a special reward.'}</p>
            </div>
            <div className="text-right text-2xl font-black text-white">{data?.gold_progress ?? 0}/{data?.gold_required ?? 3}</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800">
            <div className="h-full rounded-full bg-yellow-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {loading && <div className="rounded-2xl border border-gray-800 bg-black/40 p-6 text-center text-gray-400">{language === 'ar' ? 'جارٍ تحميل المكافآت…' : 'Loading rewards…'}</div>}
        {error && <div className="rounded-2xl border border-red-800/50 bg-red-900/10 p-4 text-sm text-red-300">{error}</div>}

        {!loading && !error && !enabled && (
          <div className="rounded-2xl border border-gray-800 bg-black/40 p-6 text-center">
            <Gift className="mx-auto h-10 w-10 text-gray-600" />
            <p className="mt-3 font-semibold text-white">{language === 'ar' ? 'المكافآت غير متاحة حالياً' : 'Rewards are currently unavailable'}</p>
            <p className="mt-1 text-sm text-gray-500">{language === 'ar' ? 'يرجى المحاولة مرة أخرى لاحقاً.' : 'Please check again later.'}</p>
            <Button onClick={() => navigate('/menu')} className="mt-4 bg-red-600 hover:bg-red-700"><ShoppingBag className="mr-2 h-4 w-4" /> {language === 'ar' ? 'تصفح القائمة' : 'Browse Menu'}</Button>
          </div>
        )}

        {!loading && !error && enabled && (data?.available?.length || 0) === 0 && (
          <div className="rounded-2xl border border-gray-800 bg-black/40 p-6 text-center">
            <Gift className="mx-auto h-10 w-10 text-gray-600" />
            <p className="mt-3 font-semibold text-white">{language === 'ar' ? 'لا يوجد صندوق مفاجأة الآن' : 'No Surprise Box yet'}</p>
            <p className="mt-1 text-sm text-gray-500">{language === 'ar' ? 'أكمل طلباً بقيمة 15 درهماً أو أكثر لفتح مكافأتك التالية.' : 'Complete an order of AED 15 or more to unlock your next reward.'}</p>
            <Button onClick={() => navigate('/menu')} className="mt-4 bg-red-600 hover:bg-red-700"><ShoppingBag className="mr-2 h-4 w-4" /> {language === 'ar' ? 'تصفح القائمة' : 'Browse Menu'}</Button>
          </div>
        )}

        {enabled && (data?.available || []).map(reward => <RewardCard key={reward.id} reward={reward} onUse={useReward} language={language} />)}

        <div className="rounded-xl border border-gray-800 bg-black/30 p-3 text-xs leading-5 text-gray-500">
          {language === 'ar' ? 'صناديق المفاجأة تمنح خصومات أو آيس كريم صغير مجاناً. المكافأة الذهبية تُفتح بعد 3 طلبات مؤهلة بقيمة 100 درهم أو أكثر.' : 'Surprise Boxes include discounts or a free Small Ice Cream. Golden Rewards unlock after 3 qualifying AED 100+ orders.'}
        </div>
      </div>
    </CustomerLayout>
  );
}
