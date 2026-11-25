
/* =====================================================
   SINKZCLOSETS — PRODUCT DETAILS
===================================================== */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {

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

        // -------------------------------------------------
        // 3. FIND PRODUCT
        // -------------------------------------------------

        const product = window.SinkzStore
            ? window.SinkzStore.getProduct(productId)
            : null;

        if (!product) {

        window.addEventListener("sinkz:products-updated", function (event) {
            if (
                event.detail &&
                event.detail.source === "supabase" &&
                window.SinkzStore &&
                window.SinkzStore.getProduct(productId) &&
                !productDetails?.dataset.catalogueLoaded
            ) {
                window.location.reload();
            }
        }, { once: true });

        }

        // -------------------------------------------------
        // 4. HANDLE MISSING PRODUCT
        // -------------------------------------------------

        if (!product) {

            if (productDetails) {
                productDetails.hidden = true;
            }

            if (productNotFound) {
                productNotFound.hidden = false;
            }

            return;
        }

        // -------------------------------------------------
        // 5. DISPLAY PRODUCT INFORMATION
        // -------------------------------------------------

        if (productDetails) {
            productDetails.dataset.catalogueLoaded = "true";
        }

        productName.textContent = product.name;
        productCategory.textContent = product.category;
        productPrice.textContent =
            window.SinkzStore.formatPrice(product.price);

        productDescription.textContent = product.description;

        if (product.image) {

            const image = document.createElement("img");

            image.src = product.image;
            image.alt = product.name;

            productImage.textContent = "";
            productImage.appendChild(image);

        } else {

            productImage.textContent = "Product image coming soon";

        }

        document.title = product.name + " | Sinkzclosets";

        // -------------------------------------------------
        // 6. ADD SELECTED QUANTITY TO CART
        // -------------------------------------------------

        if (addButton) {

            addButton.addEventListener("click", function () {

                let quantity = Number(productQuantity.value);

                if (!Number.isInteger(quantity) || quantity < 1) {
                    alert("Please enter a valid quantity.");
                    productQuantity.value = 1;
                    return;
                }

                const cart = window.SinkzStore.getCart();

                const existingItem = cart.find(function (item) {
                    return item.id === product.id;
                });

                if (existingItem) {

                    existingItem.quantity += quantity;

                } else {

                    cart.push({
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        quantity: quantity
                    });

                }

                window.SinkzStore.saveCart(cart);

                alert(quantity + " × " + product.name + " added to your cart.");

            });

        }

    });

})();
