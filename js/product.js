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
        const variantFields = document.getElementById("productVariantFields");
        const sizeField = document.getElementById("productSizeField");
        const sizeSelect = document.getElementById("productSize");
        const colourField = document.getElementById("productColourField");
        const colourSelect = document.getElementById("productColour");
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
        // 5. RENDER ADMIN-DEFINED SIZE AND COLOUR OPTIONS
        // -------------------------------------------------

        function parseOptions(value) {
            return String(value || "").split(/[\n,]+/)
                .map(function (option) { return option.trim(); })
                .filter(Boolean);
        }

        function fillOptions(select, options, placeholder) {
            if (!select) return;
            select.replaceChildren();
            const first = document.createElement("option");
            first.value = "";
            first.textContent = placeholder;
            select.appendChild(first);
            options.forEach(function (option) {
                const choice = document.createElement("option");
                choice.value = option;
                choice.textContent = option;
                select.appendChild(choice);
            });
        }

        const sizes = parseOptions(product.sizes);
        const colours = parseOptions(product.colours);

        if (sizes.length || colours.length) {
            if (variantFields) variantFields.hidden = false;
            if (sizes.length) {
                if (sizeField) sizeField.hidden = false;
                fillOptions(sizeSelect, sizes, "Select a size");
            }
            if (colours.length) {
                if (colourField) colourField.hidden = false;
                fillOptions(colourSelect, colours, "Select a colour");
            }
        }

        // -------------------------------------------------
        // 6. ADD SELECTED QUANTITY TO CART
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

                const selectedOptions = {
                    size: sizeSelect && sizeField && !sizeField.hidden ? sizeSelect.value : "",
                    colour: colourSelect && colourField && !colourField.hidden ? colourSelect.value : ""
                };

                if (sizes.length && !selectedOptions.size) {
                    alert("Please choose a size before adding this product.");
                    sizeSelect.focus();
                    return;
                }
                if (colours.length && !selectedOptions.colour) {
                    alert("Please choose a colour before adding this product.");
                    colourSelect.focus();
                    return;
                }

                const added = window.SinkzStore.addToCart(product.id, quantity, selectedOptions);

                if (added) {
                    alert(quantity + " × " + product.name + " added to your cart.");
                }
            });
        }

        console.info("SINKZCLOSETS: Product details loaded:", product.id);
    });

})();
