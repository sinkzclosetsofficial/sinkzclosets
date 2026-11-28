
/* =========================================================
   SINKZCLOSETS ADMIN DASHBOARD
   Supabase-connected administration
   Corrected image previews and uploads
   ========================================================= */

"use strict";

/* =========================================================
   01. SUPABASE CONFIGURATION
   ========================================================= */

const SUPABASE_URL =
  "https://mpzkiatdejirrjidkdqi.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_9Lpund59NwZAcpZyiCdxPg_D8fohkXR";

const STORAGE_BUCKET = "sinkzclosets-products";



// Match the Supabase bucket's 10 MB per-file upload limit.
// There is no artificial per-product image-count limit.
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

const IMAGE_EXTENSION_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};


/* =========================================================
   02. INITIALISE APPLICATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  if (!window.supabase || !window.supabase.createClient) {
    alert(
      "Supabase could not load. Check your internet connection and reload the dashboard."
    );
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  const $ = id => document.getElementById(id);

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);

  const setText = (id, value) => {
    const element = $(id);

    if (element) {
      element.textContent = String(value ?? "");
    }
  };

  const setValue = (id, value) => {
    const element = $(id);

    if (element) {
      element.value = value ?? "";
    }
  };

  function showMessage(id, message, type = "info") {
    const element = $(id);

    if (!element) return;

    element.textContent = message;
    element.className = "form-message";

    if (type === "success") {
      element.classList.add("success");
    }

    if (type === "error") {
      element.classList.add("error");
    }
  }

  function formatMoney(amount, currency = "ZMW") {
    const number = Number(amount || 0);

    try {
      return new Intl.NumberFormat("en-ZM", {
        style: "currency",
        currency,
        minimumFractionDigits: 2
      }).format(number);
    } catch {
      return `${currency} ${number.toFixed(2)}`;
    }
  }

  function makeId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function safeImageURL(url) {
    if (typeof url !== "string" || !url.trim()) {
      return "";
    }

    try {
      const parsed = new URL(url);

      if (
        parsed.protocol === "https:" ||
        parsed.protocol === "http:"
      ) {
        return parsed.href;
      }
    } catch {
      return "";
    }

    return "";
  }

  function normaliseProductImages(product) {
    let images = [];

    if (Array.isArray(product?.images)) {
      images = product.images;
    } else if (
      typeof product?.images === "string" &&
      product.images.trim()
    ) {
      try {
        const parsed = JSON.parse(product.images);

        images = Array.isArray(parsed)
          ? parsed
          : [product.images];

      } catch {
        images = [product.images];
      }
    }

    const cleaned = images
      .map(safeImageURL)
      .filter(Boolean);

    const mainImage = safeImageURL(product?.image);

    if (mainImage && !cleaned.includes(mainImage)) {
      cleaned.unshift(mainImage);
    }

    return [...new Set(cleaned)];
  }

  // Remove only images owned by this Supabase bucket and no longer
  // referenced by any product. Database records are always updated/deleted
  // first, so a failed Storage cleanup cannot undo a successful catalogue save.
  function getProductImageStoragePath(url) {
    const safeURL = safeImageURL(url);

    if (!safeURL) return null;

    try {
      const parsed = new URL(safeURL);
      const projectOrigin = new URL(SUPABASE_URL).origin;
      const prefix =
        `/storage/v1/object/public/${STORAGE_BUCKET}/`;

      if (
        parsed.origin !== projectOrigin ||
        !parsed.pathname.startsWith(prefix)
      ) {
        return null;
      }

      const encodedPath = parsed.pathname.slice(prefix.length);
      const path = encodedPath
        .split("/")
        .map(segment => decodeURIComponent(segment))
        .join("/");

      if (
        !path ||
        path.split("/").some(segment =>
          !segment || segment === "." || segment === ".."
        )
      ) {
        return null;
      }

      return path;

    } catch {
      return null;
    }
  }

  async function removeUnreferencedProductImages(candidateURLs) {
    const candidates = [...new Set(
      (candidateURLs || [])
        .map(safeImageURL)
        .filter(Boolean)
    )];

    if (!candidates.length) return;

    const { data, error } = await db
      .from("products")
      .select("id, image, images");

    if (error) {
      console.warn(
        "Product images were retained because references could not be checked:",
        error
      );
      return;
    }

    const referencedURLs = new Set();

    (data || []).forEach(product => {
      normaliseProductImages(product).forEach(url => {
        referencedURLs.add(url);
      });
    });

    const paths = candidates
      .filter(url => !referencedURLs.has(url))
      .map(getProductImageStoragePath)
      .filter(Boolean);

    if (!paths.length) return;

    const { error: storageError } = await db.storage
      .from(STORAGE_BUCKET)
      .remove([...new Set(paths)]);

    if (storageError) {
      console.warn(
        "Unused product images could not be removed from Storage:",
        storageError
      );
    }
  }


  /* =======================================================
     03. DOM REFERENCES AND APPLICATION STATE
     ======================================================= */

  const loginScreen = $("adminLogin");
  const dashboard = $("adminDashboard");
  const loginForm = $("adminLoginForm");
  const loginEmail = $("adminEmail");
  const loginPassword = $("adminPassword");

  let currentUser = null;
  let products = [];
  let categories = [];

  let currentProductImages = [];
  let selectedImageFiles = [];

  // Register image selection handling early in dashboard startup.
  // Delegation at document level also catches Android gallery input events
  // even if the product form is re-rendered later.
  function handleProductImageSelection(event) {
    const input = event.target;

    if (!input || input.id !== "adminProductImages") return;

    const files = Array.from(input.files || []);

    if (!files.length) return;

    let added = 0;
    const rejected = [];

    for (const file of files) {
      const contentType = getSupportedImageType(file);
      const extension = getImageExtension(file, contentType);

      if (!contentType || !extension) {
        rejected.push(
          `${file.name || "Selected file"}: unsupported format. Use JPG, JPEG, PNG or WEBP.`
        );
        continue;
      }

      if (!file.size) {
        rejected.push(`${file.name}: file is empty.`);
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        rejected.push(`${file.name}: larger than 10 MB.`);
        continue;
      }

      const duplicate = selectedImageFiles.some(item =>
        item.file.name === file.name &&
        item.file.size === file.size &&
        item.file.lastModified === file.lastModified
      );

      if (duplicate) continue;

      let previewURL;

      try {
        previewURL = URL.createObjectURL(file);
      } catch (error) {
        console.error("Could not create product image preview:", error);
        rejected.push(`${file.name}: browser could not create a preview.`);
        continue;
      }

      selectedImageFiles.push({
        file,
        contentType,
        extension,
        preview: previewURL
      });

      added++;
    }

    // Always refresh the preview after processing the picker selection.
    renderImagePreviews();

    if (added > 0) {
      showMessage(
        "imageUploadMessage",
        `${added} image(s) selected. Preview them below, then save the product to upload.`,
        "success"
      );
    } else if (rejected.length) {
      showMessage(
        "imageUploadMessage",
        "No new images were accepted. " + rejected.join(" "),
        "error"
      );
    } else {
      showMessage(
        "imageUploadMessage",
        "Those images are already selected.",
        "info"
      );
    }

    // File objects are retained in selectedImageFiles; clearing the native
    // picker permits selecting the same file again without losing previews.
    input.value = "";
  }

  document.addEventListener(
    "change",
    handleProductImageSelection,
    true
  );


  let isSavingProduct = false;
  let dashboardLoadInProgress = false;


  /* =======================================================
     04. LOGIN AND ADMINISTRATOR VERIFICATION
     ======================================================= */

  function showLogin() {
    if (dashboard) dashboard.hidden = true;
    if (loginScreen) loginScreen.hidden = false;
  }

  function showDashboard() {
    if (loginScreen) loginScreen.hidden = true;
    if (dashboard) dashboard.hidden = false;

    setText(
      "adminIdentity",
      currentUser?.email || "Administrator"
    );
    setText("currentAdminEmail", currentUser?.email || "Not signed in");

    loadDashboardData();
  }

  async function verifyAdministrator(user) {
    if (!user?.id) {
      return false;
    }

    const { data, error } = await db
      .from("admin_users")
      .select("user_id, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("Administrator verification error:", error);

      throw new Error(
        "Could not verify administrator access. Please try again."
      );
    }

    return Boolean(data && data.is_active);
  }

  async function establishAdminSession(user) {
    const allowed = await verifyAdministrator(user);

    if (!allowed) {
      await db.auth.signOut();

      currentUser = null;
      showLogin();

      throw new Error(
        "This account is not authorised to access the SINKZCLOSETS dashboard."
      );
    }

    currentUser = user;
    showDashboard();
  }

  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const enteredEmail = loginEmail?.value.trim();
    const password = loginPassword?.value;

    if (!enteredEmail || !password) {
      showMessage(
        "loginMessage",
        "Enter your administrator email address and password.",
        "error"
      );

      return;
    }

    const submitButton = loginForm.querySelector(
      'button[type="submit"]'
    );

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Signing in...";
    }

    showMessage("loginMessage", "Checking your account...");

    try {
      const email = String(enteredEmail || "").trim().toLowerCase();

      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await establishAdminSession(data.user);

      loginForm.reset();

      showMessage("loginMessage", "");

    } catch (error) {
      console.error("Login error:", error);

      showMessage(
        "loginMessage",
        error.message || "Sign-in failed. Please try again.",
        "error"
      );

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Enter dashboard";
      }
    }
  });


  $("forgotAdminPassword")?.addEventListener("click", async () => {
    const email = String(loginEmail?.value || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage(
        "loginMessage",
        "Enter your administrator email address first, then select Forgot password.",
        "error"
      );
      loginEmail?.focus();
      return;
    }

    const button = $("forgotAdminPassword");
    if (button) {
      button.disabled = true;
      button.textContent = "Sending recovery email...";
    }

    try {
      const recoveryURL = new URL(window.location.href);
      recoveryURL.search = "?password-recovery=1";
      recoveryURL.hash = "";

      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryURL.toString()
      });

      if (error) throw error;

      showMessage(
        "loginMessage",
        "If this address belongs to an account, Supabase will send a password-reset email. Check your inbox and spam folder.",
        "success"
      );
    } catch (error) {
      console.error("Password recovery request error:", error);
      showMessage(
        "loginMessage",
        error.message || "The password-reset request could not be sent. Please try again.",
        "error"
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Forgot password?";
      }
    }
  });

  $("passwordRecoveryForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const password = String($("recoveryNewPassword")?.value || "");
    const confirmation = String($("recoveryConfirmPassword")?.value || "");

    if (password.length < 8) {
      showMessage(
        "passwordRecoveryMessage",
        "Use a password with at least 8 characters.",
        "error"
      );
      return;
    }

    if (password !== confirmation) {
      showMessage(
        "passwordRecoveryMessage",
        "The two passwords do not match.",
        "error"
      );
      return;
    }

    const button = $("saveRecoveryPassword");
    if (button) {
      button.disabled = true;
      button.textContent = "Updating password...";
    }

    try {
      const { error } = await db.auth.updateUser({ password });
      if (error) throw error;

      $("passwordRecoveryForm")?.reset();
      showMessage(
        "passwordRecoveryMessage",
        "Password updated successfully. You can now sign in with your new password.",
        "success"
      );

      await db.auth.signOut();

      if (loginForm) loginForm.hidden = false;
      const recoveryPanel = $("passwordRecoveryPanel");
      if (recoveryPanel) recoveryPanel.hidden = true;

      const cleanURL = new URL(window.location.href);
      cleanURL.searchParams.delete("password-recovery");
      cleanURL.hash = "";
      window.history.replaceState({}, document.title, cleanURL.toString());

      showMessage(
        "loginMessage",
        "Your password has been changed. Sign in using your new password.",
        "success"
      );
    } catch (error) {
      console.error("Password update error:", error);
      showMessage(
        "passwordRecoveryMessage",
        error.message || "The password could not be updated. Request a new recovery email and try again.",
        "error"
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Update password";
      }
    }
  });

  /* =======================================================
     05. PASSWORD VISIBILITY
     ======================================================= */

  $("toggleAdminPassword")?.addEventListener("click", () => {
    if (!loginPassword) return;

    const visible = loginPassword.type === "text";

    loginPassword.type = visible ? "password" : "text";

    const button = $("toggleAdminPassword");

    if (button) {
      button.textContent = visible
        ? "Show password"
        : "Hide password";

      button.setAttribute(
        "aria-pressed",
        String(!visible)
      );
    }
  });


  /* =======================================================
     06. SESSION RESTORATION
     ======================================================= */

  async function restoreSession() {
    // A recovery link establishes a temporary recovery session. Do not let
    // normal dashboard session restoration race the PASSWORD_RECOVERY event
    // and hide the password form before the user can set a new password.
    const recoveryQuery = new URLSearchParams(window.location.search);
    const recoveryHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryRequested =
      recoveryQuery.get("password-recovery") === "1" ||
      recoveryHash.get("type") === "recovery";

    if (recoveryRequested) {
      showLogin();
      return;
    }

    try {
      const {
        data: { session },
        error
      } = await db.auth.getSession();

      if (error) throw error;

      if (!session?.user) {
        showLogin();
        return;
      }

      const {
        data: { user },
        error: userError
      } = await db.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        showLogin();
        return;
      }

      await establishAdminSession(user);

    } catch (error) {
      console.error("Session restoration error:", error);

      currentUser = null;
      showLogin();

      showMessage(
        "loginMessage",
        error.message || "Please sign in again.",
        "error"
      );
    }
  }

  // Keep this listener synchronous. Supabase warns against running
  // additional Supabase requests inside an auth-state callback because
  // doing so can block the auth lock during sign-in.
  //
  // The login form verifies newly signed-in users explicitly, while
  // restoreSession() verifies an existing session during page startup.
  db.auth.onAuthStateChange(event => {

    if (event === "SIGNED_OUT") {
      currentUser = null;
      showLogin();
    }

    if (event === "PASSWORD_RECOVERY") {
      if (loginForm) loginForm.hidden = true;
      const recoveryPanel = $("passwordRecoveryPanel");
      if (recoveryPanel) recoveryPanel.hidden = false;
      showLogin();
      showMessage(
        "passwordRecoveryMessage",
        "Recovery link verified. Enter and confirm your new password.",
        "success"
      );
    }

  });


  /* =======================================================
     07. LOGOUT
     ======================================================= */

  $("adminLogout")?.addEventListener("click", async () => {

    const button = $("adminLogout");

    if (button) {
      button.disabled = true;
    }

    try {
      const { error } = await db.auth.signOut();

      if (error) throw error;

      currentUser = null;
      showLogin();

    } catch (error) {
      alert("Could not log out: " + error.message);

    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  });


  /* =======================================================
     08. DASHBOARD NAVIGATION
     ======================================================= */

  const sidebar = $("adminSidebar");
  const overlay = $("sidebarOverlay");
  const menuToggle = $("adminMenuToggle");

  const sectionTitles = {
    overviewSection: "Overview",
    analyticsSection: "Analytics",
    productsSection: "Products",
    categoriesSection: "Categories",
    inventorySection: "Inventory",
    ordersSection: "Orders",
    paymentsSection: "Payments",
    discountsSection: "Discounts",
    customersSection: "Customers",
    reviewsSection: "Reviews",
    announcementsSection: "Announcements",
    contactPaymentsSection: "Contact & Payment Management",
    storefrontSection: "Storefront",
    settingsSection: "Settings",
    securitySection: "Cyber Threat Monitoring"
  };

  function closeSidebar() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("visible");

    menuToggle?.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function openSidebar() {
    sidebar?.classList.add("open");
    overlay?.classList.add("visible");

    menuToggle?.setAttribute(
      "aria-expanded",
      "true"
    );
  }

  function activateSection(sectionId) {
    const target = $(sectionId);

    if (!target) return;

    document.querySelectorAll(".admin-section").forEach(section => {
      const active = section.id === sectionId;

      section.hidden = !active;
      section.classList.toggle("active", active);
    });

    document.querySelectorAll(".admin-nav-item").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.section === sectionId
      );
    });

    setText(
      "currentPageTitle",
      sectionTitles[sectionId] || "Dashboard"
    );

    closeSidebar();

    if (sectionId === "productsSection") loadProducts();

    if (sectionId === "categoriesSection") loadCategories();

    if (sectionId === "inventorySection") renderInventory();

    if (sectionId === "analyticsSection") {
      loadAnalytics();
    }

    if (sectionId === "discountsSection") loadDiscountCampaigns();
    if (sectionId === "contactPaymentsSection") loadBusinessContactPayments();

    if (
      sectionId === "ordersSection" ||
      sectionId === "paymentsSection" ||
      sectionId === "customersSection"
    ) {
      showMessage(
        "orderMessage",
        "The corresponding live database module has not yet been connected."
      );
    }
  }

  document.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
      activateSection(button.dataset.section);
    });
  });

  document.querySelectorAll("[data-go-section]").forEach(button => {
    button.addEventListener("click", () => {
      activateSection(button.dataset.goSection);
    });
  });

  menuToggle?.addEventListener("click", () => {
    if (sidebar?.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  overlay?.addEventListener("click", closeSidebar);


  /* =======================================================
     09. LOAD PRODUCTS
     ======================================================= */

  async function loadProducts() {
    const host = $("adminProductsList");

    if (host) {
      host.innerHTML =
        '<p class="empty-message">Loading products...</p>';
    }

    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Product loading error:", error);

      if (host) {
        host.textContent =
          "Products could not be loaded. Check your database permissions.";
      }

      return;
    }

    products = data || [];

    renderProducts();
    renderProductCategoryOptions();
    refreshOverview();
    renderInventory();
  }


  /* =======================================================
     10. RENDER PRODUCTS
     ======================================================= */

  function renderProducts() {
    const host = $("adminProductsList");

    if (!host) return;

    if (!products.length) {
      host.innerHTML =
        '<p class="empty-message">No products have been added yet.</p>';

      return;
    }

    host.innerHTML = `
      <div class="section-heading">
        <div>
          <h3>Product catalogue</h3>
          <span>${products.length} product(s) in Supabase</span>
        </div>
      </div>

      <div class="product-list">

        ${products.map(product => {

          const images = normaliseProductImages(product);
          const image = images[0] || "";

          return `
            <article class="product-item">

              ${
                image
                  ? `<img
                       src="${escapeHTML(image)}"
                       alt="${escapeHTML(product.name)}"
                       loading="lazy">`
                  : `<div class="product-image-placeholder">
                       No image
                     </div>`
              }

              <div class="product-item-info">

                <h3>${escapeHTML(product.name)}</h3>

                <p>
                  ${escapeHTML(product.category)}
                  · ${formatMoney(product.price, "ZMW")}
                </p>

                <p>
                  Stock: ${Number(product.stock || 0)}
                  · Status: ${escapeHTML(product.status || "—")}
                </p>

                ${
                  product.price_zar !== null &&
                  product.price_zar !== undefined &&
                  product.price_zar !== ""
                    ? `<p>${formatMoney(product.price_zar, "ZAR")}</p>`
                    : ""
                }

                ${
                  images.length > 1
                    ? `<p>${images.length} product images</p>`
                    : ""
                }

              </div>

              <div class="product-item-actions">

                <button
                  type="button"
                  data-edit-product="${escapeHTML(product.id)}">
                  Edit
                </button>

                <button
                  type="button"
                  data-delete-product="${escapeHTML(product.id)}">
                  Delete
                </button>

              </div>

            </article>
          `;

        }).join("")}

      </div>
    `;

    // Replace a broken product image with a clear placeholder.
    host.querySelectorAll(".product-item img").forEach(imageElement => {
      imageElement.addEventListener("error", () => {
        const placeholder = document.createElement("div");

        placeholder.className = "product-image-placeholder";
        placeholder.textContent = "Image unavailable";

        imageElement.replaceWith(placeholder);
      }, { once: true });
    });
  }


  /* =======================================================
     11. PRODUCT CATEGORY OPTIONS
     ======================================================= */

  function renderProductCategoryOptions() {
    const select = $("adminProductCategory");

    if (!select) return;

    const previousValue = select.value;

    select.innerHTML =
      '<option value="">Choose category</option>';

    categories
      .filter(category => category.status === "active")
      .forEach(category => {

        const option = document.createElement("option");

        option.value = category.name;
        option.textContent = category.name;

        select.appendChild(option);
      });

    if (
      previousValue &&
      [...select.options].some(option => option.value === previousValue)
    ) {
      select.value = previousValue;
    }
  }


  /* =======================================================
     12. PRODUCT IMAGE PREVIEW
     ======================================================= */

  function revokeTemporaryPreviews() {
    selectedImageFiles.forEach(item => {
      if (item.preview) {
        URL.revokeObjectURL(item.preview);
      }
    });
  }

  function resetProductImages() {
    revokeTemporaryPreviews();

    currentProductImages = [];
    selectedImageFiles = [];

    const input = $("adminProductImages");

    if (input) {
      input.value = "";
    }

    renderImagePreviews();

    showMessage("imageUploadMessage", "");
  }

  function renderImagePreviews() {
    const host = $("productImagePreview");

    if (!host) {
      console.error(
        'The image preview container "#productImagePreview" is missing.'
      );

      showMessage(
        "imageUploadMessage",
        "The image preview area is missing from the page. Check admin.html.",
        "error"
      );

      return;
    }

    host.replaceChildren();

    currentProductImages.forEach((url, index) => {

      const card = document.createElement("div");
      card.className = "image-preview-item";

      const image = document.createElement("img");
      image.src = url;
      image.alt = `Saved product image ${index + 1}`;

      image.onerror = () => {
        image.style.opacity = "0.4";
        image.alt = "Saved image could not be loaded";
      };

      const name = document.createElement("span");
      name.className = "image-preview-name";
      name.textContent = `Saved image ${index + 1}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute(
        "aria-label",
        `Remove saved image ${index + 1}`
      );

      remove.addEventListener("click", () => {
        currentProductImages.splice(index, 1);
        renderImagePreviews();
      });

      if (index === 0) {
        const label = document.createElement("span");

        label.className = "primary-image-label";
        label.textContent = "Main image";

        card.appendChild(label);
      }

      card.append(image, name, remove);
      host.appendChild(card);
    });

    selectedImageFiles.forEach((item, index) => {

      const card = document.createElement("div");
      card.className = "image-preview-item";

      const image = document.createElement("img");
      image.src = item.preview;
      image.alt = item.file.name;

      image.onerror = () => {
        image.style.opacity = "0.4";
        image.alt = "Preview could not be displayed";
      };

      const name = document.createElement("span");
      name.className = "image-preview-name";
      name.textContent = item.file.name;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";

      remove.setAttribute(
        "aria-label",
        `Remove selected image ${item.file.name}`
      );

      remove.addEventListener("click", () => {
        URL.revokeObjectURL(item.preview);

        selectedImageFiles.splice(index, 1);

        renderImagePreviews();

        showMessage(
          "imageUploadMessage",
          `${selectedImageFiles.length} new image(s) remain selected.`,
          "info"
        );
      });

      card.append(image, name, remove);
      host.appendChild(card);
    });
  }


  /* =======================================================
     13. IMAGE SELECTION
     ANDROID MIME-TYPE COMPATIBILITY
     ======================================================= */

  function getSupportedImageType(file) {
    // Prefer the browser's MIME type. Android gallery providers
    // sometimes give files extensionless names or a generic filename.
    let mimeType = String(file?.type || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (mimeType === "image/jpg") {
      mimeType = "image/jpeg";
    }

    if (Object.values(ALLOWED_IMAGE_TYPES).includes(mimeType)) {
      return mimeType;
    }

    // Fall back to the extension when Android reports an empty or
    // generic MIME type such as application/octet-stream.
    const filename = String(file?.name || "");
    const extension = filename.includes(".")
      ? filename.split(".").pop().toLowerCase()
      : "";

    return ALLOWED_IMAGE_TYPES[extension] || null;
  }

  function getImageExtension(file, contentType) {
    const filename = String(file?.name || "");
    const extension = filename.includes(".")
      ? filename.split(".").pop().toLowerCase()
      : "";

    if (ALLOWED_IMAGE_TYPES[extension] === contentType) {
      return extension;
    }

    return IMAGE_EXTENSION_BY_TYPE[contentType] || null;
  }




  /* =======================================================
     14. UPLOAD IMAGES TO SUPABASE STORAGE
     ======================================================= */

  function describeSupabaseError(error) {
    if (!error) return "Unknown upload error.";

    const parts = [];

    if (error.message) parts.push(error.message);
    if (error.error && error.error !== error.message) parts.push(String(error.error));
    if (error.statusCode) parts.push("HTTP " + error.statusCode);
    if (error.status) parts.push("Status " + error.status);
    if (error.code) parts.push("Code " + error.code);

    return parts.length ? [...new Set(parts)].join(" | ") : String(error);
  }

  async function uploadProductImages() {
    const uploadedPaths = [];
    const uploadedURLs = [];

    if (!selectedImageFiles.length) {
      return { uploadedPaths, uploadedURLs };
    }

    try {
      // An expired or missing session is a common cause of Storage RLS failures.
      const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

      if (sessionError) {
        throw new Error(
          "Could not verify your admin session before uploading: " +
          describeSupabaseError(sessionError)
        );
      }

      if (!sessionData?.session?.user?.id) {
        throw new Error(
          "Your admin session has expired. Sign in again, then retry the image upload."
        );
      }

      for (let index = 0; index < selectedImageFiles.length; index++) {
        const item = selectedImageFiles[index];
        const file = item.file;

        const contentType =
          item.contentType || getSupportedImageType(file);

        const extension =
          item.extension || getImageExtension(file, contentType);

        if (!contentType || !extension) {
          throw new Error(
            'Unsupported image format for "' + file.name +
            '". Use JPG, JPEG, PNG or WEBP.'
          );
        }

        if (!file.size || file.size > MAX_IMAGE_SIZE) {
          throw new Error(
            '"' + file.name + '" must be larger than 0 bytes and no larger than 10 MB.'
          );
        }

        const path = `products/${makeId()}.${extension}`;

        showMessage(
          "imageUploadMessage",
          `Uploading image ${index + 1} of ${selectedImageFiles.length}: ${file.name}`,
          "info"
        );

        const { data: uploadData, error: uploadError } = await db.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType
          });

        if (uploadError) {
          throw new Error(
            'Upload failed for "' + file.name + '": ' +
            describeSupabaseError(uploadError) +
            ". Check that this signed-in administrator has active upload permission " +
            "for the " + STORAGE_BUCKET + " bucket."
          );
        }

        const savedPath = uploadData?.path || path;
        uploadedPaths.push(savedPath);

        const { data: publicData } = db.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(savedPath);

        const publicURL = safeImageURL(publicData?.publicUrl);

        if (!publicURL) {
          throw new Error(
            'The file "' + file.name +
            '" uploaded, but Supabase did not return a valid public URL.'
          );
        }

        uploadedURLs.push(publicURL);
      }

      showMessage(
        "imageUploadMessage",
        `${uploadedURLs.length} image(s) uploaded. Saving product details...`,
        "success"
      );

      return { uploadedPaths, uploadedURLs };

    } catch (error) {
      // Remove only objects created by this incomplete upload attempt.
      await removeUploadedFiles(uploadedPaths);
      throw error;
    }
  }

  async function removeUploadedFiles(paths) {

    if (!Array.isArray(paths) || !paths.length) {
      return;
    }

    const { error } = await db.storage
      .from(STORAGE_BUCKET)
      .remove(paths);

    if (error) {
      console.error(
        "Uploaded-file cleanup failed:",
        error
      );
    }
  }


  /* =======================================================
     15. PRODUCT FORM RESET AND OPEN
     ======================================================= */

  function resetProductForm() {

    $("adminProductForm")?.reset();

    setValue("editProductId", "");

    setText("productFormTitle", "Add new product");

    resetProductImages();

    showMessage("productMessage", "");
  }

  function openProductForm(product = null) {

    const container = $("productFormContainer");

    if (!container) return;

    resetProductForm();

    container.hidden = false;

    if (product) {

      setValue("editProductId", product.id);
      setValue("adminProductName", product.name);
      setValue("adminProductCategory", product.category);
      setValue("adminProductPrice", product.price);
      setValue("adminProductPriceZAR", product.price_zar ?? "");
      setValue("adminProductStock", product.stock);
      // Show legacy comma-separated values as editable one-per-line options.
      setValue("adminProductSizes", String(product.sizes || "").split(/[\\n,]+/).map(value => value.trim()).filter(Boolean).join("\\n"));
      setValue("adminProductColours", String(product.colours || "").split(/[\\n,]+/).map(value => value.trim()).filter(Boolean).join("\\n"));
      setValue("adminProductStatus", product.status);
      setValue("adminProductFeatured", String(product.featured));
      setValue("adminProductDescription", product.description);

      currentProductImages = normaliseProductImages(product);

      renderImagePreviews();

      setText("productFormTitle", "Edit product");
    }

    container.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  $("addProductButton")?.addEventListener("click", () => {
    openProductForm();
  });

  $("cancelProductForm")?.addEventListener("click", () => {

    const container = $("productFormContainer");

    if (container) {
      container.hidden = true;
    }

    resetProductForm();
  });


  /* =======================================================
     16. SAVE PRODUCT
     ======================================================= */

  $("adminProductForm")?.addEventListener("submit", async event => {

    event.preventDefault();

    if (isSavingProduct) return;

    const name = $("adminProductName").value.trim();
    const category = $("adminProductCategory").value;
    const price = Number($("adminProductPrice").value);

    const zarValue = $("adminProductPriceZAR").value.trim();

    const priceZAR =
      zarValue === "" ? null : Number(zarValue);

    const stock = Number($("adminProductStock").value);

    const editId = $("editProductId").value;

    if (
      !name ||
      !category ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      showMessage(
        "productMessage",
        "Enter a product name, category and valid ZMW price.",
        "error"
      );

      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      showMessage(
        "productMessage",
        "Stock must be a whole number of zero or more.",
        "error"
      );

      return;
    }

    if (
      priceZAR !== null &&
      (!Number.isFinite(priceZAR) || priceZAR <= 0)
    ) {
      showMessage(
        "productMessage",
        "Enter a valid ZAR price or leave it blank.",
        "error"
      );

      return;
    }

    const submitButton = event.target.querySelector(
      'button[type="submit"]'
    );

    isSavingProduct = true;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
    }

    try {

      showMessage(
        "productMessage",
        "Uploading images and saving product..."
      );

      const previousProduct = editId
        ? products.find(product => String(product.id) === String(editId))
        : null;

      const previousImages = previousProduct
        ? normaliseProductImages(previousProduct)
        : [];

      const uploadResult = await uploadProductImages();

      const allImages = [
        ...currentProductImages,
        ...uploadResult.uploadedURLs
      ];

      const productData = {
        name,
        description: $("adminProductDescription").value.trim(),
        category,
        price,
        price_zar: priceZAR,
        stock,
        sizes: $("adminProductSizes").value.split(/[\\n,]+/).map(value => value.trim()).filter(Boolean).join("\\n"),
        colours: $("adminProductColours").value.split(/[\\n,]+/).map(value => value.trim()).filter(Boolean).join("\\n"),
        status: $("adminProductStatus").value,
        featured: $("adminProductFeatured").value === "true",
        image: allImages[0] || "",
        images: allImages,
        updated_at: new Date().toISOString()
      };

      let result;

      if (editId) {

        result = await db
          .from("products")
          .update(productData)
          .eq("id", editId)
          .select()
          .single();

      } else {

        result = await db
          .from("products")
          .insert(productData)
          .select()
          .single();

      }

      if (result.error) {

        // Delete only the new uploads from this failed save.
        // Existing saved product images are never deleted here.
        await removeUploadedFiles(uploadResult.uploadedPaths);

        throw result.error;
      }

      const removedImages = previousImages.filter(
        url => !allImages.includes(url)
      );

      // Keep any image still referenced by another product.
      await removeUnreferencedProductImages(removedImages);

      showMessage(
        "productMessage",
        "Product saved successfully.",
        "success"
      );

      const container = $("productFormContainer");

      if (container) {
        container.hidden = true;
      }

      resetProductForm();

      await loadProducts();

    } catch (error) {

      console.error("Product save error:", error);

      showMessage(
        "productMessage",
        error.message || "The product could not be saved.",
        "error"
      );

    } finally {

      isSavingProduct = false;

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Save product";
      }
    }
  });


  /* =======================================================
     17. EDIT AND DELETE PRODUCTS
     ======================================================= */

  $("adminProductsList")?.addEventListener("click", async event => {

    const target = event.target;

    if (!(target instanceof Element)) return;

    const editButton = target.closest("[data-edit-product]");
    const deleteButton = target.closest("[data-delete-product]");

    if (editButton) {

      const product = products.find(
        item => String(item.id) === String(editButton.dataset.editProduct)
      );

      if (product) {
        openProductForm(product);
      }

      return;
    }

    if (deleteButton) {

      const id = deleteButton.dataset.deleteProduct;

      const product = products.find(
        item => String(item.id) === String(id)
      );

      if (!product) return;

      const confirmed = confirm(
        `Delete "${product.name}" from the product catalogue?`
      );

      if (!confirmed) return;

      deleteButton.disabled = true;

      try {

        const { error } = await db
          .from("products")
          .delete()
          .eq("id", id);

        if (error) throw error;

        await removeUnreferencedProductImages(
          normaliseProductImages(product)
        );

        await loadProducts();

      } catch (error) {

        console.error("Product deletion error:", error);

        alert(
          "The product could not be deleted: " + error.message
        );

        deleteButton.disabled = false;
      }
    }
  });


  /* =======================================================
     18. LOAD CATEGORIES
     ======================================================= */

  async function loadCategories() {

    const host = $("adminCategoriesList");

    if (host) {
      host.innerHTML =
        '<p class="empty-message">Loading categories...</p>';
    }

    const { data, error } = await db
      .from("categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {

      console.error("Category loading error:", error);

      if (host) {
        host.textContent =
          "Categories could not be loaded.";
      }

      return;
    }

    categories = data || [];

    renderCategories();
    renderProductCategoryOptions();
  }


  /* =======================================================
     19. RENDER CATEGORIES
     ======================================================= */

  function renderCategories() {

    const host = $("adminCategoriesList");

    if (!host) return;

    if (!categories.length) {
      host.innerHTML =
        '<p class="empty-message">No categories found.</p>';

      return;
    }

    host.innerHTML = `
      <div class="table-container">

        <table class="admin-table">

          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>

            ${categories.map(category => `

              <tr>

                <td>${escapeHTML(category.name)}</td>

                <td>${escapeHTML(category.description || "—")}</td>

                <td>${escapeHTML(category.status)}</td>

                <td>

                  <button
                    type="button"
                    data-edit-category="${escapeHTML(category.id)}">
                    Edit
                  </button>

                  <button
                    type="button"
                    data-delete-category="${escapeHTML(category.id)}">
                    Delete
                  </button>

                </td>

              </tr>

            `).join("")}

          </tbody>

        </table>

      </div>
    `;
  }


  /* =======================================================
     20. SAVE CATEGORY
     ======================================================= */

  $("adminCategoryForm")?.addEventListener("submit", async event => {

    event.preventDefault();

    const id = $("editCategoryId").value;
    const name = $("categoryName").value.trim();

    const description =
      $("categoryDescription").value.trim();

    const status = $("categoryStatus").value;

    if (!name) {
      showMessage(
        "categoryMessage",
        "Enter a category name.",
        "error"
      );

      return;
    }

    const duplicate = categories.some(category =>
      category.name.toLowerCase() === name.toLowerCase() &&
      String(category.id) !== String(id)
    );

    if (duplicate) {
      showMessage(
        "categoryMessage",
        "A category with that name already exists.",
        "error"
      );

      return;
    }

    const categoryData = {
      name,
      description,
      status,
      updated_at: new Date().toISOString()
    };

    try {

      let result;

      if (id) {

        result = await db
          .from("categories")
          .update(categoryData)
          .eq("id", id);

      } else {

        result = await db
          .from("categories")
          .insert(categoryData);

      }

      if (result.error) throw result.error;

      event.target.reset();

      setValue("editCategoryId", "");

      setText("categoryFormHeading", "Add category");

      showMessage(
        "categoryMessage",
        "Category saved successfully.",
        "success"
      );

      await loadCategories();

    } catch (error) {

      console.error("Category save error:", error);

      showMessage(
        "categoryMessage",
        error.message || "Could not save category.",
        "error"
      );
    }
  });


  /* =======================================================
     21. EDIT AND DELETE CATEGORIES
     ======================================================= */

  $("adminCategoriesList")?.addEventListener("click", async event => {

    const target = event.target;

    if (!(target instanceof Element)) return;

    const editButton = target.closest("[data-edit-category]");
    const deleteButton = target.closest("[data-delete-category]");

    if (editButton) {

      const category = categories.find(
        item => String(item.id) === String(editButton.dataset.editCategory)
      );

      if (!category) return;

      setValue("editCategoryId", category.id);
      setValue("categoryName", category.name);
      setValue("categoryDescription", category.description);
      setValue("categoryStatus", category.status);

      setText("categoryFormHeading", "Edit category");

      return;
    }

    if (deleteButton) {

      const id = deleteButton.dataset.deleteCategory;

      const category = categories.find(
        item => String(item.id) === String(id)
      );

      if (!category) return;

      const usedByProducts = products.some(
        product => product.category === category.name
      );

      if (usedByProducts) {
        alert(
          "This category is assigned to products. Reassign those products before deleting it."
        );

        return;
      }

      if (!confirm(`Delete category "${category.name}"?`)) {
        return;
      }

      try {

        const { error } = await db
          .from("categories")
          .delete()
          .eq("id", id);

        if (error) throw error;

        await loadCategories();

      } catch (error) {

        console.error("Category deletion error:", error);

        alert(
          "The category could not be deleted: " + error.message
        );
      }
    }
  });


  /* =======================================================
     22. INVENTORY
     ======================================================= */

  function renderInventory() {

    const host = $("adminInventoryList");

    if (!host) return;

    const totalUnits = products.reduce(
      (total, product) => total + Number(product.stock || 0),
      0
    );

    const lowStock = products.filter(
      product =>
        Number(product.stock || 0) > 0 &&
        Number(product.stock || 0) <= 5
    );

    const outOfStock = products.filter(
      product => Number(product.stock || 0) === 0
    );

    host.innerHTML = `

      <div class="admin-stat-grid">

        <article class="admin-stat-card">
          <p>Products</p>
          <h2>${products.length}</h2>
        </article>

        <article class="admin-stat-card">
          <p>Total units</p>
          <h2>${totalUnits}</h2>
        </article>

        <article class="admin-stat-card">
          <p>Low stock</p>
          <h2>${lowStock.length}</h2>
        </article>

        <article class="admin-stat-card">
          <p>Out of stock</p>
          <h2>${outOfStock.length}</h2>
        </article>

      </div>

      <div class="table-container">

        <table class="admin-table">

          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Quantity</th>
              <th>Stock status</th>
            </tr>
          </thead>

          <tbody>

            ${products.map(product => {

              const quantity = Number(product.stock || 0);

              const stockStatus =
                quantity === 0
                  ? "Out of stock"
                  : quantity <= 5
                    ? "Low stock"
                    : "In stock";

              return `
                <tr>
                  <td>${escapeHTML(product.name)}</td>
                  <td>${escapeHTML(product.category)}</td>
                  <td>${quantity}</td>
                  <td>${stockStatus}</td>
                </tr>
              `;

            }).join("")}

          </tbody>

        </table>

      </div>
    `;
  }


  /* =======================================================
     23. OVERVIEW STATISTICS
     ======================================================= */

  function refreshOverview() {

    setText("statProducts", products.length);

    setText("statOrders", "Not connected");

    setText("statPendingOrders", "Not connected");

    setText("statSales", "Not connected");

    const activity = $("overviewRecentActivity");

    if (activity) {

      activity.innerHTML = `
        <p class="empty-message">
          Product and category records are loaded from Supabase.
          Order and sales activity will appear after those modules
          are connected to their database tables.
        </p>
      `;
    }
  }


  /* =======================================================
     24. SHARED SUPABASE ANALYTICS
     ======================================================= */

  let analyticsLoadInProgress = false;

  function analyticsPeriodStart() {
    const period = $("analyticsPeriod")?.value || "7d";
    if (period === "all") return null;
    const durations = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000
    };
    return new Date(Date.now() - (durations[period] || durations["7d"])).toISOString();
  }

  function formatAnalyticsTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleString();
  }

  async function loadAnalytics() {
    if (!currentUser || analyticsLoadInProgress) return;
    analyticsLoadInProgress = true;
    const status = $("analyticsStatus");
    const table = $("analyticsEventsTable");
    const refresh = $("refreshAnalytics");

    if (status) status.textContent = "Loading recorded analytics…";
    if (refresh) refresh.disabled = true;

    try {
      let request = db
        .from("analytics_events")
        .select("event_id,event_name,occurred_at,visitor_id,session_id,page_path,page_type,device,browser,traffic_source,product_id,product_name,category")
        .order("occurred_at", { ascending: false })
        .limit(10000);

      const start = analyticsPeriodStart();
      if (start) request = request.gte("occurred_at", start);

      const { data, error } = await request;
      if (error) throw error;

      const events = data || [];
      const count = name => events.filter(event => event.event_name === name).length;
      const unique = field => new Set(events.map(event => event[field]).filter(Boolean)).size;

      setText("analyticsPageViews", count("page_view").toLocaleString());
      setText("analyticsVisitors", unique("visitor_id").toLocaleString());
      setText("analyticsProductViews", count("product_view").toLocaleString());
      setText("analyticsAddToCart", count("add_to_cart").toLocaleString());
      setText("analyticsCheckoutVisits", count("checkout_visit").toLocaleString());
      setText("analyticsSessions", unique("session_id").toLocaleString());
      setText("analyticsTotalEvents", events.length.toLocaleString());

      if (table) {
        const header = '<thead><tr><th>Event</th><th>Page</th><th>Product</th><th>Device</th><th>Time</th></tr></thead>';
        if (!events.length) {
          table.innerHTML = header + '<tbody><tr><td colspan="5">No events recorded for this period yet. Visit the public storefront to generate the first real event.</td></tr></tbody>';
        } else {
          const rows = events.slice(0, 100).map(event =>
            '<tr><td>' + escapeHTML(event.event_name.replace(/_/g, " ")) +
            '</td><td>' + escapeHTML(event.page_path || "—") +
            '</td><td>' + escapeHTML(event.product_name || event.product_id || "—") +
            '</td><td>' + escapeHTML(event.device || "—") +
            '</td><td>' + escapeHTML(formatAnalyticsTime(event.occurred_at)) +
            '</td></tr>'
          ).join("");
          table.innerHTML = header + "<tbody>" + rows + "</tbody>";
        }
      }

      if (status) {
        status.textContent = "Connected · " + events.length.toLocaleString() +
          " events loaded" + (events.length === 10000 ? " (display limit reached)" : "") +
          " · Updated " + new Date().toLocaleTimeString();
      }
    } catch (error) {
      console.error("Analytics loading error:", error);
      if (status) status.textContent = "Analytics could not be loaded: " + (error.message || "Database request failed");
      if (table) table.innerHTML = '<thead><tr><th>Event</th><th>Page</th><th>Product</th><th>Device</th><th>Time</th></tr></thead><tbody><tr><td colspan="5">Check analytics_events permissions and administrator access, then refresh.</td></tr></tbody>';
    } finally {
      analyticsLoadInProgress = false;
      if (refresh) refresh.disabled = false;
    }
  }

  $("refreshAnalytics")?.addEventListener("click", loadAnalytics);
  $("analyticsPeriod")?.addEventListener("change", loadAnalytics);


  /* =======================================================
     25. DISCOUNT CAMPAIGNS
     ======================================================= */

  let discountCampaigns = [];

  function discountLocalDate(value) {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function fillDiscountScopeOptions() {
    const category = $("discountCategory");
    const product = $("discountProduct");
    if (category) {
      const selected = category.value;
      category.innerHTML = '<option value="">Choose category</option>' + categories.filter(item => item.status === "active").map(item => '<option value="' + escapeHTML(item.name) + '">' + escapeHTML(item.name) + '</option>').join("");
      category.value = selected;
    }
    if (product) {
      const selected = product.value;
      product.innerHTML = '<option value="">Choose product</option>' + products.filter(item => item.status === "active").map(item => '<option value="' + escapeHTML(item.id) + '">' + escapeHTML(item.name) + '</option>').join("");
      product.value = selected;
    }
  }

  function updateDiscountScopeFields() {
    const scope = $("discountScope")?.value || "all";
    if ($("discountCategoryWrap")) $("discountCategoryWrap").hidden = scope !== "category";
    if ($("discountProductWrap")) $("discountProductWrap").hidden = scope !== "product";
  }

  function clearDiscountForm() {
    $("discountCampaignForm")?.reset();
    setValue("discountEditId", "");
    setText("discountFormHeading", "Create discount campaign");
    setText("saveDiscountButton", "Save campaign");
    setValue("discountMinimum", "0");
    setValue("discountActive", "true");
    updateDiscountScopeFields();
    showMessage("discountMessage", "");
  }

  async function loadDiscountCampaigns() {
    // The campaign editor needs live categories and products even when
    // Discounts is the first section opened after login.
    const lookups = [];
    if (!products.length) lookups.push(loadProducts());
    if (!categories.length) lookups.push(loadCategories());
    if (lookups.length) await Promise.all(lookups);

    const host = $("discountCampaignList");
    if (host) host.innerHTML = '<p class="empty-message">Loading discount campaigns...</p>';
    fillDiscountScopeOptions();
    const { data, error } = await db.from("discount_campaigns").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("Discount campaigns loading error:", error);
      if (host) host.textContent = "Campaigns could not be loaded: " + error.message;
      showMessage("discountMessage", error.message, "error");
      return;
    }
    discountCampaigns = data || [];
    renderDiscountCampaigns();
  }

  function renderDiscountCampaigns() {
    const host = $("discountCampaignList");
    if (!host) return;
    if (!discountCampaigns.length) { host.innerHTML = '<p class="empty-message">No discount campaigns yet. Create your first campaign above.</p>'; return; }
    const rows = discountCampaigns.map(item => {
      const now = Date.now();
      const state = !item.is_active ? "Paused" : (now < new Date(item.starts_at).getTime() ? "Scheduled" : (now > new Date(item.ends_at).getTime() ? "Expired" : "Active"));
      const offer = item.discount_type === "percentage" ? Number(item.discount_value) + "%" : formatMoney(item.discount_value, item.currency);
      return '<tr><td>' + escapeHTML(item.name) + '<br><small>' + escapeHTML(item.description || "") + '</small></td><td><strong>' + escapeHTML(item.code) + '</strong></td><td>' + escapeHTML(offer) + '<br><small>' + escapeHTML(item.currency) + '</small></td><td>' + escapeHTML(formatAnalyticsTime(item.starts_at)) + '<br>to ' + escapeHTML(formatAnalyticsTime(item.ends_at)) + '</td><td>' + escapeHTML(state) + '</td><td><button type="button" data-edit-discount="' + escapeHTML(item.id) + '">Edit</button> <button type="button" data-toggle-discount="' + escapeHTML(item.id) + '">' + (item.is_active ? "Pause" : "Activate") + '</button> <button type="button" data-delete-discount="' + escapeHTML(item.id) + '">Delete</button></td></tr>';
    }).join("");
    host.innerHTML = '<div class="table-container"><table class="admin-table"><thead><tr><th>Campaign</th><th>Code</th><th>Offer</th><th>Period</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  $("discountScope")?.addEventListener("change", updateDiscountScopeFields);
  $("cancelDiscountEdit")?.addEventListener("click", clearDiscountForm);

  $("discountCampaignForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const id = $("discountEditId").value;
    const name = $("discountName").value.trim();
    const code = $("discountCode").value.trim().toUpperCase();
    const type = $("discountType").value;
    const value = Number($("discountValue").value);
    const currency = $("discountCurrency").value;
    const max = $("discountMax").value === "" ? null : Number($("discountMax").value);
    const minimum = Number($("discountMinimum").value || 0);
    const scope = $("discountScope").value;
    const starts = new Date($("discountStarts").value);
    const ends = new Date($("discountEnds").value);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) { showMessage("discountMessage", "Use 3-40 letters, numbers, hyphens or underscores for the code.", "error"); return; }
    if (!Number.isFinite(value) || value <= 0 || (type === "percentage" && value > 100)) { showMessage("discountMessage", "Enter a valid value. Percentages cannot exceed 100%.", "error"); return; }
    if (max !== null && (!Number.isFinite(max) || max <= 0)) { showMessage("discountMessage", "Maximum discount must be greater than zero.", "error"); return; }
    if (!Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) { showMessage("discountMessage", "Check the minimum subtotal and campaign dates.", "error"); return; }
    const category = scope === "category" ? $("discountCategory").value : null;
    const productId = scope === "product" ? $("discountProduct").value : null;
    if ((scope === "category" && !category) || (scope === "product" && !productId)) { showMessage("discountMessage", "Select the category or product for this campaign.", "error"); return; }
    const payload = { name, code, description: $("discountDescription").value.trim(), discount_type: type, discount_value: value, currency, max_discount: max, min_subtotal: minimum, scope, category, product_id: productId, starts_at: starts.toISOString(), ends_at: ends.toISOString(), is_active: $("discountActive").value === "true", updated_at: new Date().toISOString() };
    const button = $("saveDiscountButton"); button.disabled = true;
    try {
      const result = id ? await db.from("discount_campaigns").update(payload).eq("id", id) : await db.from("discount_campaigns").insert(payload);
      if (result.error) throw result.error;
      showMessage("discountMessage", "Discount campaign saved.", "success");
      clearDiscountForm(); await loadDiscountCampaigns();
    } catch (error) { console.error("Discount save error:", error); showMessage("discountMessage", error.message || "Campaign could not be saved.", "error"); }
    finally { button.disabled = false; }
  });

  $("discountCampaignList")?.addEventListener("click", async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const edit = target.closest("[data-edit-discount]");
    const toggle = target.closest("[data-toggle-discount]");
    const remove = target.closest("[data-delete-discount]");
    const id = edit?.dataset.editDiscount || toggle?.dataset.toggleDiscount || remove?.dataset.deleteDiscount;
    const item = discountCampaigns.find(row => row.id === id);
    if (!item) return;
    if (edit) {
      fillDiscountScopeOptions(); setValue("discountEditId", item.id);
      setText("discountFormHeading", "Edit discount campaign"); setText("saveDiscountButton", "Update campaign");
      setValue("discountName", item.name); setValue("discountCode", item.code); setValue("discountDescription", item.description);
      setValue("discountType", item.discount_type); setValue("discountValue", item.discount_value); setValue("discountCurrency", item.currency);
      setValue("discountMax", item.max_discount ?? ""); setValue("discountMinimum", item.min_subtotal); setValue("discountScope", item.scope);
      setValue("discountCategory", item.category || ""); setValue("discountProduct", item.product_id || "");
      setValue("discountStarts", discountLocalDate(item.starts_at)); setValue("discountEnds", discountLocalDate(item.ends_at));
      setValue("discountActive", String(item.is_active)); updateDiscountScopeFields();
      $("discountCampaignForm")?.scrollIntoView({behavior:"smooth",block:"start"}); return;
    }
    if (toggle) {
      const { error } = await db.from("discount_campaigns").update({is_active:!item.is_active,updated_at:new Date().toISOString()}).eq("id",item.id);
      if (error) showMessage("discountMessage",error.message,"error"); else await loadDiscountCampaigns(); return;
    }
    if (remove && confirm("Permanently delete discount code " + item.code + "?")) {
      const { error } = await db.from("discount_campaigns").delete().eq("id",item.id);
      if (error) showMessage("discountMessage",error.message,"error"); else await loadDiscountCampaigns();
    }
  });


  /* =======================================================
     26. ACCOUNT EMAIL CHANGE
     ======================================================= */

  $("changeAdminEmailButton")?.addEventListener("click", async () => {

    if (!currentUser) {
      showMessage(
        "adminAccountMessage",
        "Sign in before changing your email.",
        "error"
      );

      return;
    }

    const requestedEmail = String($("newAdminEmail")?.value || "")
      .trim()
      .toLowerCase();

    if (!requestedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
      showMessage("adminAccountMessage", "Enter a valid new email address.", "error");
      return;
    }

    if (currentUser.email?.toLowerCase() === requestedEmail) {
      showMessage(
        "adminAccountMessage",
        "This account already uses the requested email.",
        "success"
      );

      return;
    }

    const confirmed = confirm(
      `Request an email change to ${requestedEmail}? Supabase may send a confirmation email before the change takes effect.`
    );

    if (!confirmed) return;

    const button = $("changeAdminEmailButton");

    button.disabled = true;
    button.textContent = "Submitting...";

    try {

      const { error } = await db.auth.updateUser({
        email: requestedEmail
      });

      if (error) throw error;

      showMessage(
        "adminAccountMessage",
        "Email change requested. Check the confirmation email sent by Supabase. Your current login email remains active until the change is confirmed.",
        "success"
      );

    } catch (error) {

      console.error("Email change error:", error);

      showMessage(
        "adminAccountMessage",
        error.message || "The email change could not be requested.",
        "error"
      );

    } finally {

      button.disabled = false;
      button.textContent = "Change administrator email";
    }
  });


  /* =======================================================
     BUSINESS CONTACT AND PAYMENT MANAGEMENT
     ======================================================= */

  const contactPaymentForm = $("businessContactPaymentForm");
  const contactPaymentList = $("businessContactPaymentList");

  function clearContactPaymentForm() {
    contactPaymentForm?.reset();
    setValue("contactPaymentId", "");
    setValue("contactPaymentOrder", "100");
    setText("contactPaymentFormTitle", "Add a contact or payment number");
    setText("saveContactPayment", "Save record");
    showMessage("contactPaymentMessage", "");
  }

  async function loadBusinessContactPayments() {
    if (!contactPaymentList) return;
    contactPaymentList.innerHTML = '<p class="empty-message">Loading records...</p>';
    const { data, error } = await db
      .from("business_contact_payment_settings")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Contact/payment settings load failed:", error);
      contactPaymentList.textContent = "Could not load records. Check database access and try again.";
      return;
    }

    if (!data?.length) {
      contactPaymentList.innerHTML = '<p class="empty-message">No contact or payment records have been added.</p>';
      return;
    }

    contactPaymentList.innerHTML = data.map(record => {
      const value = record.setting_type === "email"
        ? record.email_address
        : record.phone_number;
      const state = record.is_active && !record.deleted_at ? "Active" : "Inactive";
      return `
        <article class="admin-panel" style="margin:12px 0">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <strong>${escapeHTML(record.label)}</strong>
              <p>${escapeHTML(record.setting_type)} · ${escapeHTML(record.provider)} · ${escapeHTML(value || "")}</p>
              ${record.recipient_name ? `<p>Recipient: ${escapeHTML(record.recipient_name)}</p>` : ""}
              <small>${state} · Display order ${Number(record.display_order) || 0}</small>
            </div>
            <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">
              <button type="button" class="secondary-button" data-contact-edit="${record.id}">Edit</button>
              <button type="button" class="secondary-button" data-contact-toggle="${record.id}" data-active="${record.is_active && !record.deleted_at}">
                ${record.is_active && !record.deleted_at ? "Deactivate" : "Reactivate"}
              </button>
              <button type="button" class="secondary-button" data-contact-delete="${record.id}">Delete</button>
            </div>
          </div>
        </article>`;
    }).join("");

    contactPaymentList.querySelectorAll("[data-contact-edit]").forEach(button => {
      button.addEventListener("click", () => {
        const record = data.find(item => item.id === button.dataset.contactEdit);
        if (!record) return;
        setValue("contactPaymentId", record.id);
        setValue("contactPaymentType", record.setting_type);
        setValue("contactPaymentProvider", record.provider);
        setValue("contactPaymentLabel", record.label);
        setValue("contactPaymentNumber", record.phone_number || "");
        setValue("contactPaymentEmail", record.email_address || "");
        setValue("contactPaymentRecipient", record.recipient_name || "");
        setValue("contactPaymentAppUrl", record.app_url || "");
        setValue("contactPaymentOrder", record.display_order);
        setText("contactPaymentFormTitle", "Edit contact/payment record");
        setText("saveContactPayment", "Update record");
        showMessage("contactPaymentMessage", "Editing selected record.");
        $("businessContactPaymentForm")?.scrollIntoView({behavior:"smooth",block:"start"});
      });
    });

    contactPaymentList.querySelectorAll("[data-contact-toggle]").forEach(button => {
      button.addEventListener("click", async () => {
        const record = data.find(item => item.id === button.dataset.contactToggle);
        if (!record) return;
        const activate = !(record.is_active && !record.deleted_at);
        const { error: updateError } = await db
          .from("business_contact_payment_settings")
          .update({
            is_active: activate,
            deleted_at: activate ? null : new Date().toISOString(),
            deleted_by: activate ? null : currentUser?.id || null,
            updated_at: new Date().toISOString(),
            updated_by: currentUser?.id || null
          })
          .eq("id", record.id);
        if (updateError) {
          showMessage("contactPaymentMessage", updateError.message, "error");
          return;
        }
        showMessage("contactPaymentMessage", activate ? "Record reactivated." : "Record deactivated.", "success");
        await loadBusinessContactPayments();
      });
    });

    contactPaymentList.querySelectorAll("[data-contact-delete]").forEach(button => {
      button.addEventListener("click", async () => {
        const record = data.find(item => item.id === button.dataset.contactDelete);
        if (!record || !window.confirm("Permanently delete this record? Its audit history will remain.")) return;
        const { error: deleteError } = await db
          .from("business_contact_payment_settings")
          .delete()
          .eq("id", record.id);
        if (deleteError) {
          showMessage("contactPaymentMessage", deleteError.message, "error");
          return;
        }
        showMessage("contactPaymentMessage", "Record permanently deleted.", "success");
        await loadBusinessContactPayments();
      });
    });
  }

  contactPaymentForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const type = $("contactPaymentType")?.value;
    const emailType = type === "email";
    const phone = $("contactPaymentNumber")?.value.trim() || null;
    const email = $("contactPaymentEmail")?.value.trim() || null;
    const appUrl = $("contactPaymentAppUrl")?.value.trim() || null;

    if (emailType ? !email : !phone) {
      showMessage("contactPaymentMessage", emailType ? "Enter an email address." : "Enter a phone number.", "error");
      return;
    }
    if (appUrl && !/^https?:\/\//i.test(appUrl)) {
      showMessage("contactPaymentMessage", "App/contact URL must begin with https:// or http://.", "error");
      return;
    }

    const payload = {
      setting_type: type,
      provider: $("contactPaymentProvider")?.value,
      label: $("contactPaymentLabel")?.value.trim(),
      phone_number: emailType ? null : phone,
      email_address: emailType ? email : null,
      recipient_name: $("contactPaymentRecipient")?.value.trim() || null,
      app_url: appUrl,
      display_order: Math.max(0, Number($("contactPaymentOrder")?.value || 100)),
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.id || null
    };
    const id = $("contactPaymentId")?.value;
    const request = id
      ? db.from("business_contact_payment_settings").update(payload).eq("id", id)
      : db.from("business_contact_payment_settings").insert(payload);

    const { error } = await request;
    if (error) {
      console.error("Contact/payment save failed:", error);
      showMessage("contactPaymentMessage", error.message, "error");
      return;
    }
    clearContactPaymentForm();
    showMessage("contactPaymentMessage", id ? "Record updated successfully." : "Record added successfully.", "success");
    await loadBusinessContactPayments();
  });

  $("cancelContactPaymentEdit")?.addEventListener("click", clearContactPaymentForm);
  $("refreshContactPayments")?.addEventListener("click", loadBusinessContactPayments);

  /* =======================================================
     26. MODULES NOT YET CONNECTED
     ======================================================= */

  function disableUnconnectedForm(formId, messageId, moduleName) {

    const form = $(formId);

    if (!form) return;

    form.addEventListener("submit", event => {

      event.preventDefault();

      showMessage(
        messageId,
        `${moduleName} has not been connected to its Supabase database table yet. No record was saved.`,
        "error"
      );
    });
  }

  disableUnconnectedForm(
    "adminOrderForm",
    "orderMessage",
    "Order management"
  );

  disableUnconnectedForm(
    "adminPaymentForm",
    "paymentMessage",
    "Payment management"
  );

  disableUnconnectedForm(
    "adminCustomerForm",
    "customerMessage",
    "Customer management"
  );

  disableUnconnectedForm(
    "adminAnnouncementForm",
    "announcementMessageStatus",
    "Announcement management"
  );

  disableUnconnectedForm(
    "adminStorefrontForm",
    "storefrontMessage",
    "Storefront settings"
  );

  disableUnconnectedForm(
    "adminSettingsForm",
    "settingsMessage",
    "General settings"
  );


  /* =======================================================
     27. LOAD DASHBOARD DATA
     ======================================================= */

  async function loadDashboardData() {

    if (dashboardLoadInProgress) return;

    dashboardLoadInProgress = true;

    try {

      await Promise.all([
        loadCategories(),
        loadProducts()
      ]);

      refreshOverview();

    } finally {

      dashboardLoadInProgress = false;
    }
  }


  /* =======================================================
     28. START APPLICATION
     ======================================================= */

  showLogin();

  restoreSession();

});
