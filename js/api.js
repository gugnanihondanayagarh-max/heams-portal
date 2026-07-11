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
        return "https://script.google.com/macros/s/AKfycbyVDHsz-6TpbxDWCluSdZ62g7N8tk1Il3D3mpV6jh5rrl-CR6j1zVq4BIaj3m3eJUGj/exec"; // Replace with deployed Apps Script URL
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
            console.error("API Call error:", error);
            if (showLoader) Swal.close();
            
            Swal.fire({
                icon: "error",
                title: "Network Gateway Error",
                text: "Failed to connect to the Apps Script database. Please verify internet connection and Web App configuration.",
                confirmButtonColor: "#E4002B"
            });
            
            throw error;
        }
    }
};
