import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Star, Send, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import CustomerLayout from '@/components/CustomerLayout';
import { client, Order } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function Feedback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order');
  
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    try {
      const res = await client.auth.me();
      if (res?.data) {
        setIsLoggedIn(true);
        setUserName(res.data.name || res.data.email || 'Customer');
        if (orderId) {
          await loadOrder(parseInt(orderId));
          await checkExistingFeedback(parseInt(orderId));
        }
      }
    } catch {
      setIsLoggedIn(false);
    } finally {
      setCheckingAuth(false);
    }
  }

  async function loadOrder(id: number) {
    try {
      // Load from my-orders API and find the specific order
      const res = await client.apiCall.invoke({
        url: '/api/v1/orders/my-orders',
        method: 'GET',
      });
      const orders = res?.data?.items || [];
      const found = orders.find((o: any) => o.id === id);
      if (found) {
        setOrder(found);
      }
    } catch (e) {
      console.error('Failed to load order:', e);
    }
  }

  async function checkExistingFeedback(orderIdNum: number) {
    try {
      // Use entity query to check if feedback already exists for this order
      const res = await client.entities.feedbacks.query({
        query: { order_id: orderIdNum },
        limit: 1,
      });
      if (res?.data?.items?.length > 0) {
        setAlreadyReviewed(true);
      }
    } catch (e) {
      console.error('Failed to check feedback:', e);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }
    if (!isLoggedIn) {
      toast.error('Please login to submit feedback');
      client.auth.toLogin();
      return;
    }
    if (!orderId) {
      toast.error('No order selected for feedback');
      return;
    }

    setLoading(true);
    try {
      // Use entity create for feedback submission
      await client.entities.feedbacks.create({
        data: {
          customer_name: userName,
          rating,
          comment: comment.trim(),
          order_id: parseInt(orderId),
          is_visible: true,
        },
      });
      setSubmitted(true);
      toast.success('Thank you for your feedback! 🎉');
    } catch (e: any) {
      toast.error(e?.data?.detail || e?.message || 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      </CustomerLayout>
    );
  }

  // No order specified - show message to go to orders
  if (!orderId) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen px-4 py-12 max-w-lg mx-auto flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-4">📝</div>
          <h2 className="text-white text-xl font-bold mb-2">Give Feedback</h2>
          <p className="text-gray-400 mb-6">
            You can give feedback on your completed orders. Go to My Orders and tap "Give Feedback" on any completed order.
          </p>
          <Button onClick={() => navigate('/my-orders')} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
            Go to My Orders
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  // Already reviewed
  if (alreadyReviewed) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen px-4 py-12 max-w-lg mx-auto flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-white text-xl font-bold mb-2">Already Reviewed</h2>
          <p className="text-gray-400 mb-6">
            You have already submitted feedback for Order #{orderId}. Thank you!
          </p>
          <Button onClick={() => navigate('/my-orders')} className="bg-gray-800 hover:bg-gray-700 text-white cursor-pointer">
            Back to My Orders
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  if (submitted) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen px-4 py-12 max-w-lg mx-auto flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-white text-2xl font-bold mb-2">Thank You!</h2>
          <p className="text-gray-400 mb-6">Your feedback helps us improve our service.</p>
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className={`w-8 h-8 ${s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
            ))}
          </div>
          {comment && <p className="text-gray-300 italic mb-6">"{comment}"</p>}
          <Button onClick={() => navigate('/my-orders')} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
            Back to My Orders
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" onClick={() => navigate('/my-orders')} className="text-gray-400 p-2 cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-white text-2xl font-bold">Rate Your Order</h1>
        </div>

        {!isLoggedIn && (
          <div className="mb-6 p-4 rounded-xl bg-red-600/10 border border-red-600/30">
            <p className="text-red-400 text-sm mb-3">Please login to submit feedback</p>
            <Button onClick={() => client.auth.toLogin()} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              Login / Sign Up
            </Button>
          </div>
        )}

        {/* Order Info */}
        {order && (
          <div className="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold">Order #{order.id}</span>
              <span className="text-red-400 font-bold">AED {order.total_amount?.toFixed(2)}</span>
            </div>
            <p className="text-gray-500 text-xs">
              {new Date(order.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Star Rating */}
          <div className="text-center">
            <Label className="text-gray-300 mb-4 block text-lg">How was your experience?</Label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110 cursor-pointer"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-600'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-gray-500 text-sm mt-2">
              {rating === 1 && '😞 Poor'}
              {rating === 2 && '😐 Fair'}
              {rating === 3 && '🙂 Good'}
              {rating === 4 && '😊 Very Good'}
              {rating === 5 && '🤩 Excellent!'}
              {rating === 0 && 'Tap a star to rate'}
            </p>
          </div>

          {/* Comment */}
          <div>
            <Label className="text-gray-300 mb-2 block">Tell us more (optional)</Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="What did you like? What can we improve?"
              className="bg-gray-900 border-gray-700 text-white min-h-[120px]"
              maxLength={500}
            />
            <p className="text-gray-600 text-xs mt-1 text-right">{comment.length}/500</p>
          </div>

          <Button
            type="submit"
            disabled={loading || rating === 0 || !isLoggedIn}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Submitting...' : (
              <span className="flex items-center gap-2">
                <Send className="w-5 h-5" /> Submit Feedback
              </span>
            )}
          </Button>
        </form>
      </div>
    </CustomerLayout>
  );
}