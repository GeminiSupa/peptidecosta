"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const subscriber_id = searchParams.get('s');
  
  const [status, setStatus] = useState('loading'); // loading, success, error

  useEffect(() => {
    if (subscriber_id) {
      processUnsubscribe(subscriber_id);
    } else {
      setStatus('error');
    }
  }, [subscriber_id]);

  const processUnsubscribe = async (id) => {
    try {
      const { error } = await supabase
        .from('email_subscribers')
        .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setStatus('success');
    } catch (err) {
      console.error('Unsubscribe error:', err);
      setStatus('error');
    }
  };

  return (
    <>
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4 animate-in fade-in">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/50">
            <Loader2 className="animate-spin" size={32} />
          </div>
          <h1 className="text-xl font-bold text-white">Processing your request...</h1>
          <p className="text-white/60">Please wait while we update your preferences.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-500">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">You've been unsubscribed</h1>
          <p className="text-white/60">We're sorry to see you go. You will no longer receive marketing emails from us.</p>
          
          <Link 
            href="/"
            className="mt-6 px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white font-medium transition-colors"
          >
            Return to Website
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-500">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
            <AlertCircle size={32} />
          </div>
          <h1 className="text-xl font-bold text-white">Something went wrong</h1>
          <p className="text-white/60">We couldn't process your request. The link may be invalid or expired.</p>
          
          <Link 
            href="/contact"
            className="mt-6 px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white font-medium transition-colors"
          >
            Contact Support
          </Link>
        </div>
      )}
    </>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none"></div>
        <Suspense fallback={
          <div className="flex flex-col items-center gap-4 animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/50">
              <Loader2 className="animate-spin" size={32} />
            </div>
            <h1 className="text-xl font-bold text-white">Loading...</h1>
          </div>
        }>
          <UnsubscribeContent />
        </Suspense>
      </div>
    </div>
  );
}
