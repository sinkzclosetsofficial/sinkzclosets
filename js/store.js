
/* =========================================================
   SINKZCLOSETS — CENTRAL STORE
   Catalogue, cart, ZMW/ZAR currency and cart drawer

   LIVE CATALOGUE:
   - Public active products are loaded from Supabase.
   - A local cache keeps the storefront usable during temporary outages.
   - No automatic sample-product creation.
   - ZMW and ZAR prices are independent.
   - Missing prices remain unavailable.
   - Unverified stock cannot pass checkout validation.
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       1. STORAGE CONFIGURATION
    ===================================================== */

    const PRODUCTS_KEY = "sinkz_products";
    const CART_KEY = "sinkzclosets_cart";
    const CURRENCY_KEY = "sinkz_currency";

    const DEFAULT_CURRENCY = "ZMW";
    const VALID_CURRENCIES = ["ZMW", "ZAR"];

    const SUPABASE_URL =
        "https://mpzkiatdejirrjidkdqi.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_9Lpund59NwZAcpZyiCdxPg_D8fohkXR";

    let supabaseClient = null;

    function getSupabaseClient() {
        if (supabaseClient) return supabaseClient;

        if (
            !window.supabase ||
            typeof window.supabase.createClient !== "function"
        ) {
            return null;
        }

        supabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );

        return supabaseClient;
    }

    /* =====================================================
       2. GENERAL HELPERS
    ===================================================== */

    function readStorage(key, fallback) {
        try {
            const value = localStorage.getItem(key);

            if (value === null) return fallback;

            return JSON.parse(value);

        } catch (error) {
            console.error("Storage read error:", key, error);
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;

        } catch (error) {
            console.error("Storage write error:", key, error);
            return false;
        }
    }

    function hasOwn(object, property) {
        return Object.prototype.hasOwnProperty.call(
            object || {},
            property
        );
    }

    function isValidCurrency(currency) {
        return VALID_CURRENCIES.includes(currency);
    }

    function getCurrency() {
        try {
            const saved = localStorage.getItem(CURRENCY_KEY);

            return isValidCurrency(saved)
                ? saved
                : DEFAULT_CURRENCY;

        } catch (error) {
            console.error("Currency read error:", error);
            return DEFAULT_CURRENCY;
        }
    }

    function getCurrencyName(currency) {
        return currency === "ZAR"
            ? "South African Rand"
            : "Zambian Kwacha";
    }

    function getCurrencySymbol(currency) {
        return currency === "ZAR" ? "R" : "K";
    }

    function formatPrice(amount, currency) {
        currency = currency || getCurrency();

        if (
            !isValidCurrency(currency) ||
            amount === null ||
            amount === undefined ||
            amount === "" ||
            !Number.isFinite(Number(amount))
        ) {
            return "Price unavailable";
        }

        return getCurrencySymbol(currency) +
            Number(amount).toLocaleString("en-ZM", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
    }

    function validPrice(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return null;
        }

        const number = Number(value);

        if (!Number.isFinite(number) || number < 0) {
            return null;
        }

        return number;
    }

    function validQuantity(value) {
        const quantity = Number(value);

        if (
            !Number.isFinite(quantity) ||
            quantity < 1
        ) {
            return null;
        }

        return Math.floor(quantity);
    }

    /* =====================================================
       3. PRODUCT PRICE HANDLING

       Legacy "price" is interpreted as ZMW only.
       It is never copied into ZAR.
    ===================================================== */

    function getRawCurrencyPrice(product, currency) {
        if (!product) return null;

        let value = null;

        if (currency === "ZMW") {
            value =
                product.price_zmw ??
                product.priceZMW ??
                product.zmw_price ??
                product.zmwPrice;

            if (
                value === null ||
                value === undefined ||
                value === ""
            ) {
                value = product.price;
            }

        } else if (currency === "ZAR") {
            value =
                product.price_zar ??
                product.priceZAR ??
                product.zar_price ??
                product.zarPrice;
        }

        return validPrice(value);
    }

    function getStockQuantity(product) {
        if (!product) return null;

        const possibleFields = [
            "stock",
            "stock_quantity",
            "quantity_in_stock",
            "available_stock"
        ];

        for (const field of possibleFields) {
            if (
                hasOwn(product, field) &&
                product[field] !== null &&
                product[field] !== ""
            ) {
                const value = Number(product[field]);

                if (
                    Number.isFinite(value) &&
                    value >= 0
                ) {
                    return Math.floor(value);
                }

                return null;
            }
        }

        return null;
    }

    function isStockConfirmed(product) {
        if (!product) return false;

        // The products table has a required, non-null integer "stock" column.
        // Admin product creation validates and saves this quantity directly.
        // There is no separate stock-confirmation column in the current schema,
        // so a valid persisted stock quantity is the confirmation source.
        return getStockQuantity(product) !== null;
    }

    function normaliseProduct(product) {
        const copy = Object.assign({}, product);

        const zmw = getRawCurrencyPrice(product, "ZMW");
        const zar = getRawCurrencyPrice(product, "ZAR");

        copy.price_zmw = zmw;
        copy.price_zar = zar;

        copy.priceZMW = zmw;
        copy.priceZAR = zar;

        const currency = getCurrency();

        const selectedPrice =
            currency === "ZAR" ? zar : zmw;

        copy.price = selectedPrice;
        copy.selectedCurrency = currency;
        copy.priceUnavailable = selectedPrice === null;

        copy.stock = getStockQuantity(product);
        copy.stockConfirmed = isStockConfirmed(product);

        copy.availabilityStatus = copy.stockConfirmed
            ? (
                copy.stock > 0
                    ? "Available"
                    : "Out of stock"
            )
            : "Availability unconfirmed";

        return copy;
    }

    /* =====================================================
       4. PRODUCT CATALOGUE

       IMPORTANT:
       An empty catalogue stays empty.
       No demo products are automatically inserted.
    ===================================================== */

    function getRawProducts() {
        const products = readStorage(PRODUCTS_KEY, []);

        return Array.isArray(products)
            ? products
            : [];
    }

    function getProducts() {
        return getRawProducts().map(normaliseProduct);
    }

    function getProduct(productId) {
        const product = getRawProducts().find(
            function (item) {
                return String(item.id) === String(productId);
            }
        );

        return product
            ? normaliseProduct(product)
            : null;
    }

    function getProductPrice(product, currency) {
        currency = currency || getCurrency();

        if (!isValidCurrency(currency)) return null;

        return getRawCurrencyPrice(product, currency);
    }

    function saveProducts(products) {
        if (!Array.isArray(products)) return false;

        const cleanProducts = products.map(function (product) {
            const copy = Object.assign({}, product);

            copy.price_zmw = getRawCurrencyPrice(
                product,
                "ZMW"
            );

            copy.price_zar = getRawCurrencyPrice(
                product,
                "ZAR"
            );

            copy.price = copy.price_zmw;

            delete copy.priceZMW;
            delete copy.priceZAR;
            delete copy.zmw_price;
            delete copy.zar_price;
            delete copy.zmwPrice;
            delete copy.zarPrice;

            return copy;
        });

        return writeStorage(PRODUCTS_KEY, cleanProducts);
    }

    function addProduct(product) {
        if (
            !product ||
            typeof product.name !== "string" ||
            !product.name.trim()
        ) {
            return false;
        }

        const products = getRawProducts();

        const newProduct = Object.assign({}, product);

        newProduct.id = newProduct.id ||
            "local-" + Date.now() + "-" +
            Math.random().toString(36).slice(2, 8);

        if (
            products.some(function (item) {
                return String(item.id) === String(newProduct.id);
            })
        ) {
            return false;
        }

        newProduct.name = newProduct.name.trim();

        newProduct.price_zmw = getRawCurrencyPrice(
            newProduct,
            "ZMW"
        );

        newProduct.price_zar = getRawCurrencyPrice(
            newProduct,
            "ZAR"
        );

        newProduct.price = newProduct.price_zmw;

        products.push(newProduct);

        return saveProducts(products);
    }

    function updateProduct(productId, updatedData) {
        if (!updatedData || typeof updatedData !== "object") {
            return false;
        }

        const products = getRawProducts();

        const index = products.findIndex(function (product) {
            return String(product.id) === String(productId);
        });

        if (index === -1) return false;

        const existing = products[index];

        const updated = Object.assign(
            {},
            existing,
            updatedData
        );

        const zmwFields = [
            "price_zmw",
            "priceZMW",
            "zmw_price",
            "zmwPrice",
            "price"
        ];

        const zarFields = [
            "price_zar",
            "priceZAR",
            "zar_price",
            "zarPrice"
        ];

        if (
            zmwFields.some(function (field) {
                return hasOwn(updatedData, field);
            })
        ) {
            updated.price_zmw = getRawCurrencyPrice(
                updatedData,
                "ZMW"
            );
        }

        if (
            zarFields.some(function (field) {
                return hasOwn(updatedData, field);
            })
        ) {
            updated.price_zar = getRawCurrencyPrice(
                updatedData,
                "ZAR"
            );
        }

        updated.price = updated.price_zmw;

        products[index] = updated;

        return saveProducts(products);
    }

    function deleteProduct(productId) {
        const products = getRawProducts();

        const updated = products.filter(function (product) {
            return String(product.id) !== String(productId);
        });

        if (updated.length === products.length) {
            return false;
        }

        if (!saveProducts(updated)) return false;

        const cart = getRawCart().filter(function (item) {
            return String(item.id) !== String(productId);
        });

        saveCart(cart);

        return true;
    }

    /* =====================================================
       5. CART STORAGE
    ===================================================== */

    function getRawCart() {
        const cart = readStorage(CART_KEY, []);

        return Array.isArray(cart) ? cart : [];
    }

    function repriceCartItems(cart, currency) {
        currency = currency || getCurrency();

        const products = getRawProducts();

        return cart.map(function (item) {
            const product = products.find(
                function (entry) {
                    return String(entry.id) === String(item.id);
                }
            );

            if (!product) {
                return Object.assign({}, item, {
                    currency: currency,
                    price: null,
                    priceUnavailable: true,
                    stock: null,
                    stockConfirmed: false,
                    availabilityStatus: "Product unavailable"
                });
            }

            const currentPrice = getRawCurrencyPrice(
                product,
                currency
            );

            const stock = getStockQuantity(product);
            const confirmed = isStockConfirmed(product);

            return Object.assign({}, item, {
                id: product.id,
                name: product.name || item.name || "Product",
                image: product.image || item.image || "",
                category: product.category || item.category || "",
                currency: currency,
                price: currentPrice,
                priceUnavailable: currentPrice === null,
                stock: stock,
                stockConfirmed: confirmed,
                availabilityStatus: confirmed
                    ? (
                        stock > 0
                            ? "Available"
                            : "Out of stock"
                    )
                    : "Availability unconfirmed"
            });
        });
    }

    function getCart() {
        const cart = getRawCart();

        return repriceCartItems(
            cart,
            getCurrency()
        ).map(function (item) {
            item.quantity =
                validQuantity(item.quantity) || 1;

            return item;
        });
    }

    function saveCart(cart) {
        if (!Array.isArray(cart)) return false;

        const currency = getCurrency();

        const cleanCart = cart.map(function (item) {
            return {
                id: item.id,
                name: item.name || "Product",
                image: item.image || "",
                category: item.category || "",
                quantity: validQuantity(item.quantity) || 1,
                currency: currency
            };
        });

        const repriced = repriceCartItems(
            cleanCart,
            currency
        );

        const saved = writeStorage(
            CART_KEY,
            repriced
        );

        if (saved) {
            updateCartCount();
            renderCartDrawer();
        }

        return saved;
    }

    function repriceCart() {
        return saveCart(getRawCart());
    }

    /* =====================================================
       6. CURRENCY SELECTION
    ===================================================== */

    function setCurrency(currency) {
        if (!isValidCurrency(currency)) {
            return false;
        }

        try {
            localStorage.setItem(
                CURRENCY_KEY,
                currency
            );

            repriceCart();

            updateCartCount();
            renderCartDrawer();

            return true;

        } catch (error) {
            console.error("Currency update failed:", error);
            return false;
        }
    }

    /* =====================================================
       7. ADD TO CART
    ===================================================== */

    function addToCart(productId, quantity) {
        const product = getRawProducts().find(
            function (item) {
                return String(item.id) === String(productId);
            }
        );

        if (!product) {
            alert("This product could not be found.");
            return false;
        }

        const currency = getCurrency();

        const price = getRawCurrencyPrice(
            product,
            currency
        );

        if (price === null) {
            alert(
                "This product does not have a price in " +
                currency + ". Please choose another currency " +
                "or contact the shop."
            );

            return false;
        }

        const amount = validQuantity(quantity || 1);

        if (!amount) {
            alert("Please enter a valid quantity.");
            return false;
        }

        const confirmed = isStockConfirmed(product);
        const stock = getStockQuantity(product);

        if (confirmed && stock <= 0) {
            alert("This product is currently out of stock.");
            return false;
        }

        const cart = getCart();

        const existing = cart.find(function (item) {
            return String(item.id) === String(productId);
        });

        const existingQuantity = existing
            ? Number(existing.quantity)
            : 0;

        if (
            confirmed &&
            existingQuantity + amount > stock
        ) {
            alert(
                "Only " + stock +
                " unit(s) are currently available."
            );

            return false;
        }

        if (existing) {
            existing.quantity += amount;

        } else {
            cart.push({
                id: product.id,
                name: product.name,
                image: product.image || "",
                category: product.category || "",
                quantity: amount,
                currency: currency
            });
        }

        if (!saveCart(cart)) {
            alert("Your cart could not be updated.");
            return false;
        }

        // Record only after the cart save succeeds.
        if (window.SinkzAnalytics && typeof window.SinkzAnalytics.track === "function") {
            window.SinkzAnalytics.track("add_to_cart", {
                product_id: String(product.id),
                product_name: String(product.name || ""),
                category: String(product.category || "")
            });
        }

        openCartDrawer();

        return true;
    }

    /* =====================================================
       8. CART TOTALS AND VALIDATION
    ===================================================== */

    function getCartSummary() {
        const cart = getCart();

        let total = 0;
        let itemCount = 0;
        let unavailableCount = 0;
        let unverifiedStockCount = 0;
        let insufficientStockCount = 0;

        cart.forEach(function (item) {
            const quantity = Number(item.quantity) || 0;

            itemCount += quantity;

            if (
                item.priceUnavailable ||
                item.price === null ||
                !Number.isFinite(Number(item.price))
            ) {
                unavailableCount++;

            } else {
                total += Number(item.price) * quantity;
            }

            if (!item.stockConfirmed) {
                unverifiedStockCount++;

            } else if (
                item.stock === null ||
                item.stock < quantity
            ) {
                insufficientStockCount++;
            }
        });

        const hasUnavailablePrices = unavailableCount > 0;

        const hasStockIssues =
            unverifiedStockCount > 0 ||
            insufficientStockCount > 0;

        return {
            currency: getCurrency(),
            total: hasUnavailablePrices ? null : total,
            itemCount: itemCount,
            unavailableCount: unavailableCount,
            unverifiedStockCount: unverifiedStockCount,
            insufficientStockCount: insufficientStockCount,
            hasUnavailablePrices: hasUnavailablePrices,
            hasStockIssues: hasStockIssues,
            canCheckout:
                cart.length > 0 &&
                !hasUnavailablePrices &&
                !hasStockIssues
        };
    }

    function getCartTotal() {
        const summary = getCartSummary();

        return summary.total === null
            ? 0
            : summary.total;
    }

    function clearCart() {
        const saved = writeStorage(CART_KEY, []);

        updateCartCount();
        renderCartDrawer();

        return saved;
    }

    /* =====================================================
       9. CART COUNT
    ===================================================== */

    function updateCartCount() {
        const cart = getCart();

        const count = cart.reduce(
            function (total, item) {
                return total + (
                    Number(item.quantity) || 0
                );
            },
            0
        );

        document.querySelectorAll(
            "#cartCount, .cart-count, [data-cart-count]"
        ).forEach(function (element) {
            element.textContent = count;
        });

        return count;
    }

    /* =====================================================
       10. CART DRAWER CREATION
    ===================================================== */

    function createCartDrawer() {
        if (document.getElementById("cartDrawer")) {
            return;
        }

        const overlay = document.createElement("div");

        overlay.id = "cartOverlay";
        overlay.className = "cart-overlay";

        const drawer = document.createElement("aside");

        drawer.id = "cartDrawer";
        drawer.className = "cart-drawer";

        drawer.setAttribute(
            "aria-label",
            "Shopping cart"
        );

        drawer.innerHTML = `
            <div class="cart-drawer-header">
                <h2>Your Cart</h2>

                <button type="button"
                    id="closeCart"
                    aria-label="Close cart">×</button>
            </div>

            <div id="sinkzDrawerCurrencyNote"
                class="muted"></div>

            <div id="sinkzDrawerItems"
                class="cart-drawer-items"></div>

            <div class="cart-drawer-footer">
                <div class="cart-drawer-total">
                    <strong>Subtotal</strong>
                    <strong id="sinkzDrawerSubtotal">K0.00</strong>
                </div>

                <a href="cart.html"
                    class="btn btn-secondary">
                    View Cart
                </a>

                <a href="checkout.html"
                    class="btn btn-primary"
                    id="sinkzDrawerCheckout">
                    Proceed to Checkout
                </a>

                <button type="button"
                    id="continueShopping"
                    class="btn btn-outline">
                    Continue Shopping
                </button>

                <p id="sinkzDrawerCheckoutNote"
                    class="muted"
                    aria-live="polite"></p>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        overlay.addEventListener(
            "click",
            closeCartDrawer
        );

        drawer.addEventListener("click", function (event) {
            const target = event.target;

            if (target.id === "closeCart") {
                closeCartDrawer();
                return;
            }

            if (target.id === "continueShopping") {
                closeCartDrawer();
                return;
            }

            const removeButton = target.closest(
                "[data-drawer-remove]"
            );

            if (removeButton) {
                removeCartItem(
                    removeButton.dataset.drawerRemove
                );
                return;
            }

            const quantityButton = target.closest(
                "[data-drawer-quantity]"
            );

            if (quantityButton) {
                changeDrawerQuantity(
                    quantityButton.dataset.productId,
                    Number(
                        quantityButton.dataset.drawerQuantity
                    )
                );
            }
        });
    }

    /* =====================================================
       11. CART DRAWER DISPLAY
    ===================================================== */

    function renderCartDrawer() {
        const drawerItems = document.getElementById(
            "sinkzDrawerItems"
        );

        const drawerSubtotal = document.getElementById(
            "sinkzDrawerSubtotal"
        );

        const currencyNote = document.getElementById(
            "sinkzDrawerCurrencyNote"
        );

        if (!drawerItems || !drawerSubtotal) return;

        const cart = getCart();
        const currency = getCurrency();

        drawerItems.innerHTML = "";

        if (currencyNote) {
            currencyNote.textContent =
                "Currency: " + currency +
                " — " + getCurrencyName(currency);
        }

        if (cart.length === 0) {
            drawerItems.innerHTML =
                '<p class="muted">Your cart is empty.</p>';

            drawerSubtotal.textContent =
                formatPrice(0, currency);

            updateDrawerCheckout(false, "Your cart is empty.");

            return;
        }

        let subtotal = 0;
        let unavailablePrices = false;

        cart.forEach(function (item) {
            const row = document.createElement("div");

            row.className = "cart-drawer-item";

            const details = document.createElement("div");

            const name = document.createElement("strong");

            name.textContent = item.name;

            const quantity = document.createElement("p");

            quantity.className = "muted";
            quantity.textContent =
                "Quantity: " + item.quantity;

            const amount = document.createElement("p");

            amount.className = "muted";

            if (
                item.priceUnavailable ||
                item.price === null
            ) {
                unavailablePrices = true;

                amount.textContent =
                    "Price unavailable in " + currency;

            } else {
                const lineTotal =
                    Number(item.price) *
                    Number(item.quantity);

                subtotal += lineTotal;

                amount.textContent =
                    formatPrice(lineTotal, currency);
            }

            const availability = document.createElement("p");

            availability.className = "muted";
            availability.textContent =
                item.availabilityStatus;

            details.appendChild(name);
            details.appendChild(quantity);
            details.appendChild(amount);
            details.appendChild(availability);

            const actions = document.createElement("div");

            actions.className =
                "cart-drawer-item-actions";

            const decrease = document.createElement("button");

            decrease.type = "button";
            decrease.textContent = "−";
            decrease.dataset.productId = item.id;
            decrease.dataset.drawerQuantity = "-1";
            decrease.setAttribute(
                "aria-label",
                "Decrease quantity"
            );

            const increase = document.createElement("button");

            increase.type = "button";
            increase.textContent = "+";
            increase.dataset.productId = item.id;
            increase.dataset.drawerQuantity = "1";
            increase.setAttribute(
                "aria-label",
                "Increase quantity"
            );

            if (
                item.stockConfirmed &&
                item.stock <= item.quantity
            ) {
                increase.disabled = true;
            }

            const remove = document.createElement("button");

            remove.type = "button";
            remove.textContent = "Remove";
            remove.dataset.drawerRemove = item.id;

            actions.appendChild(decrease);
            actions.appendChild(increase);
            actions.appendChild(remove);

            row.appendChild(details);
            row.appendChild(actions);

            drawerItems.appendChild(row);
        });

        drawerSubtotal.textContent = unavailablePrices
            ? "Price unavailable"
            : formatPrice(subtotal, currency);

        const summary = getCartSummary();

        let reason = "";

        if (summary.hasUnavailablePrices) {
            reason = "Some products have no price in " +
                currency + ".";

        } else if (summary.unverifiedStockCount > 0) {
            reason = "Stock availability has not been verified.";

        } else if (summary.insufficientStockCount > 0) {
            reason = "One or more quantities exceed available stock.";
        }

        updateDrawerCheckout(
            summary.canCheckout,
            reason
        );
    }

    function updateDrawerCheckout(enabled, reason) {
        const checkoutLink = document.getElementById(
            "sinkzDrawerCheckout"
        );

        const note = document.getElementById(
            "sinkzDrawerCheckoutNote"
        );

        if (checkoutLink) {
            checkoutLink.style.pointerEvents =
                enabled ? "" : "none";

            checkoutLink.style.opacity =
                enabled ? "" : "0.5";

            checkoutLink.setAttribute(
                "aria-disabled",
                enabled ? "false" : "true"
            );

            checkoutLink.setAttribute(
                "tabindex",
                enabled ? "0" : "-1"
            );
        }

        if (note) {
            note.textContent = reason || "";
        }
    }

    /* =====================================================
       12. DRAWER QUANTITY AND REMOVAL
    ===================================================== */

    function changeDrawerQuantity(productId, change) {
        const cart = getCart();

        const item = cart.find(function (entry) {
            return String(entry.id) === String(productId);
        });

        if (!item) return;

        const newQuantity = item.quantity + change;

        if (newQuantity <= 0) {
            removeCartItem(productId);
            return;
        }

        if (
            item.stockConfirmed &&
            newQuantity > item.stock
        ) {
            alert(
                "Only " + item.stock +
                " unit(s) are currently available."
            );
            return;
        }

        item.quantity = newQuantity;

        saveCart(cart);
    }

    function removeCartItem(productId) {
        const cart = getCart().filter(function (item) {
            return String(item.id) !== String(productId);
        });

        return saveCart(cart);
    }

    /* =====================================================
       13. OPEN AND CLOSE DRAWER
    ===================================================== */

    function openCartDrawer() {
        createCartDrawer();
        renderCartDrawer();

        const drawer = document.getElementById("cartDrawer");
        const overlay = document.getElementById("cartOverlay");

        if (drawer) drawer.classList.add("open");
        if (overlay) overlay.classList.add("open");

        document.body.classList.add("cart-drawer-open");
    }

    function closeCartDrawer() {
        const drawer = document.getElementById("cartDrawer");
        const overlay = document.getElementById("cartOverlay");

        if (drawer) drawer.classList.remove("open");
        if (overlay) overlay.classList.remove("open");

        document.body.classList.remove("cart-drawer-open");
    }

    /* =====================================================
       14. PRODUCT CARD CREATION
    ===================================================== */

    function createProductCard(product) {
        const card = document.createElement("article");

        card.className = "product-card";

        const image = document.createElement("img");

        image.className = "product-image";
        image.alt = product.name || "Product";

        const productImages = Array.isArray(product.images)
            ? product.images
            : [];

        image.src = product.image ||
            productImages[0] ||
            "https://placehold.co/600x700?text=SINKZCLOSETS";

        image.onerror = function () {
            this.onerror = null;
            this.src =
                "https://placehold.co/600x700?text=SINKZCLOSETS";
        };

        const details = document.createElement("div");

        details.className = "product-info";

        const name = document.createElement("h3");

        name.textContent = product.name || "Product";

        const category = document.createElement("p");

        category.className = "muted";
        category.textContent = product.category || "";

        const price = document.createElement("p");

        price.className = "product-price";

        price.textContent = product.priceUnavailable
            ? "Price unavailable in " + getCurrency()
            : formatPrice(product.price);

        const availability = document.createElement("p");

        availability.className = "muted";

        availability.textContent =
            product.availabilityStatus ||
            "Availability unconfirmed";

        const actions = document.createElement("div");

        actions.className = "product-actions";

        const view = document.createElement("a");

        view.href = "product.html?id=" +
            encodeURIComponent(product.id);

        view.className = "btn btn-secondary";
        view.textContent = "View Product";

        const add = document.createElement("button");

        add.type = "button";
        add.className = "btn btn-primary";

        add.textContent = product.priceUnavailable
            ? "Price unavailable"
            : "Add to Cart";

        add.disabled = Boolean(product.priceUnavailable);

        if (
            product.stockConfirmed &&
            product.stock <= 0
        ) {
            add.disabled = true;
            add.textContent = "Out of Stock";
        }

        add.addEventListener("click", function () {
            addToCart(product.id, 1);
        });

        actions.appendChild(view);
        actions.appendChild(add);

        details.appendChild(name);
        details.appendChild(category);
        details.appendChild(price);
        details.appendChild(availability);
        details.appendChild(actions);

        card.appendChild(image);
        card.appendChild(details);

        return card;
    }

    /* =====================================================
       15. FEATURED PRODUCTS
    ===================================================== */

    function displayFeaturedProducts() {
        const container =
            document.getElementById("featuredProducts") ||
            document.getElementById("featured-products");

        if (!container) return;

        container.innerHTML = "";

        const featured = getProducts().filter(
            function (product) {
                return product.featured === true;
            }
        );

        if (featured.length === 0) {
            container.textContent =
                "No featured products are currently available.";
            return;
        }

        featured.forEach(function (product) {
            container.appendChild(
                createProductCard(product)
            );
        });
    }

    /* =====================================================
       16. CART DRAWER TRIGGERS
    ===================================================== */

    function attachCartTriggers() {
        document.querySelectorAll(
            "#cartButton, .cart-button, [data-open-cart]"
        ).forEach(function (button) {
            button.addEventListener("click", function (event) {
                event.preventDefault();
                openCartDrawer();
            });
        });
    }

    /* =====================================================
       17. MOBILE NAVIGATION
    ===================================================== */

    function initialiseMobileMenu() {
        const menuButton =
            document.getElementById("menuToggle") ||
            document.querySelector(".menu-toggle");

        const navigation =
            document.getElementById("mainNav") ||
            document.querySelector(".main-nav");

        if (!menuButton || !navigation) return;

        if (menuButton.dataset.sinkzMenuReady === "true") {
            return;
        }

        menuButton.dataset.sinkzMenuReady = "true";

        menuButton.addEventListener("click", function () {
            const isOpen =
                navigation.classList.toggle("active");

            menuButton.classList.toggle("active", isOpen);

            menuButton.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        });
    }

    /* =====================================================
       18. FOOTER YEAR
    ===================================================== */

    function updateFooterYear() {
        document.querySelectorAll(
            "#currentYear, .current-year"
        ).forEach(function (element) {
            element.textContent =
                new Date().getFullYear();
        });
    }

    /* =====================================================
       19. REMOVE OLD NAVIGATION CURRENCY SELECTORS
    ===================================================== */

    function removeOldNavigationCurrencySelector() {
        document.querySelectorAll(
            "#currencySelector, " +
            "#currency-switcher, " +
            ".currency-selector, " +
            ".nav-currency-selector"
        ).forEach(function (element) {
            element.remove();
        });
    }

    /* =====================================================
       20. PUBLIC STORE API
    ===================================================== */

    window.SinkzStore = {
        // Catalogue
        getProducts: getProducts,
        getProduct: getProduct,
        getProductPrice: getProductPrice,
        saveProducts: saveProducts,
        addProduct: addProduct,
        updateProduct: updateProduct,
        deleteProduct: deleteProduct,

        // Currency
        getCurrency: getCurrency,
        setCurrency: setCurrency,
        getCurrencyName: getCurrencyName,
        getCurrencySymbol: getCurrencySymbol,
        formatPrice: formatPrice,

        // Stock
        getStockQuantity: getStockQuantity,
        isStockConfirmed: isStockConfirmed,

        // Cart
        getCart: getCart,
        saveCart: saveCart,
        addToCart: addToCart,
        removeCartItem: removeCartItem,
        clearCart: clearCart,
        repriceCart: repriceCart,
        getCartTotal: getCartTotal,
        getCartSummary: getCartSummary,

        // Cart display
        updateCartCount: updateCartCount,
        openCartDrawer: openCartDrawer,
        closeCartDrawer: closeCartDrawer,
        renderCartDrawer: renderCartDrawer,

        // Product display
        createProductCard: createProductCard,
        displayFeaturedProducts: displayFeaturedProducts,
        refreshProductsFromSupabase: refreshProductsFromSupabase
    };

    /* =====================================================
       21. LIVE SUPABASE PRODUCT CATALOGUE
    ===================================================== */

    async function refreshProductsFromSupabase() {
        const client = getSupabaseClient();

        if (!client) {
            console.warn(
                "SINKZCLOSETS: Supabase client unavailable; using cached products."
            );
            return false;
        }

        try {
            const { data, error } = await client
                .from("products")
                .select("*")
                .eq("status", "active")
                .order("created_at", { ascending: false });

            if (error) throw error;

            const liveProducts = (data || []).map(function (product) {
                let images = [];

                if (Array.isArray(product.images)) {
                    images = product.images;
                } else if (
                    typeof product.images === "string" &&
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

                images = images
                    .filter(function (url) {
                        return typeof url === "string" && url.trim();
                    })
                    .map(function (url) {
                        return url.trim();
                    });

                const primaryImage =
                    typeof product.image === "string" &&
                    product.image.trim()
                        ? product.image.trim()
                        : (images[0] || "");

                if (
                    primaryImage &&
                    !images.includes(primaryImage)
                ) {
                    images.unshift(primaryImage);
                }

                return Object.assign({}, product, {
                    price_zmw:
                        product.price_zmw !== undefined &&
                        product.price_zmw !== null
                            ? product.price_zmw
                            : product.price,
                    image: primaryImage,
                    images: images
                });
            });

            if (!writeStorage(PRODUCTS_KEY, liveProducts)) {
                throw new Error(
                    "The latest catalogue could not be saved to the local cache."
                );
            }

            updateCartCount();
            renderCartDrawer();
            displayFeaturedProducts();

            window.dispatchEvent(
                new CustomEvent("sinkz:products-updated", {
                    detail: {
                        source: "supabase",
                        count: liveProducts.length
                    }
                })
            );

            console.info(
                "SINKZCLOSETS: Loaded " +
                liveProducts.length +
                " active products from Supabase."
            );

            return true;

        } catch (error) {
            console.error(
                "SINKZCLOSETS: Live product loading failed; cached catalogue retained.",
                error
            );

            return false;
        }
    }

    /* =====================================================
       21. INITIALISE STORE
    ===================================================== */

    function initialiseStore() {
        removeOldNavigationCurrencySelector();

        createCartDrawer();
        attachCartTriggers();
        initialiseMobileMenu();
        updateFooterYear();

        updateCartCount();
        renderCartDrawer();
        displayFeaturedProducts();

        // Load the public live catalogue after the page is ready.
        // Cached products remain visible if the network is unavailable.
        refreshProductsFromSupabase();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialiseStore,
            { once: true }
        );

    } else {
        initialiseStore();
    }

})();
