'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';

const PALETTE = ['#6366F1','#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];
const avatarBg  = (name) => PALETTE[(name?.charCodeAt(0) ?? 0) % PALETTE.length];
const initials  = (name) => {
  if (!name) return '?';
  const p = name.trim().split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase();
};

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start py-3 border-b border-gray-100 last:border-0">
      <span className="w-40 shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wider pt-0.5">
        {label}
      </span>
      <span className="text-sm text-gray-800 font-medium">{children}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse p-4 max-w-2xl">
      <div className="h-5 w-40 bg-gray-200 rounded" />
      <div className="bg-white rounded-lg border border-gray-200 p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gray-200 shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-28 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
        {[1,2,3,4,5].map((i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  useAuth();
  const { me, can }   = usePermissions();
  const params        = useParams();
  const router        = useRouter();
  const userId        = parseInt(params.id);

  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    apiGet(`/users/${userId}`)
      .then(setUser)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Skeleton />;

  if (error || !user) return (
    <div className="py-20 text-center">
      <p className="text-sm text-gray-500 mb-3">{error || 'User not found'}</p>
      <button onClick={() => router.back()} className="btn-secondary text-xs">← Go back</button>
    </div>
  );

  const canEdit = me?.is_system || can('USER_EDIT');

  return (
    <div className="space-y-4 p-4 pb-8 max-w-2xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/dashboard/users" className="hover:text-gray-800 transition">Users</Link>
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
        </svg>
        <span className="text-gray-800 font-medium">{user.name}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
            style={{ backgroundColor: avatarBg(user.name) }}>
            {initials(user.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-lg font-bold text-gray-900">{user.name}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                user.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}/>
                {user.status}
              </span>
              {user.is_verified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--ams-primary-mid)', color: 'var(--ams-primary)' }}>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  Verified
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--ams-primary)' }}>{user.role?.name}</p>
          </div>

          {canEdit && (
            <button
              onClick={() => router.push(`/dashboard/users?edit=${user.id}`)}
              className="btn-secondary text-xs shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Account details */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Details</h3>
        </div>
        <div className="px-5">
          <DetailRow label="Full Name">{user.name}</DetailRow>
          <DetailRow label="Email">{user.email}</DetailRow>
          <DetailRow label="Phone">{user.phone || <span className="text-gray-300">—</span>}</DetailRow>
          <DetailRow label="Role">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
              {user.role?.name}
            </span>
          </DetailRow>
          <DetailRow label="Department">
            {user.department?.name || <span className="text-gray-300">—</span>}
          </DetailRow>
          <DetailRow label="Designation">
            {user.designation || <span className="text-gray-300">—</span>}
          </DetailRow>
          <DetailRow label="Status">
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${
              user.status === 'ACTIVE' ? 'text-green-700' : 'text-red-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}/>
              {user.status}
            </span>
          </DetailRow>
          <DetailRow label="Verified">
            {user.is_verified
              ? <span className="text-xs font-medium" style={{ color: 'var(--ams-primary)' }}>Yes</span>
              : <span className="text-xs text-gray-400">No</span>}
          </DetailRow>
          <DetailRow label="Member Since">
            {new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </DetailRow>
        </div>
      </div>

    </div>
  );
}
