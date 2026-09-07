import { backendRequest } from './api';

export type CustomerReward = {
  id: number;
  tier: 'normal' | 'golden' | string;
  type: 'percent' | 'fixed' | 'free_ice_cream' | 'golden_free_item' | string;
  value: number;
  max_discount: number;
  minimum_order: number;
  title: string;
  status: string;
  expires_at: string | null;
  source_order_id: number;
};

export type RewardsPayload = {
  enabled: boolean;
  available: CustomerReward[];
  history: CustomerReward[];
  gold_progress: number;
  gold_required: number;
  gold_order_min: number;
  gold_window_days: number;
  normal_order_min: number;
};

export async function getRewardsStatus(): Promise<boolean> {
  const response = await backendRequest('/api/v1/rewards/status', 'GET');
  return response?.data?.enabled === true;
}

export async function getAdminRewardSettings(): Promise<{ enabled: boolean }> {
  const response = await backendRequest('/api/v1/rewards/admin/settings', 'GET');
  return { enabled: response?.data?.enabled === true };
}

export async function updateAdminRewardSettings(enabled: boolean): Promise<{ enabled: boolean }> {
  const response = await backendRequest('/api/v1/rewards/admin/settings', 'PUT', { enabled });
  return { enabled: response?.data?.enabled === true };
}

export async function getMyRewards(): Promise<RewardsPayload> {
  const response = await backendRequest('/api/v1/rewards/me', 'GET');
  return response.data as RewardsPayload;
}

export function rewardDiscountForCart(
  reward: CustomerReward | null,
  subtotal: number,
  cart: Array<any>,
): number {
  if (!reward || subtotal < Number(reward.minimum_order || 0)) return 0;

  const cap = Math.max(0, Number(reward.max_discount || 0));
  let amount = 0;

  if (reward.type === 'fixed') {
    amount = Number(reward.value || 0);
  } else if (reward.type === 'percent') {
    amount = subtotal * Number(reward.value || 0) / 100;
  } else if (reward.type === 'free_ice_cream') {
    const prices = cart
      .filter((item: any) =>
        !item?.isDeal &&
        String(item?.menuItem?.name || '').toLowerCase().includes('ice cream') &&
        Number(item?.totalPrice || 0) / Math.max(1, Number(item?.quantity || 1)) <= 5.01
      )
      .map((item: any) => Number(item?.totalPrice || 0) / Math.max(1, Number(item?.quantity || 1)));
    amount = prices.length ? Math.min(...prices) : 0;
  } else if (reward.type === 'golden_free_item') {
    const blocked = ['acai', 'smoothie', 'bottle', 'box'];
    const prices = cart
      .filter((item: any) => {
        const name = String(item?.menuItem?.name || '').toLowerCase();
        const unit = Number(item?.totalPrice || 0) / Math.max(1, Number(item?.quantity || 1));
        return !item?.isDeal && unit <= 15.01 && !blocked.some(word => name.includes(word));
      })
      .map((item: any) => Number(item?.totalPrice || 0) / Math.max(1, Number(item?.quantity || 1)));
    amount = prices.length ? Math.max(...prices) : 0;
  }

  if (cap > 0) amount = Math.min(amount, cap);
  return Math.max(0, Math.min(subtotal, amount));
}
