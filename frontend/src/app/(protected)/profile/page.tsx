"use client";

import { useAuth } from '@/core/context/AuthContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/core/services/api.client';

export default function ProfilePage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Basic redirect if not authenticated
    // Note: In a robust setup this might wait for an `isLoading` flag first
    if (!isAuthenticated && !localStorage.getItem('token')) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleConnectAndLink = async () => {
    setError(null);
    try {
      setIsLinking(true);

      // 1. Interrogate window.ethereum defensively
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        throw new Error('MetaMask is not installed. Please install it to proceed.');
      }

      // 2. Request account prompt securely
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      if (!walletAddress) {
        throw new Error('No account selected in MetaMask.');
      }

      // 3. Dispatch to authorized backend route via JWT
      await apiClient.patch('/users/wallet-bind', { walletAddress });
      
      alert(`MetaMask Wallet ${walletAddress} successfully bound to your account!`);
      window.location.reload(); // Refresh session state
    } catch (err: any) {
      console.error(err);
      if (err.code === 4001) {
        setError('You rejected the connection request in MetaMask.');
      } else {
        setError(err.response?.data?.message || err.message || 'An unknown error occurred.');
      }
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Security Profile</h1>
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200">
        
        <div className="mb-4">
          <label className="text-sm font-medium text-slate-500">Email Address</label>
          <p className="text-lg font-semibold">{user?.email}</p>
        </div>
        
        <div className="mb-8">
          <label className="text-sm font-medium text-slate-500">Bound Ethereum Wallet</label>
          <p className="text-lg font-mono">
            {user?.walletAddress || 'No wallet linked'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 text-sm text-red-800 bg-red-100 rounded-lg">
            {error}
          </div>
        )}

        {!user?.walletAddress && (
          <button
            onClick={handleConnectAndLink}
            disabled={isLinking}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isLinking ? 'Binding MetaMask...' : 'Connect & Bind MetaMask'}
          </button>
        )}
      </div>
    </div>
  );
}
