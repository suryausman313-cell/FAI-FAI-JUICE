import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, UtensilsCrossed, ShoppingCart, ClipboardList, UserRound, MapPin, Navigation, X } from 'lucide-react';
import { getCartItemCount, getCart } from '@/lib/cart-store';
import { useTranslation } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/LanguagePicker';
import FaiFaiWordmark from '@/components/FaiFaiWordmark';
import { useBranch } from '@/contexts/BranchContext';

interface CustomerLayoutProps {
  children: ReactNode;
}

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const [cartCount, setCartCount] = useState(0);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const { branches, selectedBranch, loading: branchLoading, needsChoice, chooseBranch, useNearestBranch } = useBranch();

  useEffect(() => {
    const updateCount = () => setCartCount(getCartItemCount(getCart()));
    updateCount();
    
    // Listen for storage events to update cart count
    window.addEventListener('storage', updateCount);
    // Custom event for same-tab updates
    window.addEventListener('cart-updated', updateCount);
    return () => {
      window.removeEventListener('storage', updateCount);
      window.removeEventListener('cart-updated', updateCount);
    };
  }, [location]);

  const navItems = [
    { path: '/', icon: Home, label: t('nav.home') },
    { path: '/menu', icon: UtensilsCrossed, label: t('nav.menu') },
    { path: '/cart', icon: ShoppingCart, label: t('nav.cart'), badge: cartCount },
    { path: '/my-orders', icon: ClipboardList, label: t('nav.orders') },
    { path: '/account?manage=1', activePath: '/account', icon: UserRound, label: t('nav.account') },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black border-b border-red-900/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-green-700 flex items-center justify-center">
              <span className="text-white font-bold text-sm">FF</span>
            </div>
            <FaiFaiWordmark compact className="text-xl" />
          </Link>
          <div className="flex items-center gap-2">
            {branches.length > 0 && selectedBranch && (
              <button
                type="button"
                onClick={() => setBranchPickerOpen(true)}
                className="hidden sm:flex max-w-[210px] items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-white"
                title="Change branch"
              >
                <MapPin className="h-3.5 w-3.5 text-red-500" />
                <span className="truncate">{selectedBranch.name}</span>
              </button>
            )}
            <LanguageSwitcher />
          </div>

        </div>
        {branches.length > 0 && selectedBranch && (
          <button type="button" onClick={() => setBranchPickerOpen(true)} className="sm:hidden flex w-full items-center justify-center gap-1 border-t border-gray-900 py-1.5 text-[11px] text-gray-300">
            <MapPin className="h-3 w-3 text-red-500" /> {selectedBranch.name}
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-red-900/30">
        <div className="max-w-7xl mx-auto flex items-center justify-around py-2">
          {navItems.map(({ path, activePath, icon: Icon, label, badge }) => {
            const isActive = location.pathname === (activePath || path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors relative cursor-pointer ${
                  isActive ? 'text-red-500' : 'text-gray-400 hover:text-white'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {badge && badge > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {(branchPickerOpen || (!branchLoading && needsChoice && branches.length > 1)) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">Choose Fai Fai branch</h2>
                <p className="mt-1 text-xs text-gray-400">Use your location for the nearest branch, or choose manually.</p>
              </div>
              {selectedBranch && <button type="button" onClick={() => setBranchPickerOpen(false)} className="rounded-full p-2 text-gray-400"><X className="h-5 w-5" /></button>}
            </div>
            <button type="button" onClick={() => { useNearestBranch(); setBranchPickerOpen(false); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 font-semibold text-white">
              <Navigation className="h-4 w-4" /> Use nearest branch
            </button>
            <div className="mt-3 space-y-2">
              {branches.map((branch) => (
                <button key={branch.id} type="button" onClick={() => { chooseBranch(branch, true); setBranchPickerOpen(false); }} className={`w-full rounded-2xl border px-4 py-3 text-left ${selectedBranch?.id === branch.id ? 'border-red-500 bg-red-950/30' : 'border-gray-800 bg-gray-900'}`}>
                  <div className="font-semibold text-white">{branch.name}</div>
                  {branch.address && <div className="mt-1 text-xs text-gray-400">{branch.address}</div>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
