"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/core/context/AuthContext';
import { apiClient } from '@/core/services/api.client';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      login(data.accessToken, data.user);
      router.push('/profile');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm mx-auto p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 shadow-sm">
      <h2 className="text-2xl font-bold">Sign In</h2>
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <input 
        type="email" 
        placeholder="Email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)}
        className="p-2 border rounded text-black"
        required
      />
      <input 
        type="password" 
        placeholder="Password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)}
        className="p-2 border rounded text-black"
        required
      />
      <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded transition-colors">Login</button>
      <div className="text-center mt-2">
        <Link href="/register" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          Don't have an account? Register
        </Link>
      </div>
    </form>
  );
}
