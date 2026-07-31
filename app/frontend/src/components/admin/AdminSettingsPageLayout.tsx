import { ReactNode, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { isAdminLoggedIn } from '@/lib/admin-settings-store';

interface AdminSettingsPageLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backTo?: string;
  maxWidth?: string;
}

export default function AdminSettingsPageLayout({
  title,
  subtitle,
  children,
  backTo = '/admin/settings',
  maxWidth = 'max-w-4xl',
}: AdminSettingsPageLayoutProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className={`${maxWidth} mx-auto`}>
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(backTo)}
            className="text-gray-400 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div>
            <h1 className="text-white text-2xl font-bold">{title}</h1>
            {subtitle && (
              <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
