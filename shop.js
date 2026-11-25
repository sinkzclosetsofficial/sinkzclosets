
/* =====================================================
   SINKZCLOSETS — SHOP PAGE
   Complete shop functionality
   Search, categories, sorting, currency and cart
===================================================== */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {

        // =================================================
        // 1. INITIALISE
        // =================================================

        const store = window.SinkzStore;

        const productContainer =
            document.getElementById("shopProducts");

        const searchInput =
            document.getElementById("productSearch");

        const categoryFilter =
            document.getElementById("categoryFilter");

        const sortSelect =
            document.getElementById("sortProducts");

        const resultCount =
            document.getElementById("productResultCount");

        const noProductsMessage =
            document.getElementById("noProductsMessage");

        if (!productContainer || !store) {
            console.error(
                "SINKZCLOSETS: Shop could not initialise."
            );
            return;
        }

        // =================================================
        // 2. SAFE DATA HELPERS
        // =================================================

        function safeText(value) {
            if (value === null || value === undefined) {
                return "";
            }

            return String(value);
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

            return Number.isFinite(number) && number >= 0
                ? number
                : null;
        }

        // =================================================
        // 3. SELECTED CURRENCY
        // =================================================

        function getCurrency() {
            try {
                if (typeof store.getCurrency === "function") {
                    return store.getCurrency() === "ZAR"
                        ? "ZAR"
                        : "ZMW";
                }

                return localStorage.getItem("sinkz_currency") === "ZAR"
                    ? "ZAR"
                    : "ZMW";

            } catch (error) {
                return "ZMW";
            }
        }

        // =================================================
        // 4. CURRENCY-SPECIFIC PRODUCT PRICES
        // =================================================

        function getProductPrice(product) {

            if (!product) {
                return null;
            }

            if (getCurrency() === "ZAR") {
                return validPrice(product.price_zar);
            }

            const zmwPrice = validPrice(product.price_zmw);

            if (zmwPrice !== null) {
                return zmwPrice;
            }

            // Older products may use "price" for ZMW.
            return validPrice(product.price);
        }

        function formatProductPrice(product) {

            const price = getProductPrice(product);

            if (price === null) {
                return "Price unavailable";
            }

            return store.formatPrice(price);
        }

        // =================================================
        // 5. STOCK VALIDATION
        // =================================================

        function getStock(product) {

            if (
                !product ||
                product.stock === null ||
                product.stock === undefined ||
                product.stock === ""
            ) {
                return null;
            }

            const stock = Number(product.stock);

            if (
                !Number.isFinite(stock) ||
                stock < 0
            ) {
                return null;
            }

            return stock;
        }

        function getStockStatus(product) {

            const stock = getStock(product);

            if (stock === null) {
                return {
                    text: "Availability unconfirmed",
                    className: "stock-unknown",
                    available: false
                };
            }

            if (stock === 0) {
                return {
                    text: "Out of stock",
                    className: "out-of-stock",
                    available: false
                };
            }

            return {
                text: "In stock",
                className: "in-stock",
                available: true
            };
        }

        // =================================================
        // 6. LOAD PRODUCTS
        // =================================================

        function getProducts() {

            try {
                const products = store.getProducts();

                if (!Array.isArray(products)) {
                    return [];
                }

                return products.filter(function (product) {

                    return (
                        product &&
                        product.id !== undefined &&
                        product.id !== null
                    );

                });

            } catch (error) {

                console.error(
                    "SINKZCLOSETS: Product loading failed.",
                    error
                );

                return [];
            }
        }

        // =================================================
        // 7. PRODUCT SEARCH
        // =================================================

        function filterBySearch(products) {

            const searchTerm = searchInput
                ? searchInput.value.trim().toLowerCase()
                : "";

            if (!searchTerm) {
                return products;
            }

            return products.filter(function (product) {

                const searchableContent = [
                    product.name,
                    product.category,
                    product.description
                ]
                .map(safeText)
                .join(" ")
                .toLowerCase();

                return searchableContent.includes(searchTerm);
            });
        }

        // =================================================
        // 8. CATEGORY FILTER
        // =================================================

        function filterByCategory(products) {

            const selectedCategory = categoryFilter
                ? categoryFilter.value
                : "all";

            if (!selectedCategory || selectedCategory === "all") {
                return products;
            }

            return products.filter(function (product) {

                const category = safeText(
                    product.category
                );

                if (
                    selectedCategory === "Bags" ||
                    selectedCategory === "Bags & Accessories"
                ) {
                    return (
                        category === "Bags" ||
                        category === "Accessories" ||
                        category === "Bags & Accessories"
                    );
                }

                return category === selectedCategory;
            });
        }

        // =================================================
        // 9. PRODUCT SORTING
        // =================================================

        function sortProducts(products) {

            const option = sortSelect
                ? sortSelect.value
                : "default";

            const sorted = [...products];

            if (
                option === "low-high" ||
                option === "high-low"
            ) {

                sorted.sort(function (a, b) {

                    const priceA = getProductPrice(a);
                    const priceB = getProductPrice(b);

                    // Products without a selected-currency
                    // price remain at the bottom.

                    if (priceA === null && priceB === null) {
                        return 0;
                    }

                    if (priceA === null) {
                        return 1;
                    }

                    if (priceB === null) {
                        return -1;
                    }

                    return option === "low-high"
                        ? priceA - priceB
                        : priceB - priceA;
                });
            }

            if (option === "name") {

                sorted.sort(function (a, b) {

                    return safeText(a.name).localeCompare(
                        safeText(b.name)
                    );
                });
            }

            return sorted;
        }

        // =================================================
        // 10. PRODUCT IMAGE
        // =================================================

        function getProductImage(product) {

            if (product.image) {
                return product.image;
            }

            if (
                Array.isArray(product.images) &&
                product.images.length > 0
            ) {
                return product.images[0];
            }

            return "";
        }

        // =================================================
        // 11. CREATE PRODUCT CARD
        // =================================================

        function createProductCard(product) {

            const card = document.createElement("article");
            card.className = "product-card";

            // Image area

            const imageArea = document.createElement("div");
            imageArea.className = "product-image";

            const imageSource = getProductImage(product);

            if (imageSource) {

                const image = document.createElement("img");

                image.src = imageSource;
                image.alt = safeText(product.name);
                image.loading = "lazy";

                image.onerror = function () {
                    image.remove();

                    imageArea.textContent =
                        "Product image unavailable";
                };

                imageArea.appendChild(image);

            } else {

                imageArea.textContent =
                    "Product image coming soon";
            }

            // Product information

            const info = document.createElement("div");
            info.className = "product-info";

            const category = document.createElement("small");
            category.textContent = safeText(product.category);

            const name = document.createElement("h3");
            name.textContent = safeText(product.name);

            const price = document.createElement("div");
            price.className = "price";
            price.textContent = formatProductPrice(product);

            // Stock status

            const stockStatus = getStockStatus(product);

            const stock = document.createElement("small");

            stock.className =
                "product-stock " + stockStatus.className;

            stock.textContent = stockStatus.text;

            // Product actions

            const actions = document.createElement("div");
            actions.className = "product-actions";

            // View details

            const viewButton = document.createElement("button");

            viewButton.type = "button";
            viewButton.className = "small-btn";
            viewButton.textContent = "View details";

            viewButton.addEventListener("click", function () {

                window.location.href =
                    "product.html?id=" +
                    encodeURIComponent(product.id);
            });

            // Add to cart

            const addButton = document.createElement("button");

            addButton.type = "button";
            addButton.className = "small-btn primary";

            const priceAvailable =
                getProductPrice(product) !== null;

            const canPurchase =
                stockStatus.available && priceAvailable;

            addButton.disabled = !canPurchase;

            if (!priceAvailable) {

                addButton.textContent = "Unavailable";

            } else if (!stockStatus.available) {

                addButton.textContent =
                    stockStatus.className === "out-of-stock"
                        ? "Out of stock"
                        : "Check availability";

            } else {

                addButton.textContent = "Add to cart";
            }

            addButton.addEventListener("click", function () {

                if (getProductPrice(product) === null) {

                    alert(
                        "This product has no price in your selected currency."
                    );

                    return;
                }

                const currentStock = getStock(product);

                if (currentStock === null) {

                    alert(
                        "Product availability has not been confirmed."
                    );

                    return;
                }

                if (currentStock <= 0) {

                    alert(
                        "This product is currently out of stock."
                    );

                    refresh();
                    return;
                }

                try {

                    store.addToCart(product.id);

                    refreshCartDisplay();

                } catch (error) {

                    console.error(
                        "Could not add product to cart:",
                        error
                    );

                    alert(
                        "The product could not be added. Please try again."
                    );
                }
            });

            actions.appendChild(viewButton);
            actions.appendChild(addButton);

            info.appendChild(category);
            info.appendChild(name);
            info.appendChild(price);
            info.appendChild(stock);
            info.appendChild(actions);

            card.appendChild(imageArea);
            card.appendChild(info);

            return card;
        }

        // =================================================
        // 12. CART COUNT REFRESH
        // =================================================

        function refreshCartDisplay() {

            try {

                if (typeof store.renderCart === "function") {
                    store.renderCart();
                }

            } catch (error) {

                console.warn(
                    "Cart display refresh unavailable:",
                    error
                );
            }
        }

        // =================================================
        // 13. DISPLAY PRODUCTS
        // =================================================

        function displayProducts() {

            let products = getProducts();

            products = filterBySearch(products);

            products = filterByCategory(products);

            products = sortProducts(products);

            productContainer.replaceChildren();

            if (resultCount) {

                resultCount.textContent =
                    products.length +
                    (
                        products.length === 1
                            ? " product found"
                            : " products found"
                    );
            }

            if (noProductsMessage) {

                noProductsMessage.hidden =
                    products.length !== 0;
            }

            products.forEach(function (product) {

                productContainer.appendChild(
                    createProductCard(product)
                );

            });
        }

        // =================================================
        // 14. REFRESH FUNCTION
        // =================================================

        function refresh() {
            displayProducts();
        }

        // =================================================
        // 15. SEARCH EVENTS
        // =================================================

        if (searchInput) {

            searchInput.addEventListener(
                "input",
                displayProducts
            );
        }

        // =================================================
        // 16. CATEGORY EVENTS
        // =================================================

        if (categoryFilter) {

            categoryFilter.addEventListener(
                "change",
                displayProducts
            );
        }

        // =================================================
        // 17. SORT EVENTS
        // =================================================

        if (sortSelect) {

            sortSelect.addEventListener(
                "change",
                displayProducts
            );
        }

        // =================================================
        // 18. URL CATEGORY
        // =================================================

        const urlParams = new URLSearchParams(
            window.location.search
        );

        const requestedCategory =
            urlParams.get("category");

        if (requestedCategory && categoryFilter) {

            const matchingOption = Array.from(
                categoryFilter.options
            ).find(function (option) {

                return option.value.toLowerCase() ===
                    requestedCategory.toLowerCase();
            });

            if (matchingOption) {
                categoryFilter.value = matchingOption.value;
            }
        }

        // =================================================
        // 19. CURRENCY CHANGE
        // =================================================

        window.addEventListener(
            "storage",
            function (event) {

                if (event.key === "sinkz_currency") {
                    displayProducts();
                }
            }
        );

        window.addEventListener(
            "sinkz:currency-changed",
            displayProducts
        );

        // =================================================
        // 20. PRODUCT CATALOGUE CHANGE
        // =================================================

        window.addEventListener(
            "sinkz:products-updated",
            displayProducts
        );

        // =================================================
        // 21. INITIAL DISPLAY
        // =================================================

        displayProducts();

        // =================================================
        // 22. PUBLIC SHOP API
        // =================================================

        window.SinkzShop = {
            refresh: refresh
        };

        console.log(
            "SINKZCLOSETS: Shop page initialised."
        );

    });

})();
