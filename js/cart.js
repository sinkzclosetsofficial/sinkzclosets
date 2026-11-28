
/* =====================================================
   SINKZCLOSETS — SHOPPING CART
   Complete replacement
   Currency: ZMW / ZAR
   Stock, quantity and checkout validation
===================================================== */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {

        // -------------------------------------------------
        // 1. INITIALISE
        // -------------------------------------------------

        const store = window.SinkzStore;

        const cartItemsContainer =
            document.getElementById("cartItems");

        const emptyCartMessage =
            document.getElementById("emptyCart");

        const cartSummary =
            document.getElementById("cartSummary");

        const cartSubtotal =
            document.getElementById("cartSubtotal");

        if (!store || !cartItemsContainer) {
            console.error("SINKZCLOSETS: Cart could not initialise.");
            return;
        }

        let currencySelector = null;

        // -------------------------------------------------
        // 2. CURRENCY HELPERS
        // -------------------------------------------------

        function getCurrency() {
            try {
                return store.getCurrency() === "ZAR"
                    ? "ZAR"
                    : "ZMW";
            } catch (error) {
                return "ZMW";
            }
        }

        function formatPrice(amount) {
            const number = Number(amount);

            if (
                amount === null ||
                amount === undefined ||
                amount === "" ||
                !Number.isFinite(number) ||
                number < 0
            ) {
                return "Price unavailable";
            }

            return store.formatPrice(number, getCurrency());
        }

        function isValidPrice(item) {
            if (
                !item ||
                item.priceUnavailable === true ||
                item.price === null ||
                item.price === undefined ||
                item.price === ""
            ) {
                return false;
            }

            const price = Number(item.price);

            return Number.isFinite(price) && price >= 0;
        }

        // -------------------------------------------------
        // 3. PRODUCT AND STOCK HELPERS
        // -------------------------------------------------

        function getProducts() {
            try {
                const products = store.getProducts();

                return Array.isArray(products)
                    ? products
                    : [];
            } catch (error) {
                console.error("Could not retrieve products:", error);
                return [];
            }
        }

        function findProduct(productId) {
            return getProducts().find(function (product) {
                return String(product.id) === String(productId);
            }) || null;
        }

        function getConfirmedStock(product) {
            if (
                !product ||
                product.stock === null ||
                product.stock === undefined ||
                product.stock === ""
            ) {
                return null;
            }

            const stock = Number(product.stock);

            if (!Number.isFinite(stock) || stock < 0) {
                return null;
            }

            return stock;
        }

        function getStockProblem(item) {
            const product = findProduct(item.id);

            if (!product) {
                return "Product availability could not be confirmed.";
            }

            const stock = getConfirmedStock(product);

            if (stock === null) {
                return "Stock availability is unconfirmed.";
            }

            if (stock === 0) {
                return "This product is out of stock.";
            }

            if (Number(item.quantity) > stock) {
                return "Only " + stock + " item(s) are currently available.";
            }

            return "";
        }

        // -------------------------------------------------
        // 4. CART VALIDATION
        // -------------------------------------------------

        function getCartProblems(cart) {
            const problems = [];

            if (!cart.length) {
                problems.push("Your cart is empty.");
                return problems;
            }

            cart.forEach(function (item) {

                if (!isValidPrice(item)) {
                    problems.push(
                        (item.name || "A product") +
                        " has no price in " + getCurrency() + "."
                    );
                }

                const stockProblem = getStockProblem(item);

                if (stockProblem) {
                    problems.push(
                        (item.name || "A product") +
                        ": " + stockProblem
                    );
                }
            });

            return problems;
        }

        // -------------------------------------------------
        // 5. CURRENCY SELECTOR
        // -------------------------------------------------

        function createCurrencySelector() {

            const existing = document.getElementById(
                "cartCurrencySelector"
            );

            if (existing) {
                currencySelector = existing;
                currencySelector.value = getCurrency();
                return;
            }

            const wrapper = document.createElement("section");

            wrapper.className = "cart-currency-choice";
            wrapper.id = "cartCurrencyChoice";

            const label = document.createElement("label");

            label.htmlFor = "cartCurrencySelector";
            label.textContent = "Choose your shopping currency";

            currencySelector = document.createElement("select");

            currencySelector.id = "cartCurrencySelector";
            currencySelector.name = "cartCurrencySelector";

            [
                {
                    value: "ZMW",
                    text: "ZMW — Zambian Kwacha"
                },
                {
                    value: "ZAR",
                    text: "ZAR — South African Rand"
                }
            ].forEach(function (optionData) {

                const option = document.createElement("option");

                option.value = optionData.value;
                option.textContent = optionData.text;

                currencySelector.appendChild(option);
            });

            currencySelector.value = getCurrency();

            const note = document.createElement("p");

            note.className = "muted";

            note.textContent =
                "ZMW and ZAR prices are entered independently. " +
                "No automatic currency conversion is applied.";

            currencySelector.addEventListener("change", function () {

                const selected = currencySelector.value;

                if (selected !== "ZMW" && selected !== "ZAR") {
                    currencySelector.value = getCurrency();
                    return;
                }

                try {

                    const result = store.setCurrency(selected);

                    if (result === false) {
                        throw new Error("Currency change rejected.");
                    }

                    renderCart();

                } catch (error) {

                    console.error("Currency change failed:", error);

                    currencySelector.value = getCurrency();

                    alert(
                        "Currency could not be changed. Please try again."
                    );
                }
            });

            wrapper.appendChild(label);
            wrapper.appendChild(currencySelector);
            wrapper.appendChild(note);

            cartItemsContainer.parentNode.insertBefore(
                wrapper,
                cartItemsContainer
            );
        }

        // -------------------------------------------------
        // 6. CHECKOUT CONTROL
        // -------------------------------------------------

        function updateCheckoutAvailability(cart) {

            const problems = getCartProblems(cart);

            const canCheckout = problems.length === 0;

            document.querySelectorAll(
                'a[href*="checkout.html"]'
            ).forEach(function (link) {

                link.setAttribute(
                    "aria-disabled",
                    canCheckout ? "false" : "true"
                );

                link.classList.toggle(
                    "checkout-unavailable",
                    !canCheckout
                );

                if (!canCheckout) {
                    link.title = problems.join(" ");
                } else {
                    link.removeAttribute("title");
                }
            });

            return {
                allowed: canCheckout,
                problems: problems
            };
        }

        // -------------------------------------------------
        // 7. CART WARNINGS
        // -------------------------------------------------

        function showCartWarning(problems) {

            let warning = document.getElementById(
                "cartValidationWarning"
            );

            if (!warning) {

                warning = document.createElement("div");

                warning.id = "cartValidationWarning";
                warning.className = "cart-currency-warning";

                cartSummary.appendChild(warning);
            }

            warning.replaceChildren();

            const heading = document.createElement("strong");

            heading.textContent =
                "Please resolve these issues before checkout:";

            const list = document.createElement("ul");

            problems.forEach(function (problem) {

                const entry = document.createElement("li");

                entry.textContent = problem;

                list.appendChild(entry);
            });

            warning.appendChild(heading);
            warning.appendChild(list);
        }

        function removeCartWarning() {

            const warning = document.getElementById(
                "cartValidationWarning"
            );

            if (warning) {
                warning.remove();
            }
        }

        // -------------------------------------------------
        // 8. CHANGE QUANTITY
        // -------------------------------------------------

        function changeQuantity(productId, change) {

            const cart = store.getCart();

            const item = cart.find(function (entry) {
                return String(entry.id) === String(productId);
            });

            if (!item) return;

            const newQuantity =
                Number(item.quantity) + change;

            if (newQuantity <= 0) {
                removeItem(productId);
                return;
            }

            // Only block increases. Customers can still reduce
            // quantities or remove items when stock is unknown.

            if (change > 0) {

                const product = findProduct(productId);
                const stock = getConfirmedStock(product);

                if (stock === null) {

                    alert(
                        "Stock availability has not been confirmed. " +
                        "You cannot increase this quantity."
                    );

                    return;
                }

                if (newQuantity > stock) {

                    alert(
                        "Only " + stock +
                        " item(s) are currently available."
                    );

                    return;
                }
            }

            item.quantity = newQuantity;

            store.saveCart(cart);

            renderCart();
        }

        // -------------------------------------------------
        // 9. REMOVE PRODUCT
        // -------------------------------------------------

        function removeItem(productId) {

            const cart = store.getCart();

            const updatedCart = cart.filter(function (item) {
                return String(item.id) !== String(productId);
            });

            store.saveCart(updatedCart);

            renderCart();
        }

        // -------------------------------------------------
        // 10. RENDER CART ITEMS
        // -------------------------------------------------

        function renderCart() {

            const cart = store.getCart();

            const currency = getCurrency();

            cartItemsContainer.replaceChildren();

            if (currencySelector) {
                currencySelector.value = currency;
            }

            if (!Array.isArray(cart) || cart.length === 0) {

                if (emptyCartMessage) {
                    emptyCartMessage.hidden = false;
                }

                if (cartSummary) {
                    cartSummary.hidden = true;
                }

                if (cartSubtotal) {
                    cartSubtotal.textContent = formatPrice(0);
                }

                removeCartWarning();

                updateCheckoutAvailability([]);

                store.updateCartCount();

                return;
            }

            if (emptyCartMessage) {
                emptyCartMessage.hidden = true;
            }

            if (cartSummary) {
                cartSummary.hidden = false;
            }

            let subtotal = 0;
            let hasUnavailablePrice = false;

            cart.forEach(function (item) {

                const quantity = Number(item.quantity);

                const safeQuantity =
                    Number.isInteger(quantity) && quantity > 0
                        ? quantity
                        : 1;

                const row = document.createElement("div");

                row.className = "cart-row";

                const details = document.createElement("div");

                const name = document.createElement("strong");

                name.textContent = item.name || "Product";

                const variantText = document.createElement("p");
                variantText.className = "muted";
                const variantLabels = [];
                if (item.size) variantLabels.push("Size: " + item.size);
                if (item.colour) variantLabels.push("Colour: " + item.colour);
                variantText.textContent = variantLabels.join(" · ");

                const priceText = document.createElement("p");

                priceText.className = "muted";

                const linePrice = document.createElement("div");

                linePrice.className = "line-price";

                if (!isValidPrice(item)) {

                    hasUnavailablePrice = true;

                    priceText.textContent =
                        "Price unavailable in " + currency;

                    linePrice.textContent = "Price unavailable";

                    row.classList.add("cart-price-unavailable");

                } else {

                    const price = Number(item.price);

                    const lineTotal = price * safeQuantity;

                    subtotal += lineTotal;

                    priceText.textContent =
                        formatPrice(price) + " each";

                    linePrice.textContent =
                        formatPrice(lineTotal);
                }

                // Stock warning

                const stockProblem = getStockProblem(item);

                if (stockProblem) {

                    const stockWarning =
                        document.createElement("small");

                    stockWarning.className = "cart-stock-warning";

                    stockWarning.textContent = stockProblem;

                    details.appendChild(stockWarning);

                    row.classList.add("cart-stock-warning-row");
                }

                // Quantity controls

                const controls = document.createElement("div");

                controls.className = "cart-quantity-controls";

                const decrease = document.createElement("button");

                decrease.type = "button";
                decrease.textContent = "−";
                decrease.setAttribute(
                    "aria-label",
                    "Decrease quantity"
                );

                decrease.addEventListener("click", function () {
                    changeQuantity(item.id, -1);
                });

                const quantityText = document.createElement("span");

                quantityText.textContent = safeQuantity;

                const increase = document.createElement("button");

                increase.type = "button";
                increase.textContent = "+";
                increase.setAttribute(
                    "aria-label",
                    "Increase quantity"
                );

                increase.addEventListener("click", function () {
                    changeQuantity(item.id, 1);
                });

                controls.appendChild(decrease);
                controls.appendChild(quantityText);
                controls.appendChild(increase);

                // Remove button

                const remove = document.createElement("button");

                remove.type = "button";
                remove.className = "cart-remove";
                remove.textContent = "Remove";

                remove.addEventListener("click", function () {
                    removeItem(item.id);
                });

                details.appendChild(name);
                if (variantText.textContent) details.appendChild(variantText);
                details.appendChild(priceText);

                row.appendChild(details);
                row.appendChild(linePrice);
                row.appendChild(controls);
                row.appendChild(remove);

                cartItemsContainer.appendChild(row);
            });

            // Subtotal

            if (cartSubtotal) {

                cartSubtotal.textContent = hasUnavailablePrice
                    ? "Price unavailable"
                    : formatPrice(subtotal);
            }

            // Checkout validation

            const validation = updateCheckoutAvailability(cart);

            if (validation.problems.length > 0) {
                showCartWarning(validation.problems);
            } else {
                removeCartWarning();
            }

            store.updateCartCount();
        }

        // -------------------------------------------------
        // 11. CHECKOUT CLICK PROTECTION
        // -------------------------------------------------

        document.addEventListener("click", function (event) {

            const target = event.target;

            if (!(target instanceof Element)) return;

            const checkoutLink = target.closest(
                'a[href*="checkout.html"]'
            );

            if (!checkoutLink) return;

            const validation = updateCheckoutAvailability(
                store.getCart()
            );

            if (!validation.allowed) {

                event.preventDefault();

                alert(
                    "Checkout is not available yet:\n\n" +
                    validation.problems.join("\n")
                );
            }
        });

        // -------------------------------------------------
        // 12. REFRESH WHEN CURRENCY OR PRODUCTS CHANGE
        // -------------------------------------------------

        window.addEventListener(
            "sinkz:currency-changed",
            renderCart
        );

        window.addEventListener(
            "sinkz:products-updated",
            renderCart
        );

        window.addEventListener("storage", function (event) {

            if (
                event.key === "sinkz_currency" ||
                event.key === "sinkzclosets_cart" ||
                event.key === "sinkz_products"
            ) {
                renderCart();
            }
        });

        // -------------------------------------------------
        // 13. START CART
        // -------------------------------------------------

        createCurrencySelector();

        renderCart();

        window.SinkzCart = {
            refresh: renderCart
        };

        console.log("SINKZCLOSETS: Cart initialised.");

    });


})();