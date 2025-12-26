"use client";

import { useEffect, useRef } from "react";

interface TurnstileWidgetProps {
  onSuccess: () => void;
  onError?: () => void;
}

// TODO: Reemplazar con tu Site Key de Cloudflare Turnstile
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

/**
 * Cloudflare Turnstile widget for pre-clearance.
 * Once user passes, CF issues cf_clearance cookie.
 *
 * Setup:
 * 1. Go to Cloudflare Dashboard → Turnstile
 * 2. Create widget with Pre-Clearance enabled
 * 3. Add NEXT_PUBLIC_TURNSTILE_SITE_KEY to .env
 */
export default function TurnstileWidget({ onSuccess, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip in development or if no site key
    if (process.env.NODE_ENV !== "production" || !TURNSTILE_SITE_KEY) {
      onSuccess(); // Auto-pass in dev
      return;
    }

    // Load Turnstile script if not loaded
    if (!document.getElementById("cf-turnstile-script")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      script.onload = () => renderWidget();
    } else {
      renderWidget();
    }

    function renderWidget() {
      if (!containerRef.current || !window.turnstile) return;

      // Clear any existing widget
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: () => {
          console.log("[Turnstile] Challenge passed");
          onSuccess();
        },
        "error-callback": () => {
          console.error("[Turnstile] Challenge failed");
          onError?.();
        },
        theme: "light",
        size: "invisible", // or "normal" for visible widget
      });
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [onSuccess, onError]);

  // Don't render in dev or without key
  if (process.env.NODE_ENV !== "production" || !TURNSTILE_SITE_KEY) {
    return null;
  }

  return <div ref={containerRef} />;
}

// TypeScript declarations for Turnstile
declare global {
  interface Window {
    turnstile: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "invisible";
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}
