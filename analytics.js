
/* =========================================================
   SINKZCLOSETS — FIRST-PARTY WEBSITE ANALYTICS
   Version: 1.0
   Storage: Browser localStorage (temporary, pre-Supabase)
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "sinkz_analytics_events_v1";
  const VISITOR_KEY = "sinkz_analytics_visitor_v1";
  const SESSION_KEY = "sinkz_analytics_session_v1";
  const MAX_EVENTS = 5000;

  // ---------------------------------------------------------
  // 1. SAFE STORAGE
  // ---------------------------------------------------------

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Sinkz Analytics: Storage unavailable.", error);
      return false;
    }
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }

  function getStoredId(key) {
    try {
      let id = localStorage.getItem(key);

      if (!id) {
        id = createId();
        localStorage.setItem(key, id);
      }

      return id;
    } catch (error) {
      return createId();
    }
  }

  const visitorId = getStoredId(VISITOR_KEY);

  function getSessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);

      if (!id) {
        id = createId();
        sessionStorage.setItem(SESSION_KEY, id);
      }

      return id;
    } catch (error) {
      return createId();
    }
  }

  const sessionId = getSessionId();

  // ---------------------------------------------------------
  // 2. DEVICE INFORMATION
  // ---------------------------------------------------------

  function getDeviceType() {
    const ua = navigator.userAgent || "";

    if (/tablet|ipad/i.test(ua)) {
      return "Tablet";
    }

    if (/mobile|android|iphone|ipod/i.test(ua)) {
      return "Mobile";
    }

    return "Desktop";
  }

  function getBrowserType() {
    const ua = navigator.userAgent || "";

    if (ua.includes("Edg/")) return "Edge";
    if (ua.includes("Firefox/")) return "Firefox";
    if (ua.includes("SamsungBrowser/")) return "Samsung Internet";
    if (ua.includes("Chrome/")) return "Chrome";
    if (ua.includes("Safari/")) return "Safari";

    return "Other";
  }

  // ---------------------------------------------------------
  // 3. PAGE INFORMATION
  // ---------------------------------------------------------

  function getPageType() {
    const path = window.location.pathname.toLowerCase();

    if (path.endsWith("index.html") || path.endsWith("/")) {
      return "Homepage";
    }

    if (path.includes("shop")) return "Shop";
    if (path.includes("product")) return "Product";
    if (path.includes("cart")) return "Cart";
    if (path.includes("checkout")) return "Checkout";
    if (path.includes("about")) return "About";
    if (path.includes("contact")) return "Contact";
    if (path.includes("privacy")) return "Privacy";
    if (path.includes("terms")) return "Terms";

    return "Other";
  }

  function getPagePath() {
    // Do not record query strings or URL fragments.
    return window.location.pathname || "/";
  }

  function getTrafficSource() {
    const referrer = document.referrer;

    if (!referrer) {
      return "Direct";
    }

    try {
      const sourceHost = new URL(referrer).hostname;
      const currentHost = window.location.hostname;

      if (sourceHost === currentHost) {
        return "Internal";
      }

      if (/google\./i.test(sourceHost)) return "Google";
      if (/bing\./i.test(sourceHost)) return "Bing";
      if (/facebook\./i.test(sourceHost)) return "Facebook";
      if (/instagram\./i.test(sourceHost)) return "Instagram";
      if (/tiktok\./i.test(sourceHost)) return "TikTok";
      if (/whatsapp\./i.test(sourceHost)) return "WhatsApp";

      return sourceHost.replace(/^www\./, "");
    } catch (error) {
      return "Other";
    }
  }

  // ---------------------------------------------------------
  // 4. EVENT STORAGE
  // ---------------------------------------------------------

  function getEvents() {
    const events = readStorage(STORAGE_KEY, []);
    return Array.isArray(events) ? events : [];
  }

  function track(eventName, details) {
    if (!eventName || typeof eventName !== "string") {
      return;
    }

    const safeDetails = details && typeof details === "object"
      ? details
      : {};

    const event = {
      id: createId(),
      event: eventName,
      timestamp: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      page: getPagePath(),
      page_type: getPageType(),
      device: getDeviceType(),
      browser: getBrowserType(),
      source: getTrafficSource()
    };

    // Only accept selected, non-sensitive event details.
    if (typeof safeDetails.product_id === "string" ||
        typeof safeDetails.product_id === "number") {
      event.product_id = String(safeDetails.product_id).slice(0, 100);
    }

    if (typeof safeDetails.product_name === "string") {
      event.product_name = safeDetails.product_name.slice(0, 150);
    }

    if (typeof safeDetails.category === "string") {
      event.category = safeDetails.category.slice(0, 100);
    }

    const events = getEvents();
    events.push(event);

    // Keep storage within a reasonable limit.
    const trimmedEvents = events.slice(-MAX_EVENTS);

    writeStorage(STORAGE_KEY, trimmedEvents);

    window.dispatchEvent(
      new CustomEvent("sinkz:analytics-event", {
        detail: { event: eventName }
      })
    );
  }

  // ---------------------------------------------------------
  // 5. PAGE VIEW TRACKING
  // ---------------------------------------------------------

  function shouldIgnorePage() {
    const path = getPagePath().toLowerCase();

    return (
      path.includes("analytics.html") ||
      path.includes("admin.html") ||
      path.includes("/admin/")
    );
  }

  function trackPageView() {
    if (shouldIgnorePage()) return;

    track("page_view");

    // Track product views when product details are available.
    const productNameElement = document.getElementById("productName");
    const productId = new URLSearchParams(
      window.location.search
    ).get("id");

    if (productNameElement) {
      const productName = productNameElement.textContent.trim();

      if (productName && productName !== "Product not found") {
        const categoryElement = document.getElementById("productCategory");

        track("product_view", {
          product_id: productId || "",
          product_name: productName,
          category: categoryElement
            ? categoryElement.textContent.trim()
            : ""
        });
      }
    }
  }

  // ---------------------------------------------------------
  // 6. SHOPPING ACTIVITY TRACKING
  // ---------------------------------------------------------

  document.addEventListener("click", function (event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const button = target.closest(
      "button, a, [role='button'], [data-analytics-event]"
    );

    if (!button) return;

    // Custom event labels can be added to HTML elements.
    const customEvent = button.getAttribute("data-analytics-event");

    if (customEvent) {
      track(customEvent);
    }

    const buttonText = (
      button.textContent || ""
    ).trim().toLowerCase();

    const elementId = (button.id || "").toLowerCase();
    const elementClass = (
      typeof button.className === "string"
        ? button.className
        : ""
    ).toLowerCase();

    const isAddToCart =
      elementId.includes("addtocart") ||
      elementClass.includes("add-to-cart") ||
      buttonText.includes("add to cart");

    if (isAddToCart) {
      const productId =
        button.getAttribute("data-product-id") || "";

      const productName =
        button.getAttribute("data-product-name") || "";

      track("add_to_cart", {
        product_id: productId,
        product_name: productName
      });
    }

    const link = button.closest("a");
    const href = link ? link.getAttribute("href") : "";

    if (
      href &&
      /checkout\.html/i.test(href)
    ) {
      track("checkout_visit");
    }
  });

  // ---------------------------------------------------------
  // 7. CUSTOM EVENTS
  // ---------------------------------------------------------

  window.addEventListener("sinkz:analytics", function (event) {
    if (!event.detail || !event.detail.name) return;

    track(event.detail.name, event.detail.data || {});
  });

  // ---------------------------------------------------------
  // 8. PUBLIC ANALYTICS API
  // ---------------------------------------------------------

  window.SinkzAnalytics = {
    track: track,

    getEvents: getEvents,

    getVisitorId: function () {
      return visitorId;
    },

    getSessionId: function () {
      return sessionId;
    },

    getDeviceType: getDeviceType,

    version: "1.0"
  };

  // ---------------------------------------------------------
  // 9. START TRACKING
  // ---------------------------------------------------------

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", trackPageView);
  } else {
    trackPageView();
  }

})();
