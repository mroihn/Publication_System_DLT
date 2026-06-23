"use client";

import { useAuth } from '@/core/context/AuthContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/core/services/api.client';
import { useToast } from '@/core/context/ToastContext';

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  interface EthereumProvider {
    request: (args: { method: string }) => Promise<string[]>;
  }
  type WindowWithEthereum = Window & { ethereum?: EthereumProvider };

  const handleConnectAndLink = async () => {
    setError(null);
    try {
      setIsLinking(true);

      const ethereum = (window as WindowWithEthereum).ethereum;
      if (typeof window === 'undefined' || !ethereum) {
        throw new Error('MetaMask is not installed. Please install it to proceed.');
      }

      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      if (!walletAddress) {
        throw new Error('No account selected in MetaMask.');
      }

      await apiClient.patch('/users/wallet-bind', { walletAddress });

      addToast(`MetaMask Wallet ${walletAddress.slice(0,6)}... successfully bound to your account!`, 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      console.error(err);
      const e = err as { code?: number; response?: { data?: { message?: string } }; message?: string };
      if (e.code === 4001) {
        setError('You rejected the connection request in MetaMask.');
      } else {
        setError(e.response?.data?.message || e.message || 'An unknown error occurred.');
      }
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full p-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Security Profile</h1>
        <p className="text-gray-600 text-lg">Manage your account credentials and decentralized identity.</p>
      </div>
      
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        
        <div className="mb-6">
          <label className="text-sm font-medium text-gray-500 uppercase tracking-wider">Email Address</label>
          <p className="text-xl font-semibold text-gray-900 mt-1">{user?.email}</p>
        </div>
        
        <div className="mb-8">
          <label className="text-sm font-medium text-gray-500 uppercase tracking-wider">Bound Ethereum Wallet</label>
          <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-lg font-mono text-gray-800 break-all">
              {user?.walletAddress || 'No wallet linked'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg shadow-sm">
            {error}
          </div>
        )}

        {!user?.walletAddress && (
          <button
            onClick={handleConnectAndLink}
            disabled={isLinking}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            {isLinking ? 'Binding MetaMask...' : 'Connect & Bind MetaMask'}
          </button>
        )}
      </div>
    </div>
  );
}
