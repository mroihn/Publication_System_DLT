"use client";

import { useState } from 'react';
import { apiClient } from '@/core/services/api.client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/core/context/ToastContext';

const SPECIALITIES: { slug: string; label: string }[] = [
  { slug: 'ai', label: 'AI' },
  { slug: 'computer-security', label: 'Computer Security' },
  { slug: 'blockchain', label: 'Blockchain' },
  { slug: 'cloud-computing', label: 'Cloud Computing' },
  { slug: 'data-science', label: 'Data Science' },
];

export default function RegisterForm() {
  const router = useRouter();
  const { addToast } = useToast();
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [role, setRole] = useState<'user' | 'reviewer'>('user');
  const [specialities, setSpecialities] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggleSpeciality = (slug: string) => {
    setSpecialities((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }
    if (role === 'reviewer' && specialities.length === 0) {
      return setError('Please select at least one speciality');
    }
    try {
      await apiClient.post('/auth/register', {
        email: form.email,
        password: form.password,
        role,
        specialities: role === 'reviewer' ? specialities : [],
      });
      addToast('Registration successful! Please login.', 'success');
      router.push('/login');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-8 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="text-center mb-4">
          <h2 className="text-3xl font-extrabold text-gray-900">Register</h2>
          <p className="mt-2 text-sm text-gray-600">Join the decentralized publishing network</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}
        
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">I am registering as a</label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'user', title: 'Researcher', sub: 'Submit & publish manuscripts' },
              { value: 'reviewer', title: 'Reviewer', sub: 'Peer-review submissions' },
            ] as const).map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border-2 text-left transition-all ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className="text-sm font-semibold text-gray-900">{opt.title}</span>
                  <span className="text-xs text-gray-500">{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {role === 'reviewer' && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              Speciality <span className="text-gray-400 font-normal">(select one or more)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SPECIALITIES.map((s) => {
                const active = specialities.includes(s.slug);
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => toggleSpeciality(s.slug)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400'
                    }`}
                  >
                    {active ? '✓ ' : ''}{s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">Email Address</label>
          <input 
            id="email"
            type="email" 
            placeholder="name@university.edu" 
            required
            value={form.email} 
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="p-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
          <input 
            id="password"
            type="password" 
            placeholder="••••••••" 
            required
            value={form.password} 
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="p-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm Password</label>
          <input 
            id="confirmPassword"
            type="password" 
            placeholder="••••••••" 
            required
            value={form.confirmPassword} 
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            className="p-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
          />
        </div>

        <button 
          type="submit" 
          className="mt-2 w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          Create Account
        </button>
        
        <div className="text-center mt-4 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
