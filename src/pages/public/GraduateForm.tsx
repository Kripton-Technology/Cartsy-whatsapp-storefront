import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GraduationCap, Check, Copy, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

interface CohortInfo {
  id: string;
  name: string;
  year: number;
  graduation_date?: string | null;
  institution_name: string;
  institution_logo?: string | null;
}

interface IntakeResult {
  success: boolean;
  already_registered?: boolean;
  code: string;
  graduate_name: string;
  expires_at: string;
  cohort_name: string;
  institution_name: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function GraduateForm() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const [cohort, setCohort] = useState<CohortInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [course, setCourse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!cohortId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/public/cohorts/${encodeURIComponent(cohortId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Form not found');
        setCohort(data);
      })
      .catch((err) => setLoadError(err.message || 'Unable to load form'))
      .finally(() => setLoading(false));
  }, [cohortId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cohortId) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/public/cohorts/${encodeURIComponent(cohortId)}/graduate-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, course }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setResult(data);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!result?.code) return;
    navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-600 font-semibold text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          Loading graduate form…
        </div>
      </div>
    );
  }

  if (loadError || !cohort) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Form Unavailable</h1>
          <p className="text-sm text-slate-500">{loadError || 'This cohort intake link is invalid or expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3.5 pb-5 border-b border-slate-100">
            {cohort.institution_logo ? (
              <img
                src={cohort.institution_logo}
                alt={cohort.institution_name}
                className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
            )}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Sponsored Store Access
              </p>
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">
                {cohort.institution_name}
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {cohort.name} · Class of {cohort.year}
              </p>
            </div>
          </div>

          {result ? (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-3">
                <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    {result.already_registered ? 'Your Graduation Code' : 'Registration Complete!'}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Hi <span className="font-semibold text-slate-800">{result.graduate_name}</span>, use this code when setting up your Cartsy store to unlock your sponsored graduation package.
                  </p>
                </div>

                <div className="bg-white border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-base font-black text-slate-900 tracking-wider select-all">
                    {result.code}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <Link
                to="/admin/onboarding"
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                Create My Store Now <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kofi Mensah"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Phone / WhatsApp Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0244123456"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. kofi@email.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Course / Program
                </label>
                <input
                  type="text"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="e.g. Fashion & Design"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !name.trim() || !phone.trim()}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Generating Your Code…' : 'Get My Graduation Code'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          Powered by <span className="font-bold text-slate-600">Cartsy</span>
        </p>
      </div>
    </div>
  );
}
