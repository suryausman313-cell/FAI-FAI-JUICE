import { ReactNode } from 'react';
import { useCustomerHeartbeat } from '@/hooks/useCustomerHeartbeat';

export function CustomerHeartbeatProvider({ children }: { children: ReactNode }) {
  useCustomerHeartbeat();
  return <>{children}</>;
}