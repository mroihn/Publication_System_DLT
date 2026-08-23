"use client";

import { useEffect, useRef } from "react";
import { apiClient } from "@/core/services/api.client";
import { useToast } from "@/core/context/ToastContext";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsID {
  initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
  renderButton: (parent: HTMLElement, options: { theme: string; size: string; text: string }) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsID } };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

export function GoogleVerifyButton({ onVerified }: { onVerified: (email: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !containerRef.current) return;

    const handleCredential = (response: GoogleCredentialResponse) => {
      apiClient
        .patch<{ identityEmail: string }>("/users/identity-verify", { idToken: response.credential })
        .then((res) => onVerified(res.data.identityEmail))
        .catch((err: { response?: { data?: { message?: string } } }) =>
          addToast(err.response?.data?.message ?? "Identity verification failed.", "error")
        );
    };

    const render = () => {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
      });
    };

    if (window.google) {
      render();
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [addToast, onVerified]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return <p className="text-sm text-gray-500">Google verification is not configured.</p>;
  }

  return <div ref={containerRef} />;
}
