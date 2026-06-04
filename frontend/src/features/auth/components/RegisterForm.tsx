"use client";
import { useState } from 'react';
// import { apiClient } from '@/core/services/api.client';
import { useRouter } from 'next/navigation';

export default function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }
    try {
      // await apiClient.post('/auth/register', { email: form.email, password: form.password });
      alert('Registration successful! Please login.');
      router.push('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm mx-auto p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 shadow-sm">
      <h2 className="text-2xl font-bold">Register</h2>
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <input 
        type="email" placeholder="Email" required
        value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="p-2 border rounded text-black"
      />
      <input 
        type="password" placeholder="Password" required
        value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
        className="p-2 border rounded text-black"
      />
      <input 
        type="password" placeholder="Confirm Password" required
        value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
        className="p-2 border rounded text-black"
      />
      <button type="submit" className="bg-green-600 hover:bg-green-700 text-white p-2 rounded transition-colors">Register</button>
    </form>
  );
}
