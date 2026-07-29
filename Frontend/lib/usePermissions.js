'use client';

import { useEffect, useState } from 'react';
import { apiGet } from './api';

export default function usePermissions() {
  const [me, setMe] = useState(null); // null = loading

  useEffect(() => {
    apiGet('/auth/me')
      .then((data) => setMe(data))
      .catch(() => setMe({ permissions: [], is_system: false }));
  }, []);

  // System roles (Super Admin) bypass all permission checks
  const can = (code) => {
    if (!me) return false;
    if (me.is_system) return true;
    return Array.isArray(me.permissions) && me.permissions.includes(code);
  };

  return { me, permissions: me?.permissions ?? [], can, loading: me === null };
}
