/**
 * EAMS - Authentication & Session Engine
 */

const Auth = {
    SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes auto-logout

    // Login process
    async login(username, password, rememberMe = false, role = "Employee") {
        try {
            // Hash password client-side first
            const passwordHash = await Utils.sha256(password);
            
            const action = role === "Admin" ? "adminLogin" : "employeeLogin";
            const response = await API.call({
                action: action,
                username: username,
                password: passwordHash
            });

            if (response.status === "Success") {
                this.startSession(response, rememberMe);
                return { success: true, role: response.role };
            } else {
                return { success: false, message: response.message || "Invalid credentials." };
            }
        } catch (err) {
            console.error("Login failure", err);
            return { success: false, message: "Server connection failure. Please check Apps Script Web App URL config." };
        }
    },

    // Session initialisation
    startSession(data, rememberMe) {
        const timestamp = Date.now();
        localStorage.setItem("EAMS_logged_in", "true");
        localStorage.setItem("EAMS_token", data.token);
        localStorage.setItem("EAMS_role", data.role);
        localStorage.setItem("EAMS_is_manager", data.isManager || "No");
        localStorage.setItem("EAMS_username", data.employeeName || data.username);
        localStorage.setItem("EAMS_id", data.employeeId || data.username);
        localStorage.setItem("EAMS_last_active", timestamp.toString());
        
        if (data.branch) {
            localStorage.setItem("EAMS_branch", data.branch);
            localStorage.setItem("EAMS_department", data.department || "");
            localStorage.setItem("EAMS_designation", data.designation || "");
            
            localStorage.setItem("EAMS_bank_name", data.bankName || "");
            localStorage.setItem("EAMS_bank_acc", data.bankAccount || "");
            localStorage.setItem("EAMS_bank_ifsc", data.bankIfsc || "");
            localStorage.setItem("EAMS_bank_branch", data.bankBranch || "");
            localStorage.setItem("EAMS_joining_date", data.joiningDate || "");
        } else {
            localStorage.removeItem("EAMS_branch");
            localStorage.removeItem("EAMS_department");
            localStorage.removeItem("EAMS_designation");
            
            localStorage.removeItem("EAMS_bank_name");
            localStorage.removeItem("EAMS_bank_acc");
            localStorage.removeItem("EAMS_bank_ifsc");
            localStorage.removeItem("EAMS_bank_branch");
            localStorage.removeItem("EAMS_joining_date");
        }

        if (rememberMe) {
            localStorage.setItem("EAMS_remembered_user", data.employeeId || data.username);
        } else {
            localStorage.removeItem("EAMS_remembered_user");
        }
    },

    // Inactivity activity logger update
    refreshActivity() {
        if (this.isLoggedIn()) {
            localStorage.setItem("EAMS_last_active", Date.now().toString());
        }
    },

    // Check activity for auto-logout
    checkSessionExpiry() {
        if (!this.isLoggedIn()) return;

        const lastActive = parseInt(localStorage.getItem("EAMS_last_active") || "0");
        const diff = Date.now() - lastActive;

        if (diff > this.SESSION_TIMEOUT_MS) {
            this.logout("Session expired due to inactivity.");
        }
    },

    // Check if user is currently logged in
    isLoggedIn() {
        return localStorage.getItem("EAMS_logged_in") === "true";
    },

    // Get current role
    getRole() {
        return localStorage.getItem("EAMS_role");
    },

    // Get session token
    getToken() {
        return localStorage.getItem("EAMS_token");
    },

    // Get user descriptive name
    getUserName() {
        return localStorage.getItem("EAMS_username") || "User";
    },

    // Get user identity key
    getUserId() {
        return localStorage.getItem("EAMS_id") || "";
    },

    // Clear session memory
    logout(message = null) {
        localStorage.removeItem("EAMS_logged_in");
        localStorage.removeItem("EAMS_token");
        localStorage.removeItem("EAMS_role");
        localStorage.removeItem("EAMS_username");
        localStorage.removeItem("EAMS_id");
        localStorage.removeItem("EAMS_branch");
        localStorage.removeItem("EAMS_department");
        localStorage.removeItem("EAMS_designation");
        localStorage.removeItem("EAMS_last_active");
        localStorage.removeItem("EAMS_bank_name");
        localStorage.removeItem("EAMS_bank_acc");
        localStorage.removeItem("EAMS_bank_ifsc");
        localStorage.removeItem("EAMS_bank_branch");

        if (message) {
            alert(message);
        }

        // Direct back to portal login
        window.location.href = "index.html";
    },

    // Initiates session check loops
    initSessionLoop() {
        this.checkSessionExpiry();
        setInterval(() => this.checkSessionExpiry(), 60000); // Check every minute
        
        // Listen to UI interaction to refresh session activity
        const activityEvents = ["click", "keypress", "touchstart", "scroll"];
        activityEvents.forEach(evt => {
            document.addEventListener(evt, () => this.refreshActivity(), { passive: true });
        });
    }
};
