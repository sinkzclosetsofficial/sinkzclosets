/* =====================================================
   SINKZCLOSETS — PRODUCT DETAILS
   Loads the live catalogue before resolving the product.
===================================================== */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", async function () {

        // -------------------------------------------------
        // 1. GET PAGE ELEMENTS
        // -------------------------------------------------

        const productImage = document.getElementById("productImage");
        const productName = document.getElementById("productName");
        const productCategory = document.getElementById("productCategory");
        const productPrice = document.getElementById("productPrice");
        const productDescription = document.getElementById("productDescription");
        const productQuantity = document.getElementById("productQuantity");
        const addButton = document.getElementById("addProductToCart");
        const productNotFound = document.getElementById("productNotFound");
        const productDetails = document.getElementById("productDetails");

        // -------------------------------------------------
        // 2. GET PRODUCT ID FROM URL
        // -------------------------------------------------

        const parameters = new URLSearchParams(window.location.search);
        const productId = parameters.get("id");

        function showNotFound() {
            if (productDetails) productDetails.hidden = true;
            if (productNotFound) productNotFound.hidden = false;
        }

        if (!productId || !window.SinkzStore) {
            showNotFound();
            return;
        }

        // -------------------------------------------------
        // 3. WAIT FOR THE LIVE CATALOGUE
        // -------------------------------------------------
        // The central store starts its Supabase request during
        // DOMContentLoaded. Awaiting this call prevents a race
        // where the product page checks an empty cache too early.

        try {
            if (typeof window.SinkzStore.refreshProductsFromSupabase === "function") {
                await window.SinkzStore.refreshProductsFromSupabase();
            }
        } catch (error) {
            console.warn(
                "SINKZCLOSETS: Could not refresh the live catalogue; checking cached products.",
                error
            );
        }

        const product = window.SinkzStore.getProduct(productId);

        if (!product) {
            showNotFound();
            return;
        }

        // -------------------------------------------------
        // 4. DISPLAY PRODUCT INFORMATION
        // -------------------------------------------------

        if (productDetails) productDetails.hidden = false;
        if (productNotFound) productNotFound.hidden = true;

        if (productName) productName.textContent = product.name || "";
        if (productCategory) productCategory.textContent = product.category || "";
        if (productPrice) {
            productPrice.textContent = window.SinkzStore.formatPrice(product.price);
        }
        if (productDescription) productDescription.textContent = product.description || "";

        const productImageURL =
            product.image ||
            (
                Array.isArray(product.images) &&
                product.images.find(function (url) {
                    return typeof url === "string" && url.trim();
                })
            ) ||
            "";

        if (productImage) {
            productImage.replaceChildren();

            if (productImageURL) {
                const image = document.createElement("img");
                image.src = productImageURL;
                image.alt = product.name || "Product image";
                image.loading = "eager";

                image.onerror = function () {
                    image.remove();
                    productImage.textContent = "Product image unavailable";
                };

                productImage.appendChild(image);
            } else {
                productImage.textContent = "Product image coming soon";
            }
        }

        document.title = (product.name || "Product") + " | Sinkzclosets";

        // -------------------------------------------------
        // 5. ADD SELECTED QUANTITY TO CART
        // -------------------------------------------------
        // Use the central store so stock, currency, quantity,
        // repricing and cart validation remain consistent.

        if (addButton) {
            addButton.addEventListener("click", function () {
                const quantity = Number(productQuantity ? productQuantity.value : 1);

                if (!Number.isInteger(quantity) || quantity < 1) {
                    alert("Please enter a valid quantity.");
                    if (productQuantity) productQuantity.value = 1;
                    return;
                }

                const added = window.SinkzStore.addToCart(product.id, quantity);

                if (added) {
                    alert(quantity + " × " + product.name + " added to your cart.");
                }
            });
        }

        console.info("SINKZCLOSETS: Product details loaded:", product.id);
    });

})();
