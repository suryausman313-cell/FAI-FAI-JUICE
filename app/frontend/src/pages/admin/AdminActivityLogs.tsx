import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Trash2, MessageSquare, Edit, Settings, ShoppingBag, Users, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { client } from '@/lib/api';

interface ActivityLog {
  id: number;
  action_type: string;
  entity_type: string;
  entity_id: string;
  details: string;
  admin_name: string;
  created_at: string;
}

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'order_status_change', label: 'Order Status Changes' },
  { value: 'order_delete', label: 'Order Deletions' },
  { value: 'feedback_reply', label: 'Feedback Replies' },
  { value: 'staff_note', label: 'Staff Notes' },
  { value: 'settings_change', label: 'Settings Changes' },
  { value: 'menu_change', label: 'Menu Changes' },
  { value: 'customer_block', label: 'Customer Blocks' },
];

function getActionIcon(actionType: string) {
  switch (actionType) {
    case 'order_delete': return <Trash2 className="w-4 h-4 text-red-400" />;
    case 'order_status_change': return <ShoppingBag className="w-4 h-4 text-blue-400" />;
    case 'feedback_reply': return <MessageSquare className="w-4 h-4 text-cyan-400" />;
    case 'staff_note': return <Edit className="w-4 h-4 text-yellow-400" />;
    case 'settings_change': return <Settings className="w-4 h-4 text-purple-400" />;
    case 'menu_change': return <Edit className="w-4 h-4 text-green-400" />;
    case 'customer_block': return <Users className="w-4 h-4 text-orange-400" />;
    default: return <Activity className="w-4 h-4 text-gray-400" />;
  }
}

function getActionColor(actionType: string) {
  switch (actionType) {
    case 'order_delete': return 'bg-red-600';
    case 'order_status_change': return 'bg-blue-600';
    case 'feedback_reply': return 'bg-cyan-600';
    case 'staff_note': return 'bg-yellow-600';
    case 'settings_change': return 'bg-purple-600';
    case 'menu_change': return 'bg-green-600';
    case 'customer_block': return 'bg-orange-600';
    default: return 'bg-gray-600';
  }
}

function getActionLabel(actionType: string) {
  switch (actionType) {
    case 'order_delete': return 'Deleted Order';
    case 'order_status_change': return 'Status Change';
    case 'feedback_reply': return 'Replied to Feedback';
    case 'staff_note': return 'Added Staff Note';
    case 'settings_change': return 'Changed Settings';
    case 'menu_change': return 'Menu Update';
    case 'customer_block': return 'Customer Block';
    default: return actionType.replace(/_/g, ' ');
  }
}

function parseDetails(details: string): Record<string, any> {
  try {
    return JSON.parse(details);
  } catch {
    return { raw: details };
  }
}

export default function AdminActivityLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    loadLogs();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [filter]);

  async function loadLogs() {
    try {
      setRefreshing(true);
      const params: any = { limit: 100 };
      if (filter && filter !== 'all') params.action_type = filter;

      const res = await client.apiCall.invoke({
        url: '/api/v1/admin/activity-logs',
        method: 'GET',
        data: params,
      });
      setLogs(res?.data?.items || []);
    } catch (e) {
      console.error('Failed to load activity logs:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">Activity Logs</h1>
            <p className="text-gray-500 text-xs mt-0.5">Track all admin actions and changes</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadLogs()}
            disabled={refreshing}
            className="border-gray-700 text-gray-300 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filter */}
        <div className="mb-6">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[220px] bg-gray-900 border-gray-700 text-white">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              {ACTION_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Logs List */}
        {logs.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No activity logs yet</p>
            <p className="text-gray-600 text-sm mt-1">Actions will be recorded here as admins use the panel</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {logs.map(log => {
              const details = parseDetails(log.details);
              return (
                <Card key={log.id} className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {getActionIcon(log.action_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${getActionColor(log.action_type)} text-white text-[10px]`}>
                          {getActionLabel(log.action_type)}
                        </Badge>
                        {log.entity_id && (
                          <span className="text-gray-500 text-xs">
                            {log.entity_type} #{log.entity_id}
                          </span>
                        )}
                      </div>
                      {/* Details */}
                      <div className="mt-1.5">
                        {log.action_type === 'order_delete' && details.customer_name && (
                          <p className="text-gray-300 text-sm">
                            Deleted order from <span className="text-white font-medium">{details.customer_name}</span>
                            {details.total_amount && <span className="text-red-400 ml-1">AED {details.total_amount}</span>}
                          </p>
                        )}
                        {log.action_type === 'feedback_reply' && details.reply_text && (
                          <p className="text-gray-300 text-sm">
                            Replied to <span className="text-white font-medium">{details.customer_name}</span>: "{details.reply_text}"
                          </p>
                        )}
                        {log.action_type === 'staff_note' && details.note && (
                          <p className="text-gray-300 text-sm">
                            Note: "{details.note}"
                          </p>
                        )}
                        {log.action_type === 'customer_block' && details.customer_name && (
                          <p className="text-gray-300 text-sm">
                            {details.action === 'unblock' ? 'Unblocked' : 'Blocked'} customer: <span className="text-white font-medium">{details.customer_name}</span>
                          </p>
                        )}
                        {!['order_delete', 'feedback_reply', 'staff_note', 'customer_block'].includes(log.action_type) && log.details && (
                          <p className="text-gray-400 text-xs truncate">{log.details}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-gray-600 text-xs">
                          by {log.admin_name}
                        </span>
                        <span className="text-gray-600 text-xs">
                          {new Date(log.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}