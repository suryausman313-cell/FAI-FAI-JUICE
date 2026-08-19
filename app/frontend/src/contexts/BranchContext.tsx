import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backendRequest } from '@/lib/api';

export type Branch = {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  is_default: boolean;
  delivery_enabled?: boolean | null;
  delivery_schedule_enabled?: boolean | null;
  delivery_start_time?: string | null;
  delivery_end_time?: string | null;
  estimated_delivery_time?: string | null;
  restaurant_status?: 'open' | 'busy' | 'closed' | string | null;
  has_kitchen_pin?: boolean;
};

type BranchContextValue = {
  branches: Branch[];
  selectedBranch: Branch | null;
  loading: boolean;
  needsChoice: boolean;
  chooseBranch: (branch: Branch, manual?: boolean) => void;
  useNearestBranch: () => void;
};

const STORAGE_KEY = 'fai_fai_selected_branch_id';
const MANUAL_KEY = 'fai_fai_selected_branch_manual';

const BranchContext = createContext<BranchContextValue>({
  branches: [],
  selectedBranch: null,
  loading: true,
  needsChoice: false,
  chooseBranch: () => undefined,
  useNearestBranch: () => undefined,
});

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsChoice, setNeedsChoice] = useState(false);

  const chooseBranch = useCallback((branch: Branch, manual = true) => {
    localStorage.setItem(STORAGE_KEY, String(branch.id));
    if (manual) localStorage.setItem(MANUAL_KEY, 'true');
    else localStorage.removeItem(MANUAL_KEY);
    setSelectedBranch(branch);
    setNeedsChoice(false);
    window.dispatchEvent(new CustomEvent('fai-fai-branch-changed', { detail: branch }));
  }, []);

  const selectNearestFromPosition = useCallback((list: Branch[], latitude: number, longitude: number) => {
    if (!list.length) return;
    const openBranches = list.filter((branch) => String(branch.restaurant_status || 'open').toLowerCase() !== 'closed');
    const candidates = openBranches.length > 0 ? openBranches : list;
    const nearest = [...candidates].sort(
      (a, b) => distanceKm(latitude, longitude, a.latitude, a.longitude) - distanceKm(latitude, longitude, b.latitude, b.longitude),
    )[0];
    chooseBranch(nearest, false);
  }, [chooseBranch]);

  const useNearestBranch = useCallback(() => {
    if (!branches.length) return;
    if (!navigator.geolocation) {
      setNeedsChoice(branches.length > 1);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => selectNearestFromPosition(branches, position.coords.latitude, position.coords.longitude),
      () => setNeedsChoice(branches.length > 1),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  }, [branches, selectNearestFromPosition]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await backendRequest('/api/v1/entities/branches', 'GET', undefined, { active_only: true });
        const list = (Array.isArray(response.data?.items) ? response.data.items : [])
          .map((item: any) => ({
            ...item,
            id: Number(item.id),
            latitude: Number(item.latitude),
            longitude: Number(item.longitude),
          }))
          .filter((item: Branch) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
        if (!alive) return;
        setBranches(list);

        if (list.length === 0) {
          setSelectedBranch(null);
          setNeedsChoice(false);
          return;
        }
        if (list.length === 1) {
          chooseBranch(list[0], false);
          return;
        }

        const savedId = Number(localStorage.getItem(STORAGE_KEY) || 0);
        const saved = list.find((item: Branch) => item.id === savedId);
        const wasManual = localStorage.getItem(MANUAL_KEY) === 'true';
        const customerPath = !/^\/(admin|kitchen|rider|track)(\/|$)/i.test(window.location.pathname);
        if (!customerPath) {
          setSelectedBranch(saved || list.find((item: Branch) => item.is_default) || list[0]);
          setNeedsChoice(false);
          return;
        }
        if (saved && wasManual) {
          setSelectedBranch(saved);
          setNeedsChoice(false);
          return;
        }

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => selectNearestFromPosition(list, position.coords.latitude, position.coords.longitude),
            () => {
              const fallback = saved || list.find((item: Branch) => item.is_default) || list[0];
              setSelectedBranch(fallback);
              setNeedsChoice(true);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
          );
        } else {
          setSelectedBranch(saved || list.find((item: Branch) => item.is_default) || list[0]);
          setNeedsChoice(true);
        }
      } catch {
        // Safe fallback: if branch API is temporarily unavailable, the existing
        // single-shop customer app continues exactly as before.
        if (!alive) return;
        setBranches([]);
        setSelectedBranch(null);
        setNeedsChoice(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [chooseBranch, selectNearestFromPosition]);

  const value = useMemo(() => ({ branches, selectedBranch, loading, needsChoice, chooseBranch, useNearestBranch }), [branches, selectedBranch, loading, needsChoice, chooseBranch, useNearestBranch]);
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  return useContext(BranchContext);
}
