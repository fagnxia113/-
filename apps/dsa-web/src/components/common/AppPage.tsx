import type React from 'react';
import { cn } from '../../utils/cn';

interface AppPageProps {
  children: React.ReactNode;
  className?: string;
}

export const AppPage: React.FC<AppPageProps> = ({ children, className = '' }) => {
  return (
    <main className={cn('min-h-full w-full px-3 pb-4 pt-3 md:px-4 lg:px-5', className)}>
      {children}
    </main>
  );
};
