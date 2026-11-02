'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle2, AlertCircle, RefreshCw, Smartphone } from 'lucide-react';

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: any;
  }
}

export function MetaEmbeddedSignupButton() {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);

  useEffect(() => {
    // Carregar o SDK oficial do Facebook se ainda não estiver presente
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);

      window.fbAsyncInit = function () {
        if (window.FB) {
          window.FB.init({
            appId: process.env.NEXT_PUBLIC_META_APP_ID || '',
            autoLogAppEvents: true,
            xfbml: true,
            version: 'v21.0',
          });
        }
      };
    }
  }, []);

  const handleConnectWhatsApp = () => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;

    if (!window.FB) {
      alert('SDK do Facebook ainda está inicializando ou bloqueado pelo navegador. Recarregue a página e tente novamente.');
      return;
    }

    if (!appId) {
      alert('NEXT_PUBLIC_META_APP_ID não configurado no ambiente da Vercel.');
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      window.FB.login(
        function (response: any) {
          if (response.authResponse && response.authResponse.code) {
            fetch('/api/tenants/whatsapp/onboarding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: response.authResponse.code }),
            })
              .then((res) => res.json())
              .then((data) => {
                setLoading(false);
                if (data.success) {
                  setConnectedNumber(data.displayPhoneNumber || 'Conectado');
                  setStatusMsg({
                    type: 'success',
                    text: `WhatsApp conectado com sucesso! Número: ${data.displayPhoneNumber}`,
                  });
                } else {
                  setStatusMsg({
                    type: 'error',
                    text: data.error || data.details || 'Falha ao processar autorização da Meta.',
                  });
                }
              })
              .catch((err) => {
                setLoading(false);
                setStatusMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
              });
          } else {
            setLoading(false);
            console.log('Login cancelado ou não autorizado pelo usuário');
          }
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            feature: 'whatsapp_embedded_signup',
            version: 2,
          },
        }
      );
    } catch (err: any) {
      setLoading(false);
      alert(`Erro ao abrir janela da Meta: ${err.message}`);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-2xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
              Conexão Automatizada WhatsApp (Meta Embedded Signup)
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                Oficial
              </span>
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Conecte a conta comercial oficial (WABA) da clínica sem intervenção manual ou criação de tokens temporários.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleConnectWhatsApp}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <MessageSquare className="w-4 h-4" />
          )}
          <span>{connectedNumber ? 'Reconectar WhatsApp' : 'Conectar com Facebook'}</span>
        </button>
      </div>

      {statusMsg && (
        <div
          className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              : 'bg-rose-100 text-rose-900 border border-rose-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}
    </div>
  );
}
