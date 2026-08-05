/**
 * EAMS - Network API Gateway Engine
 */

const API = {
    // Returns configured Apps Script endpoint (falls back to localStorage dynamic override)
    getURL() {
        const storedUrl = localStorage.getItem("EAMS_api_url");
        if (storedUrl && storedUrl.trim() !== "") {
            return storedUrl.trim();
        }
        return "https://script.google.com/macros/s/AKfycbxJWlNkW5uFfjDxmzGKeHkb-nqWZitKHbN-F69mE_ZtqqMWxQUwGd8Tp3njj09uK0Kl2Q/exec"; // Replace with deployed Apps Script URL
    },

    // Unified secure POST network request wrapper
    async call(payload, showLoader = true) {
        const url = this.getURL();
        
        if (url === "YOUR_APPS_SCRIPT_WEB_APP_URL") {
            Swal.fire({
                icon: "warning",
                title: "Gateway URL Missing",
                text: "Google Apps Script Web App URL is unconfigured. Please configure it in Settings or js/api.js.",
                confirmButtonColor: "#E4002B"
            });
            throw new Error("API URL not configured.");
        }

        // Automatically inject auth session details if available
        if (Auth.isLoggedIn()) {
            payload.token = Auth.getToken();
            payload.authUserId = Auth.getUserId();
        }

        if (showLoader) {
            Swal.fire({
                title: "Syncing Data...",
                html: "Connecting with EAMS Cloud database gateway",
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
        }

        const maxRetries = 3;
        let attempt = 0;
        let lastError = null;

        while (attempt < maxRetries) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (showLoader) Swal.close();

                if (data && data.status === "Error") {
                    // If token invalid, auto logout
                    if (data.message && data.message.includes("Token expired")) {
                        Auth.logout("Your session has expired. Please login again.");
                        return data;
                    }
                    
                    Swal.fire({
                        icon: "error",
                        title: "Transaction Failure",
                        text: data.message || "An unknown database error occurred.",
                        confirmButtonColor: "#E4002B"
                    });
                }

                return data;
            } catch (error) {
                attempt++;
                lastError = error;
                console.warn(`API call attempt ${attempt} failed:`, error);
                
                if (attempt < maxRetries) {
                    const delay = attempt * 500; // 500ms, 1000ms delay
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (showLoader) Swal.close();
        
        Swal.fire({
            icon: "error",
            title: "Network Gateway Error",
            text: "Failed to connect to the Apps Script database. Please verify internet connection and Web App configuration.",
            confirmButtonColor: "#E4002B"
        });
        
        throw lastError;
    }
};
