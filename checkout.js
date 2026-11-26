/* =====================================================
   SINKZCLOSETS — CHECKOUT
   Currency-aware order enquiry and payment instructions.

   IMPORTANT:
   - This is not a payment gateway.
   - WhatsApp submission is an order enquiry, not confirmation.
   - Stock must be explicitly confirmed before proceeding.
   - Final price and stock validation must also happen server-side.
===================================================== */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", async function () {
        const store = window.SinkzStore;

        const form = document.getElementById("checkoutForm");
        const itemsContainer = document.getElementById("checkoutItems");
        const totalElement = document.getElementById("checkoutTotal");
        const currencyElement = document.getElementById("checkoutCurrency");
        const emptyMessage = document.getElementById("checkoutEmpty");
        const content = document.getElementById("checkoutContent");
        const warning = document.getElementById("checkoutWarning");
        const submitButton = document.getElementById("checkoutSubmit");

        const paymentDetails = document.getElementById("paymentDetails");
        const paymentTitle = document.getElementById("paymentTitle");
        const paymentInformation = document.getElementById("paymentInformation");
        const capitecSubtypes = document.getElementById("capitecSubtypes");

        if (!store || !form || !itemsContainer || !totalElement) {
            console.error("Checkout could not initialise: required elements or store are missing.");
            return;
        }

        const BUSINESS = {
            whatsapp: "26097315929",

            mtn: {
                name: "MTN MoMo",
                number: "+260765633293",
                accountName: "Josias Sinkonde",
                appUrl: "https://appbiz.momo.africa"
            },

            airtel: {
                name: "Airtel Money",
                number: "+26097315929",
                accountName: "Josias Sinkonde",
                appUrls: [
                    "https://airtelafrica.onelink.me",
                    "https://airtelafricaone.page.link"
                ]
            },

            capitec: {
                bankTransfer: {
                    name: "Capitec Bank Transfer",
                    bankName: "Capitec Bank",
                    accountNumber: "1391238859",
                    accountName: "Londiwe Zungu",
                    appUrl: "https://www.capitecbank.co.za/were-here-to-help/how-to/how-to-get-the-app/"
                },

                cashSend: {
                    name: "Capitec Cash Send",
                    number: "0758617804",
                    appUrl: "https://www.capitecbank.co.za/were-here-to-help/how-to/how-to-get-the-app/"
                }
            }
        };

        try {
            const liveSettings = await window.SinkzBusinessSettings?.load?.();
            if (liveSettings) {
                const mtn = liveSettings.find(x => x.setting_type === "payment" && x.provider === "mtn");
                const airtel = liveSettings.find(x => x.setting_type === "payment" && x.provider === "airtel");
                const whatsapp = liveSettings.find(x => x.setting_type === "whatsapp");
                if (mtn) {
                    BUSINESS.mtn.number = mtn.phone_number;
                    BUSINESS.mtn.accountName = mtn.recipient_name || BUSINESS.mtn.accountName;
                    if (mtn.app_url) BUSINESS.mtn.appUrl = mtn.app_url;
                }
                if (airtel) {
                    BUSINESS.airtel.number = airtel.phone_number;
                    BUSINESS.airtel.accountName = airtel.recipient_name || BUSINESS.airtel.accountName;
                    if (airtel.app_url) BUSINESS.airtel.appUrls[0] = airtel.app_url;
                }
                if (whatsapp?.phone_number) { const digits = whatsapp.phone_number.replace(/\\D/g, ""); BUSINESS.whatsapp = digits.startsWith("0") ? "260" + digits.slice(1) : digits; }
            }
        } catch (error) {
            console.warn("Could not load live business contact settings; using verified fallback details.", error);
        }

        let currentCart = [];
        let currentCurrency = "ZMW";
        let currentTotal = 0;
        let checkoutProblems = [];

        function getCurrency() {
            const currency = store.getCurrency();

            return currency === "ZAR" ? "ZAR" : "ZMW";
        }

        function formatPrice(amount) {
            return store.formatPrice(Number(amount), currentCurrency);
        }

        function getSelectedPayment() {
            const selected = document.querySelector(
                'input[name="paymentMethod"]:checked'
            );

            return selected ? selected.value : "";
        }

        function getSelectedCapitecType() {
            const selected = document.querySelector(
                'input[name="capitecType"]:checked'
            );

            return selected ? selected.value : "";
        }

        function getProductPrice(item) {
            if (
                item.priceUnavailable === true ||
                item.price === null ||
                item.price === undefined ||
                item.price === "" ||
                !Number.isFinite(Number(item.price)) ||
                Number(item.price) < 0
            ) {
                return null;
            }

            return Number(item.price);
        }

        /*
         * Fail closed unless the cart item contains an explicit
         * stock confirmation and a usable stock quantity.
         *
         * These values are still browser-side data. A secure
         * backend must repeat this check when creating an order.
         */
        function getStockCheck(item) {
            const confirmed =
                item.stockConfirmed === true ||
                item.stock_confirmed === true ||
                item.availabilityConfirmed === true;

            const stockValue =
                item.stock !== undefined ? item.stock :
                item.stock_quantity !== undefined ? item.stock_quantity :
                item.quantity_in_stock !== undefined ? item.quantity_in_stock :
                item.available_stock !== undefined ? item.available_stock :
                null;

            if (!confirmed || stockValue === null || stockValue === "") {
                return {
                    confirmed: false,
                    available: false,
                    message: "Stock availability is unconfirmed."
                };
            }

            const stock = Number(stockValue);
            const requested = Number(item.quantity);

            if (!Number.isFinite(stock) || stock < 0) {
                return {
                    confirmed: false,
                    available: false,
                    message: "The stock quantity is invalid."
                };
            }

            if (!Number.isFinite(requested) || requested < 1) {
                return {
                    confirmed: true,
                    available: false,
                    message: "The requested quantity is invalid."
                };
            }

            if (stock < requested) {
                return {
                    confirmed: true,
                    available: false,
                    message: stock === 0
                        ? "This product is out of stock."
                        : "Only " + stock + " item(s) are currently available."
                };
            }

            return {
                confirmed: true,
                available: true,
                message: "Stock confirmed."
            };
        }

        function validateCart(cart) {
            const problems = [];

            if (!Array.isArray(cart) || cart.length === 0) {
                problems.push("Your cart is empty.");
                return problems;
            }

            cart.forEach(function (item) {
                const name = item.name || "Unnamed product";
                const quantity = Number(item.quantity);
                const price = getProductPrice(item);
                const stock = getStockCheck(item);

                if (!Number.isFinite(quantity) || quantity < 1) {
                    problems.push(name + ": Invalid quantity.");
                }

                if (price === null) {
                    problems.push(
                        name + ": No price is available in " +
                        currentCurrency + "."
                    );
                }

                if (!stock.available) {
                    problems.push(name + ": " + stock.message);
                }
            });

            return problems;
        }

        function showWarning(messages) {
            if (!warning) return;

            if (!messages.length) {
                warning.hidden = true;
                warning.textContent = "";
                return;
            }

            warning.hidden = false;
            warning.replaceChildren();

            const heading = document.createElement("strong");
            heading.textContent = "Please resolve these issues before checkout:";
            warning.appendChild(heading);

            const list = document.createElement("ul");

            messages.forEach(function (message) {
                const li = document.createElement("li");
                li.textContent = message;
                list.appendChild(li);
            });

            warning.appendChild(list);
        }

        function setCheckoutEnabled(enabled) {
            if (submitButton) {
                submitButton.disabled = !enabled;
                submitButton.textContent = enabled
                    ? "Continue to WhatsApp"
                    : "Checkout currently unavailable";
            }
        }

        function renderOrder() {
            currentCurrency = getCurrency();
            currentCart = store.getCart() || [];

            itemsContainer.replaceChildren();
            currentTotal = 0;

            if (currencyElement) {
                currencyElement.textContent =
                    currentCurrency === "ZAR"
                        ? "Currency: ZAR — South African Rand"
                        : "Currency: ZMW — Zambian Kwacha";
            }

            if (!currentCart.length) {
                if (emptyMessage) emptyMessage.hidden = false;
                if (content) content.hidden = true;

                totalElement.textContent = formatPrice(0);
                checkoutProblems = ["Your cart is empty."];
                showWarning(checkoutProblems);
                setCheckoutEnabled(false);
                return;
            }

            if (emptyMessage) emptyMessage.hidden = true;
            if (content) content.hidden = false;

            currentCart.forEach(function (item) {
                const row = document.createElement("div");
                row.className = "checkout-line";

                const description = document.createElement("span");
                description.textContent =
                    (item.name || "Product") +
                    " × " + (Number(item.quantity) || 0);

                const amount = document.createElement("strong");
                const price = getProductPrice(item);
                const quantity = Number(item.quantity);

                if (price === null || !Number.isFinite(quantity) || quantity < 1) {
                    amount.textContent = "Price unavailable";
                } else {
                    const lineTotal = price * quantity;
                    currentTotal += lineTotal;
                    amount.textContent = formatPrice(lineTotal);
                }

                row.appendChild(description);
                row.appendChild(amount);
                itemsContainer.appendChild(row);
            });

            totalElement.textContent = formatPrice(currentTotal);

            checkoutProblems = validateCart(currentCart);
            showWarning(checkoutProblems);
            setCheckoutEnabled(checkoutProblems.length === 0);
        }

        function addPaymentDetail(label, value) {
            const line = document.createElement("div");
            line.className = "payment-detail-line";

            const info = document.createElement("div");
            const heading = document.createElement("small");
            const detail = document.createElement("strong");

            heading.textContent = label;
            detail.textContent = value;

            info.appendChild(heading);
            info.appendChild(document.createElement("br"));
            info.appendChild(detail);

            const copyButton = document.createElement("button");
            copyButton.type = "button";
            copyButton.className = "copy-button";
            copyButton.textContent = "Copy";

            copyButton.addEventListener("click", function () {
                copyText(value, copyButton);
            });

            line.appendChild(info);
            line.appendChild(copyButton);
            paymentInformation.appendChild(line);
        }

        async function copyText(value, button) {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(value);
                } else {
                    const temporary = document.createElement("textarea");
                    temporary.value = value;
                    temporary.style.position = "fixed";
                    temporary.style.opacity = "0";

                    document.body.appendChild(temporary);
                    temporary.select();

                    const copied = document.execCommand("copy");
                    temporary.remove();

                    if (!copied) throw new Error("Copy failed");
                }

                const original = button.textContent;
                button.textContent = "Copied!";

                window.setTimeout(function () {
                    button.textContent = original;
                }, 1600);
            } catch (error) {
                window.prompt("Copy these payment details:", value);
            }
        }

        function addAppLink(url, label) {
            const link = document.createElement("a");
            link.className = "app-link";
            link.href = url;
            link.textContent = label;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            paymentInformation.appendChild(link);
        }

        function addPaymentHelp(message) {
            const paragraph = document.createElement("p");
            paragraph.className = "payment-help";
            paragraph.textContent = message;
            paymentInformation.appendChild(paragraph);
        }

        function clearPaymentDetails() {
            if (paymentInformation) paymentInformation.replaceChildren();
            if (paymentDetails) paymentDetails.classList.remove("active");
        }

        function displayPaymentDetails(method) {
            if (!paymentDetails || !paymentTitle || !paymentInformation) return;

            clearPaymentDetails();
            if (!method) return;

            paymentDetails.classList.add("active");

            if (method === "mtn") {
                paymentTitle.textContent = BUSINESS.mtn.name;

                addPaymentDetail("Payment number", BUSINESS.mtn.number);
                addPaymentDetail("Recipient name", BUSINESS.mtn.accountName);
                addAppLink(BUSINESS.mtn.appUrl, "Open MTN MoMo");

                addPaymentHelp(
                    "Confirm the recipient name and number in MTN MoMo " +
                    "before authorising any payment."
                );
            }

            if (method === "airtel") {
                paymentTitle.textContent = BUSINESS.airtel.name;

                addPaymentDetail("Payment number", BUSINESS.airtel.number);
                addPaymentDetail("Recipient name", BUSINESS.airtel.accountName);

                addAppLink(BUSINESS.airtel.appUrls[0], "Open Airtel Money");
                addAppLink(BUSINESS.airtel.appUrls[1], "Alternative Airtel app link");

                addPaymentHelp(
                    "Confirm the recipient name and number in Airtel Money " +
                    "before authorising any payment."
                );
            }

            if (method === "capitec") {
                paymentTitle.textContent = "Capitec";

                addPaymentHelp(
                    "Choose Bank Transfer or Cash Send below to display the " +
                    "relevant details."
                );
            }
        }

        function displayCapitecDetails(type) {
            if (!paymentDetails || !paymentTitle || !paymentInformation) return;

            clearPaymentDetails();

            if (getSelectedPayment() !== "capitec" || !type) return;

            paymentDetails.classList.add("active");

            if (type === "bank_transfer") {
                const account = BUSINESS.capitec.bankTransfer;

                paymentTitle.textContent = account.name;
                addPaymentDetail("Bank", account.bankName);
                addPaymentDetail("Account number", account.accountNumber);
                addPaymentDetail("Account holder", account.accountName);
                addAppLink(account.appUrl, "Capitec official app information");

                addPaymentHelp(
                    "Check the account holder and account number carefully. " +
                    "Confirm that your bank permits this transfer."
                );
            }

            if (type === "cash_send") {
                const account = BUSINESS.capitec.cashSend;

                paymentTitle.textContent = account.name;
                addPaymentDetail("Cash Send number", account.number);
                addAppLink(account.appUrl, "Capitec official app information");

                addPaymentHelp(
                    "Use Capitec Cash Send and verify the recipient details " +
                    "before confirming the transaction."
                );
            }
        }

        document.querySelectorAll('input[name="paymentMethod"]').forEach(function (radio) {
            radio.addEventListener("change", function () {
                const selected = getSelectedPayment();

                if (capitecSubtypes) {
                    capitecSubtypes.classList.toggle("active", selected === "capitec");
                }

                document.querySelectorAll('input[name="capitecType"]').forEach(function (input) {
                    input.checked = false;
                });

                displayPaymentDetails(selected);
            });
        });

        document.querySelectorAll('input[name="capitecType"]').forEach(function (radio) {
            radio.addEventListener("change", function () {
                displayCapitecDetails(radio.value);
            });
        });

        function getCustomerDetails() {
            return {
                name: document.getElementById("customerName").value.trim(),
                phone: document.getElementById("customerPhone").value.trim(),
                email: document.getElementById("customerEmail").value.trim(),
                address: document.getElementById("customerAddress").value.trim(),
                notes: document.getElementById("customerNotes").value.trim(),
                reference: document.getElementById("paymentReference").value.trim(),
                payment: getSelectedPayment(),
                capitecType: getSelectedPayment() === "capitec"
                    ? getSelectedCapitecType()
                    : ""
            };
        }

        function getPaymentDescription(customer) {
            if (customer.payment === "mtn") return "MTN MoMo";
            if (customer.payment === "airtel") return "Airtel Money";

            if (customer.payment === "capitec") {
                return customer.capitecType === "bank_transfer"
                    ? "Capitec Bank Transfer"
                    : "Capitec Cash Send";
            }

            return "Not selected";
        }

        function createWhatsAppMessage(customer, cart, total) {
            let message = "SINKZCLOSETS — ORDER ENQUIRY\n\n";

            message += "Customer: " + customer.name + "\n";
            message += "Phone: " + customer.phone + "\n";
            message += "Email: " + (customer.email || "Not supplied") + "\n";
            message += "Delivery address: " + customer.address + "\n\n";

            message += "ORDER DETAILS\n";

            cart.forEach(function (item) {
                const lineTotal = Number(item.price) * Number(item.quantity);

                message +=
                    "- " + item.name +
                    " | Quantity: " + item.quantity +
                    " | " + formatPrice(lineTotal) + "\n";
            });

            message += "\nCurrency: " + currentCurrency + "\n";
            message += "Order total: " + formatPrice(total) + "\n";
            message += "Payment method: " + getPaymentDescription(customer) + "\n";
            message += "Payment reference: " + (customer.reference || "Not supplied") + "\n";
            message += "Additional notes: " + (customer.notes || "None") + "\n\n";

            message +=
                "This is an order enquiry. Please confirm product availability, " +
                "the final amount, delivery arrangements and payment instructions. " +
                "Payment has not been verified.";

            return message;
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            renderOrder();

            if (checkoutProblems.length) {
                showWarning(checkoutProblems);
                window.alert(
                    "Checkout cannot continue. Please resolve the stock " +
                    "or pricing issues displayed on this page."
                );
                return;
            }

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const customer = getCustomerDetails();

            if (!customer.payment) {
                window.alert("Please select a payment method.");
                return;
            }

            if (
                customer.payment === "capitec" &&
                !customer.capitecType
            ) {
                window.alert("Please select a Capitec payment type.");
                if (capitecSubtypes) {
                    capitecSubtypes.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                }
                return;
            }

            const latestCart = store.getCart() || [];
            const latestProblems = validateCart(latestCart);

            if (latestProblems.length) {
                showWarning(latestProblems);
                window.alert("Your cart has changed. Please review it again.");
                return;
            }

            const latestTotal = latestCart.reduce(function (sum, item) {
                return sum + (Number(item.price) * Number(item.quantity));
            }, 0);

            const message = createWhatsAppMessage(
                customer,
                latestCart,
                latestTotal
            );

            const whatsappURL =
                "https://wa.me/" +
                BUSINESS.whatsapp +
                "?text=" +
                encodeURIComponent(message);

            window.open(whatsappURL, "_blank", "noopener,noreferrer");
        });

        renderOrder();

        const year = document.getElementById("footerYear");
        if (year) year.textContent = new Date().getFullYear();
    });
})();