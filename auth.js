
/* =========================================================
   SINKZCLOSETS — ADMIN AUTHENTICATION
   Supabase Auth + active administrator verification
========================================================= */
"use strict";

(() => {
    const SUPABASE_URL = "https://mpzkiatdejirrjidkdqi.supabase.co";

    // Public publishable key. Never replace this with a service-role key.
    const SUPABASE_KEY =
        "sb_publishable_9Lpund59NwZAcpZyiCdxPg_D8fohkXR";

    const db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );

    window.sinkzSupabase = db;

    function element(id) {
        return document.getElementById(id);
    }

    function showLogin(message = "") {
        const login = element("adminLogin");
        const dashboard = element("adminDashboard");

        if (login) login.hidden = false;
        if (dashboard) dashboard.hidden = true;

        const messageBox = element("loginMessage");
        if (messageBox) messageBox.textContent = message;
    }

    function showDashboard() {
        const login = element("adminLogin");
        const dashboard = element("adminDashboard");

        if (login) login.hidden = true;
        if (dashboard) dashboard.hidden = false;
    }

    async function verifyActiveAdministrator(user) {
        if (!user || !user.id) return false;

        const { data, error } = await db
            .from("admin_users")
            .select("user_id, is_active")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle();

        if (error) {
            console.error("Administrator verification failed:", error);
            throw new Error(
                "Unable to verify administrator permissions. Please try again."
            );
        }

        return Boolean(data && data.user_id === user.id && data.is_active);
    }

    async function rejectAccess(message) {
        await db.auth.signOut();
        showLogin(message);
    }

    async function initialiseAuthentication() {
        showLogin("Checking administrator session...");

        try {
            const { data, error } = await db.auth.getSession();

            if (error) throw error;

            if (!data.session) {
                showLogin();
                return;
            }

            const { data: userData, error: userError } =
                await db.auth.getUser();

            if (userError || !userData.user) {
                await rejectAccess("Your session is invalid. Please sign in again.");
                return;
            }

            const authorised = await verifyActiveAdministrator(userData.user);

            if (!authorised) {
                await rejectAccess(
                    "Access denied. This account is not an active administrator."
                );
                return;
            }

            showDashboard();

        } catch (error) {
            console.error("Authentication initialisation error:", error);
            await db.auth.signOut();
            showLogin(error.message || "Could not verify your session.");
        }
    }

    async function handleLogin(event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const emailInput = element("adminEmail");
        const passwordInput = element("adminPassword");
        const messageBox = element("loginMessage");
        const submitButton = event.target.querySelector(
            'button[type="submit"]'
        );

        const email = emailInput?.value.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            showLogin("Enter your email address and password.");
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Signing in...";
        }

        if (messageBox) messageBox.textContent = "";

        try {
            const { data, error } = await db.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            const user = data.user;

            if (!user) {
                throw new Error("Authentication did not return a user account.");
            }

            const authorised = await verifyActiveAdministrator(user);

            if (!authorised) {
                await rejectAccess(
                    "Access denied. Your account is not an active administrator."
                );
                return;
            }

            if (passwordInput) passwordInput.value = "";

            showDashboard();

        } catch (error) {
            console.error("Administrator login error:", error);

            await db.auth.signOut();

            showLogin(
                error.message || "Sign-in failed. Check your details and try again."
            );

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Sign In";
            }
        }
    }

    async function handleLogout(event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const logoutButton = element("adminLogout");

        if (logoutButton) logoutButton.disabled = true;

        try {
            const { error } = await db.auth.signOut();

            if (error) throw error;

            showLogin("You have signed out successfully.");

            const passwordInput = element("adminPassword");
            if (passwordInput) passwordInput.value = "";

        } catch (error) {
            console.error("Administrator logout error:", error);

            showLogin(
                "Sign-out encountered a problem. Please refresh and check your session."
            );

        } finally {
            if (logoutButton) logoutButton.disabled = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {

        // Capture the login before the old development login handler.
        document.addEventListener("submit", event => {
            if (event.target && event.target.id === "adminLoginForm") {
                handleLogin(event);
            }
        }, true);

        // Capture logout before the old development logout handler.
        document.addEventListener("click", event => {
            const logout = event.target.closest("#adminLogout");

            if (logout) {
                handleLogout(event);
            }
        }, true);

        initialiseAuthentication();
    });

})();
