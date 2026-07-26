import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Eye, EyeOff, Trash2, MessageSquare, Send, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { client, Feedback } from '@/lib/api';

interface FeedbackWithReply extends Feedback {
  admin_reply?: string;
  reply_by?: string;
  reply_date?: string;
}

function parseFeedbackReply(comment: string): { originalComment: string; adminReply?: string; replyBy?: string; replyDate?: string } {
  if (!comment) return { originalComment: '' };
  const parts = comment.split('\n---ADMIN_REPLY---\n');
  if (parts.length < 2) return { originalComment: comment };
  try {
    const replyData = JSON.parse(parts[1]);
    return {
      originalComment: parts[0],
      adminReply: replyData.admin_reply,
      replyBy: replyData.reply_by,
      replyDate: replyData.reply_date,
    };
  } catch {
    return { originalComment: parts[0] };
  }
}

export default function AdminFeedback() {
  const navigate = useNavigate();
  const [feedbacks, setFeedbacks] = useState<FeedbackWithReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    loadFeedbacks();
  }, []);

  async function loadFeedbacks() {
    try {
      const res = await client.entities.feedbacks.query({
        query: {},
        limit: 100,
        sort: '-created_at',
      });
      if (res?.data?.items) {
        // Parse replies from comment field
        const items = res.data.items.map((fb: any) => {
          const parsed = parseFeedbackReply(fb.comment);
          return {
            ...fb,
            comment: parsed.originalComment,
            admin_reply: parsed.adminReply,
            reply_by: parsed.replyBy,
            reply_date: parsed.replyDate,
          };
        });
        setFeedbacks(items);
      }
    } catch (e) {
      console.error('Failed to load feedbacks:', e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisibility(fb: FeedbackWithReply) {
    try {
      await client.entities.feedbacks.update({
        id: String(fb.id),
        data: { is_visible: !fb.is_visible },
      });
      setFeedbacks(prev => prev.map(f => f.id === fb.id ? { ...f, is_visible: !f.is_visible } : f));
      toast.success(fb.is_visible ? 'Feedback hidden from customers' : 'Feedback visible to customers');
    } catch (e: any) {
      toast.error('Failed to update feedback');
    }
  }

  async function deleteFeedback(id: number) {
    if (!confirm('Delete this feedback permanently?')) return;
    try {
      await client.entities.feedbacks.delete({ id: String(id) });
      setFeedbacks(prev => prev.filter(f => f.id !== id));
      toast.success('Feedback deleted');
    } catch (e: any) {
      toast.error('Failed to delete feedback');
    }
  }

  async function sendReply(feedbackId: number) {
    if (!replyText.trim()) {
      toast.error('Please enter a reply');
      return;
    }
    setSendingReply(true);
    try {
      await client.apiCall.invoke({
        url: `/api/v1/admin/feedback/${feedbackId}/reply`,
        method: 'POST',
        data: { reply_text: replyText, admin_name: 'Admin' },
      });
      toast.success('Reply sent successfully!');
      setReplyingTo(null);
      setReplyText('');
      // Update local state
      setFeedbacks(prev => prev.map(f => f.id === feedbackId ? {
        ...f,
        admin_reply: replyText,
        reply_by: 'Admin',
        reply_date: new Date().toISOString(),
      } : f));
    } catch (e: any) {
      console.error('Failed to send reply:', e);
      toast.error(e?.data?.detail || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  }

  const filtered = feedbacks.filter(f => {
    if (filter === 'visible') return f.is_visible;
    if (filter === 'hidden') return !f.is_visible;
    return true;
  });

  const avgRating = feedbacks.length > 0
    ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
    : '0';

  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: feedbacks.filter(f => f.rating === r).length,
    percent: feedbacks.length > 0 ? (feedbacks.filter(f => f.rating === r).length / feedbacks.length) * 100 : 0,
  }));

  const repliedCount = feedbacks.filter(f => f.admin_reply).length;

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-white text-2xl font-bold">Customer Feedback</h1>
          <span className="text-gray-500 text-sm ml-auto">{feedbacks.length} reviews</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold text-yellow-400">{avgRating}</div>
              <div>
                <div className="flex gap-0.5 mb-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`w-4 h-4 ${s <= Math.round(Number(avgRating)) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
                  ))}
                </div>
                <p className="text-gray-400 text-sm">Average Rating</p>
              </div>
            </div>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="space-y-1.5">
              {ratingCounts.map(r => (
                <div key={r.rating} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 w-3">{r.rating}</span>
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${r.percent}%` }} />
                  </div>
                  <span className="text-gray-500 w-6 text-right">{r.count}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-400">{repliedCount}</div>
              <p className="text-gray-400 text-sm mt-1">Replied</p>
              <p className="text-gray-600 text-xs mt-0.5">out of {feedbacks.length} total</p>
            </div>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(['all', 'visible', 'hidden'] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className={`text-sm cursor-pointer ${filter === f ? 'bg-red-600 hover:bg-red-700 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}
              size="sm"
            >
              {f === 'all' ? 'All' : f === 'visible' ? 'Visible' : 'Hidden'} ({f === 'all' ? feedbacks.length : f === 'visible' ? feedbacks.filter(fb => fb.is_visible).length : feedbacks.filter(fb => !fb.is_visible).length})
            </Button>
          ))}
        </div>

        {/* Feedback List */}
        {filtered.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No feedback yet</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(fb => (
              <Card key={fb.id} className={`bg-gray-900 border-gray-800 p-4 ${!fb.is_visible ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-medium">{fb.customer_name}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`w-3.5 h-3.5 ${s <= fb.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
                        ))}
                      </div>
                      {fb.order_id > 0 && (
                        <span className="text-gray-500 text-xs">Order #{fb.order_id}</span>
                      )}
                      {fb.admin_reply && (
                        <Badge className="bg-cyan-600/20 text-cyan-400 border border-cyan-600/30 text-[10px]">
                          Replied ✓
                        </Badge>
                      )}
                    </div>
                    {fb.comment && <p className="text-gray-300 text-sm">{fb.comment}</p>}
                    
                    {/* Admin Reply Display */}
                    {fb.admin_reply && (
                      <div className="mt-2 pl-3 border-l-2 border-cyan-600/50">
                        <p className="text-cyan-300 text-sm">
                          <Reply className="w-3 h-3 inline mr-1" />
                          {fb.admin_reply}
                        </p>
                        <p className="text-gray-600 text-xs mt-0.5">
                          — {fb.reply_by} • {fb.reply_date ? new Date(fb.reply_date).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }) : ''}
                        </p>
                      </div>
                    )}

                    {/* Reply Form */}
                    {replyingTo === fb.id && (
                      <div className="mt-3 bg-gray-800 rounded-lg p-3 border border-cyan-600/30">
                        <Textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Write your reply to this customer..."
                          className="bg-gray-700 border-gray-600 text-white text-sm mb-2"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => sendReply(fb.id)}
                            disabled={sendingReply}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white cursor-pointer"
                          >
                            <Send className="w-3 h-3 mr-1" /> {sendingReply ? 'Sending...' : 'Send Reply'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyText(''); }} className="text-gray-400 cursor-pointer">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    <p className="text-gray-600 text-xs mt-2">
                      {new Date(fb.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {/* Reply button */}
                    {!fb.admin_reply && replyingTo !== fb.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setReplyingTo(fb.id); setReplyText(''); }}
                        className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
                        title="Reply to customer"
                      >
                        <Reply className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleVisibility(fb)}
                      className="text-gray-400 hover:text-white cursor-pointer"
                      title={fb.is_visible ? 'Hide from customers' : 'Show to customers'}
                    >
                      {fb.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteFeedback(fb.id)}
                      className="text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}