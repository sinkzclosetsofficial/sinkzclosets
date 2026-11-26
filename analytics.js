/* =========================================================
   SINKZCLOSETS — FIRST-PARTY SHARED ANALYTICS
   Events are stored centrally in Supabase, not browser-only.
   ========================================================= */
(function () {
  "use strict";

  const SUPABASE_URL = "https://mpzkiatdejirrjidkdqi.supabase.co";
  const SUPABASE_KEY = "sb_publishable_9Lpund59NwZAcpZyiCdxPg_D8fohkXR";
  const QUEUE_KEY = "sinkz_analytics_pending_v2";
  const VISITOR_KEY = "sinkz_analytics_visitor_v2";
  const SESSION_KEY = "sinkz_analytics_session_v2";
  const MAX_QUEUE = 100;
  let client = null;

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  function storedId(storage, key) {
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = uuid();
        storage.setItem(key, value);
      }
      return value;
    } catch (_) {
      return uuid();
    }
  }

  const visitorId = storedId(localStorage, VISITOR_KEY);
  const sessionId = storedId(sessionStorage, SESSION_KEY);

  function getClient() {
    if (client) return client;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return null;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
  }

  function readQueue() {
    try {
      const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function saveQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
    } catch (_) {}
  }

  function pageType() {
    const path = location.pathname.toLowerCase();
    if (path === "/" || path.endsWith("/index.html")) return "Homepage";
    if (path.includes("shop")) return "Shop";
    if (path.includes("product")) return "Product";
    if (path.includes("cart")) return "Cart";
    if (path.includes("checkout")) return "Checkout";
    if (path.includes("about")) return "About";
    if (path.includes("privacy")) return "Privacy";
    if (path.includes("terms")) return "Terms";
    return "Other";
  }

  function deviceType() {
    const ua = navigator.userAgent || "";
    if (/ipad|tablet/i.test(ua)) return "Tablet";
    if (/mobile|android|iphone|ipod/i.test(ua)) return "Mobile";
    return "Desktop";
  }

  function browserType() {
    const ua = navigator.userAgent || "";
    if (ua.includes("Edg/")) return "Edge";
    if (ua.includes("Firefox/")) return "Firefox";
    if (ua.includes("SamsungBrowser/")) return "Samsung Internet";
    if (ua.includes("Chrome/")) return "Chrome";
    if (ua.includes("Safari/")) return "Safari";
    return "Other";
  }

  function trafficSource() {
    if (!document.referrer) return "Direct";
    try {
      const host = new URL(document.referrer).hostname.toLowerCase();
      if (host === location.hostname.toLowerCase()) return "Internal";
      if (host.includes("google.")) return "Google";
      if (host.includes("bing.")) return "Bing";
      if (host.includes("facebook.")) return "Facebook";
      if (host.includes("instagram.")) return "Instagram";
      if (host.includes("tiktok.")) return "TikTok";
      if (host.includes("whatsapp.")) return "WhatsApp";
      return host.replace(/^www\./, "").slice(0, 150);
    } catch (_) {
      return "Other";
    }
  }

  function clean(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  }

  async function send(row) {
    const db = getClient();
    if (!db) throw new Error("Supabase analytics client is unavailable.");
    const result = await db.from("analytics_events").insert(row);
    if (result.error) throw result.error;
  }

  async function flushQueue() {
    const queue = readQueue();
    if (!queue.length || !getClient()) return;
    const remaining = [];
    for (const row of queue) {
      try {
        await send(row);
      } catch (error) {
        remaining.push(row);
      }
    }
    saveQueue(remaining);
  }

  function track(name, details) {
    const allowed = ["page_view", "product_view", "add_to_cart", "checkout_visit"];
    const eventName = allowed.includes(name) ? name : "custom";
    const info = details && typeof details === "object" ? details : {};
    const row = {
      event_id: uuid(),
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      page_path: clean(location.pathname || "/", 500) || "/",
      page_type: pageType(),
      device: deviceType(),
      browser: clean(browserType(), 60),
      traffic_source: clean(trafficSource(), 150),
      product_id: clean(String(info.product_id || ""), 100) || null,
      product_name: clean(String(info.product_name || ""), 150) || null,
      category: clean(String(info.category || ""), 100) || null
    };

    send(row).catch(function (error) {
      const queue = readQueue();
      queue.push(row);
      saveQueue(queue);
      console.warn("SINKZCLOSETS analytics event queued:", error.message || error);
    });
  }

  function shouldTrackPage() {
    const path = location.pathname.toLowerCase();
    return !path.includes("admin.html") && !path.includes("analytics.html");
  }

  function trackPage() {
    if (!shouldTrackPage()) return;
    track("page_view");

    if (pageType() === "Checkout") track("checkout_visit");

    if (pageType() === "Product") {
      const name = document.getElementById("productName");
      const category = document.getElementById("productCategory");
      const id = new URLSearchParams(location.search).get("id") || "";
      let recorded = false;

      function recordProductView() {
        if (recorded || !name) return;
        const productName = clean(name.textContent, 150);
        if (!productName || productName === "Product not found") return;
        recorded = true;
        track("product_view", {
          product_id: id,
          product_name: productName,
          category: category ? clean(category.textContent, 100) : ""
        });
      }

      recordProductView();
      if (name && !recorded && window.MutationObserver) {
        const observer = new MutationObserver(function () {
          recordProductView();
          if (recorded) observer.disconnect();
        });
        observer.observe(name, { childList: true, characterData: true, subtree: true });
      }
    }
  }

  document.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest("button, a, [role='button'], [data-analytics-event]");
    if (!control) return;

    const custom = control.getAttribute("data-analytics-event");
    if (custom) track("custom", { category: clean(custom, 100) });

    const id = (control.id || "").toLowerCase();
    const classes = typeof control.className === "string" ? control.className.toLowerCase() : "";
    const label = (control.textContent || "").trim().toLowerCase();
    const addToCart = (id.includes("addtocart") || id.includes("addproducttocart")) || classes.includes("add-to-cart") ||
      label.includes("add to cart");
    if (addToCart) {
      track("add_to_cart", {
        product_id: control.getAttribute("data-product-id") || "",
        product_name: control.getAttribute("data-product-name") || ""
      });
    }
  }, true);

  window.SinkzAnalytics = {
    track: track,
    getVisitorId: function () { return visitorId; },
    getSessionId: function () { return sessionId; },
    flush: flushQueue,
    version: "2.0"
  };

  window.addEventListener("online", flushQueue);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      trackPage();
      flushQueue();
    }, { once: true });
  } else {
    trackPage();
    flushQueue();
  }
})();
