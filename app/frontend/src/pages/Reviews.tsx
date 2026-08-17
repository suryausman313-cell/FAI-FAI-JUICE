import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CustomerLayout from '@/components/CustomerLayout';
import { client, Feedback } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function Reviews() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgRating, setAvgRating] = useState(0);

  useEffect(() => {
    loadReviews();
  }, []);

  async function loadReviews() {
    try {
      // Use entity query - feedbacks is a public entity (no user_id, create_only=false)
      const res = await client.entities.feedbacks.query({
        query: { is_visible: true },
        sort: '-created_at',
        limit: 50,
      });
      const items = res?.data?.items || [];
      setReviews(items);
      if (items.length > 0) {
        const avg = items.reduce((sum: number, r: Feedback) => sum + r.rating, 0) / items.length;
        setAvgRating(avg);
      }
    } catch (e) {
      console.error('Failed to load reviews:', e);
      // Fallback: try apiCall.invoke in case entity access fails
      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/entities/feedbacks',
          method: 'GET',
          data: { query: JSON.stringify({ is_visible: true }), sort: '-created_at', limit: 50 },
        });
        const items = res?.data?.items || [];
        setReviews(items);
        if (items.length > 0) {
          const avg = items.reduce((sum: number, r: Feedback) => sum + r.rating, 0) / items.length;
          setAvgRating(avg);
        }
      } catch (e2) {
        console.error('Fallback also failed:', e2);
      }
    } finally {
      setLoading(false);
    }
  }

  function getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-AE');
  }

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-6 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="text-gray-400 p-2 cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-white text-2xl font-bold">{t('reviews.title')}</h1>
        </div>

        {/* Rating Summary */}
        {reviews.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-6 mb-6 text-center border border-gray-800">
            <div className="text-4xl font-bold text-white mb-1">{avgRating.toFixed(1)}</div>
            <div className="flex justify-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map(s => (
                <Star
                  key={s}
                  className={`w-5 h-5 ${s <= Math.round(avgRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`}
                />
              ))}
            </div>
            <p className="text-gray-400 text-sm">{reviews.length} {reviews.length === 1 ? t('reviews.review') : t('reviews.reviews')}</p>
          </div>
        )}

        {/* Reviews List */}
        {loading ? (
          <div className="text-center text-gray-400 py-12">{t('reviews.loading')}</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">⭐</div>
            <p className="text-gray-400">{t('reviews.no_reviews')}</p>
            <p className="text-gray-600 text-sm mt-1">{t('reviews.first')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map(review => (
              <div key={review.id} className="bg-gray-900/60 rounded-xl p-4 border border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-600/20 rounded-full flex items-center justify-center">
                      <span className="text-red-400 text-sm font-bold">
                        {review.customer_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="text-white font-medium text-sm">{review.customer_name}</span>
                  </div>
                  <span className="text-gray-600 text-xs">{getTimeAgo(review.created_at)}</span>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${s <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-700'}`}
                    />
                  ))}
                </div>
                {review.comment && (
                  <p className="text-gray-300 text-sm">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}