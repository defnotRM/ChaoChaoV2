'use client';

import React, { useEffect, useState } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { RenterDashboardView } from '@/components/dashboard/RenterDashboardView';
import { LenderDashboardView } from '@/components/dashboard/LenderDashboardView';

interface AuthUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  roles: string[];
}

export default function DashboardUserClient({
  targetUser,
}: {
  targetUser: AuthUser;
}) {
  const [currentUser, setCurrentUser] = useState<AuthUser>(targetUser);
  const [activeRole, setActiveRole] = useState<'renter' | 'lender'>(
    targetUser.role === 'lender' ? 'lender' : 'renter'
  );

  useEffect(() => {
    // Optionally check if logged in user is viewing this dashboard
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.user && data.user.id === targetUser.id) {
            setCurrentUser(data.user);
            setActiveRole(data.user.role === 'lender' ? 'lender' : 'renter');
          }
        }
      } catch (err) {
        console.error('Failed to load auth user in dashboard:', err);
      }
    }
    checkAuth();
  }, [targetUser]);

  const roles = currentUser.roles || (currentUser.role ? [currentUser.role] : ['renter']);
  const hasBothRoles =
    roles.includes('renter') &&
    (roles.includes('lender') || roles.includes('admin') || roles.length > 1);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* 1. Header with Active Login Role */}
        <DashboardHeader
          user={currentUser}
          activeRole={activeRole}
          onRoleSwitch={setActiveRole}
          hasBothRoles={hasBothRoles}
        />

        {/* 2. Render View for the exact selected role and target user */}
        {activeRole === 'lender' ? (
          <LenderDashboardView userId={currentUser.id} />
        ) : (
          <RenterDashboardView userId={currentUser.id} />
        )}
      </div>
    </div>
  );
}
