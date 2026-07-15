/**
 * EAMS - Admin SPA UI Logic Engine
 */

const AdminApp = {
    activeTab: "dashboard",
    charts: {},
    currentPage: 1,
    rowsPerPage: 10,
    employeesData: [],
    branchesData: [],
    attendanceData: [],

    // Initialize Admin panel
    init() {
        if (this.initialized) return;
        this.initialized = true;
        Auth.initSessionLoop();
        this.bindEvents();
        this.switchTab("dashboard");
        this.loadDashboardStats();
    },

    // UI event bindings
    bindEvents() {
        // Sidebar tabs switcher
        document.querySelectorAll(".sidebar-link").forEach(link => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const targetTab = link.getAttribute("data-tab");
                this.switchTab(targetTab);
            });
        });

        // Theme Switcher toggle
        document.getElementById("theme-toggle-admin")?.addEventListener("click", () => {
            document.body.classList.toggle("dark-mode");
            const isDark = document.body.classList.contains("dark-mode");
            localStorage.setItem("EAMS_dark_mode", isDark ? "true" : "false");
            
            // Re-render charts to update gridline colors
            this.rebuildCharts();
        });

        if (localStorage.getItem("EAMS_dark_mode") === "true") {
            document.body.classList.add("dark-mode");
        }

        // Toggle Sidebar on mobile
        document.getElementById("sidebar-toggle-btn")?.addEventListener("click", () => {
            document.querySelector(".admin-sidebar").classList.toggle("active");
        });

        // Employee Search filter
        document.getElementById("emp-search")?.addEventListener("input", (e) => {
            this.renderEmployeesTable(e.target.value);
        });

        // Add employee button
        document.getElementById("btn-add-employee")?.addEventListener("click", () => {
            this.openEmployeeModal();
        });

        // Add Employee submit
        document.getElementById("form-employee-mut")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.saveEmployeeRecord();
        });

        // Attendance Edit submit
        document.getElementById("form-attendance-edit")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.saveAttendanceEdit();
        });

        // Branch search filter
        document.getElementById("branch-search")?.addEventListener("input", (e) => {
            this.renderBranchesTable(e.target.value);
        });

        // Add branch button
        document.getElementById("btn-add-branch")?.addEventListener("click", () => {
            this.openBranchModal();
        });

        // Add Branch submit
        document.getElementById("form-branch-mut")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.saveBranchRecord();
        });

        // Holiday submit
        document.getElementById("form-add-holiday")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.saveHolidayRecord();
        });

        // Report compiler run button
        document.getElementById("btn-generate-report")?.addEventListener("click", () => {
            this.runReportGeneration();
        });

        // Print Report
        document.getElementById("btn-print-report")?.addEventListener("click", () => {
            const reportType = document.getElementById("report-select-type").value;
            Utils.printReport(`EAMS - ${reportType} Report`, "report-results-table");
        });

        // Export CSV
        document.getElementById("btn-csv-report")?.addEventListener("click", () => {
            this.exportReportCSV();
        });

        // Settings Dynamic Web App URL Save
        document.getElementById("form-settings-gateway")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const url = document.getElementById("settings-webapp-url").value;
            localStorage.setItem("EAMS_api_url", url);
            Swal.fire("Settings Updated", "Google Apps Script Web App URL updated.", "success");
        });

        // Database Purging trigger
        document.getElementById("btn-purge-database")?.addEventListener("click", () => {
            this.purgeOldDatabaseLogs();
        });

        // Defensive Modal Backdrop Cleanup on Close
        ["modal-employee-wizard", "modal-attendance-edit", "modal-branch-wizard"].forEach(id => {
            const modalEl = document.getElementById(id);
            if (modalEl) {
                ["hide.bs.modal", "hidden.bs.modal"].forEach(evtName => {
                    modalEl.addEventListener(evtName, () => {
                        document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.remove());
                        document.body.classList.remove("modal-open");
                        document.body.style.overflow = "";
                        document.body.style.paddingRight = "";
                    });
                });
            }
        });

        // Click dismiss safeguard
        document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => {
            btn.addEventListener("click", () => {
                setTimeout(() => {
                    document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.remove());
                    document.body.classList.remove("modal-open");
                    document.body.style.overflow = "";
                    document.body.style.paddingRight = "";
                }, 50);
            });
        });
    },

    // Forceful Close and Backdrop Cleanup Helper
    forceCloseModal(modalId) {
        const modalEl = document.getElementById(modalId);
        if (modalEl) {
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) {
                instance.hide();
            }
        }
        // Force cleanup immediately
        document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.remove());
        document.body.classList.remove("modal-open");
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
    },

    // Tab switching routing logic
    switchTab(tabId) {
        this.activeTab = tabId;
        
        // Hide all views
        document.querySelectorAll(".admin-tab-view").forEach(view => {
            view.style.display = "none";
        });

        // Show active view
        const targetView = document.getElementById(`view-${tabId}`);
        if (targetView) {
            targetView.style.display = "block";
            targetView.classList.add("animated-fade-in-up");
        }

        // Toggle active menu link
        document.querySelectorAll(".sidebar-link").forEach(link => {
            link.classList.remove("active");
            if (link.getAttribute("data-tab") === tabId) {
                link.classList.add("active");
            }
        });

        // Close sidebar on mobile
        document.querySelector(".admin-sidebar").classList.remove("active");

        // Specific Tab loaders
        if (tabId === "dashboard") {
            this.loadDashboardStats();
        } else if (tabId === "matrix-dashboard") {
            const matrixMonthInput = document.getElementById("dashboard-matrix-month");
            if (matrixMonthInput && !matrixMonthInput.value) {
                const now = new Date();
                matrixMonthInput.value = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            }
            this.showMatrixGridHome();
            this.loadDashboardMatrix();
        } else if (tabId === "employees") {
            this.loadEmployeesList();
        } else if (tabId === "attendance") {
            this.loadAttendanceLedger();
        } else if (tabId === "branches") {
            this.loadBranchesList();
        } else if (tabId === "leave") {
            this.loadLeaveRequests();
        } else if (tabId === "corrections") {
            this.loadCorrectionRequests();
        } else if (tabId === "holiday") {
            this.loadHolidaysList();
        } else if (tabId === "settings") {
            document.getElementById("settings-webapp-url").value = API.getURL();
        } else if (tabId === "profile") {
            document.getElementById("admin-prof-username").innerText = Auth.getUserId();
        }
    },

    // Dashboard Statistics Fetch & Graph builders
    async loadDashboardStats(force = false) {
        if (!force && this.dashboardStatsData) {
            this.renderTrendChart(this.dashboardStatsData.trends || []);
            this.renderBranchChart(this.dashboardStatsData.branchBreakdown || []);
            return;
        }
        try {
            const data = await API.call({ action: "getAdminMetrics" }, false);
            
            if (data.status === "Success") {
                document.getElementById("metrics-staff").innerText = data.totalEmployees;
                document.getElementById("metrics-branches").innerText = data.totalBranches;
                document.getElementById("metrics-present").innerText = data.presentToday;
                document.getElementById("metrics-mismatches").innerText = data.locationMismatches;

                // Build Charts
                this.dashboardStatsData = data;
                this.renderTrendChart(data.trends || []);
                this.renderBranchChart(data.branchBreakdown || []);
            }
        } catch (err) {
            console.error("Dashboard stats failed to refresh", err);
        }
    },

    // Line Chart: Attendance Trend
    renderTrendChart(trendData) {
        const ctx = document.getElementById("chart-attendance-trend")?.getContext("2d");
        if (!ctx) return;

        if (this.charts.trend) this.charts.trend.destroy();

        const labels = trendData.map(d => d.date);
        const presentValues = trendData.map(d => d.present);
        const lateValues = trendData.map(d => d.late);

        const gridColor = document.body.classList.contains("dark-mode") ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
        const textColor = document.body.classList.contains("dark-mode") ? "#9CA3AF" : "#6B7280";

        this.charts.trend = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels.length > 0 ? labels : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                datasets: [
                    {
                        label: "Presents",
                        data: presentValues.length > 0 ? presentValues : [5, 12, 10, 15, 18, 14],
                        borderColor: "#10B981",
                        backgroundColor: "rgba(16, 185, 129, 0.1)",
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: "Late Clock-ins",
                        data: lateValues.length > 0 ? lateValues : [1, 3, 2, 4, 1, 3],
                        borderColor: "#F59E0B",
                        backgroundColor: "rgba(245, 158, 11, 0.1)",
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, stepSize: 1 } }
                }
            }
        });
    },

    // Bar Chart: Branch Breakdown
    renderBranchChart(branchData) {
        const ctx = document.getElementById("chart-branch-attendance")?.getContext("2d");
        if (!ctx) return;

        if (this.charts.branch) this.charts.branch.destroy();

        const labels = branchData.map(b => b.branch);
        const values = branchData.map(b => b.count);

        const gridColor = document.body.classList.contains("dark-mode") ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
        const textColor = document.body.classList.contains("dark-mode") ? "#9CA3AF" : "#6B7280";

        this.charts.branch = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels.length > 0 ? labels : ["Delhi Sales", "Mumbai Sales", "Bhubaneswar Service"],
                datasets: [{
                    label: "Clocked Employees",
                    data: values.length > 0 ? values : [8, 14, 5],
                    backgroundColor: "rgba(228, 0, 43, 0.75)",
                    hoverBackgroundColor: "var(--brand-color)"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } }
                },
                scales: {
                    x: { grid: { color: "transparent" }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, stepSize: 1 } }
                }
            }
        });
    },

    // Destroy and rebuild charts (used on theme change)
    rebuildCharts() {
        if (this.activeTab === "dashboard") {
            this.loadDashboardStats();
        }
    },

    // Load Employee CRUD roster list
    async loadEmployeesList(force = false) {
        if (!force && this.employeesData && this.employeesData.length > 0) {
            this.renderEmployeesTable();
            this.populateBranchDropdowns();
            return;
        }
        
        const container = document.getElementById("employee-table-body");
        container.innerHTML = `<tr><td colspan="7" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;
        
        try {
            const res = await API.call({ action: "fetchLedger", targetTable: "Employees" }, false);
            if (res.status === "Success" && res.data) {
                this.employeesData = res.data;
                this.renderEmployeesTable();
                
                // Populate branch dropdown in Employee form modal
                this.populateBranchDropdowns();
            }
        } catch (err) {
            container.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to stream employees ledger.</td></tr>`;
        }
    },

    // Render paginated employee data
    renderEmployeesTable(filterQuery = "") {
        const container = document.getElementById("employee-table-body");
        const query = filterQuery.toLowerCase().trim();

        const filtered = this.employeesData.filter(emp => 
            emp.EmployeeID.toLowerCase().includes(query) ||
            emp.Name.toLowerCase().includes(query) ||
            emp.Branch.toLowerCase().includes(query) ||
            emp.Department.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            container.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No employees match filters.</td></tr>`;
            return;
        }

        container.innerHTML = filtered.map(emp => {
            let managerNames = '<span class="text-muted small">None</span>';
            if (emp.ReportingManager) {
                const ids = emp.ReportingManager.split(',').map(s => s.trim().toLowerCase());
                const names = ids.map(id => {
                    const found = this.employeesData.find(e => e.EmployeeID.toString().toLowerCase() === id);
                    return found ? found.Name : id.toUpperCase();
                });
                managerNames = `<span class="small fw-semibold text-secondary">${names.join(', ')}</span>`;
            }

            return `
                <tr>
                    <td><strong>${emp.EmployeeID}</strong></td>
                    <td>${emp.Name}</td>
                    <td>${emp.Branch}</td>
                    <td>${emp.Department}</td>
                    <td>${emp.Designation}</td>
                    <td>${managerNames}</td>
                    <td>
                        <span class="badge ${emp.Status === 'Active' ? 'bg-success' : 'bg-secondary'}">
                            ${emp.Status}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="AdminApp.editEmployee('${emp.EmployeeID}')"><i class="fa-solid fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-warning" onclick="AdminApp.resetEmployeePassword('${emp.EmployeeID}')" title="Reset Password"><i class="fa-solid fa-key"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="AdminApp.deleteEmployee('${emp.EmployeeID}')"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // Form Modal Open for Employee CRUD
    openEmployeeModal(employee = null) {
        const modalEl = document.getElementById("modal-employee-wizard");
        const form = document.getElementById("form-employee-mut");
        form.reset();

        if (employee) {
            document.getElementById("modal-emp-title").innerText = "Edit Employee Profile";
            document.getElementById("mut-emp-id").value = employee.EmployeeID;
            document.getElementById("mut-emp-id").readOnly = true;
            document.getElementById("mut-emp-name").value = employee.Name;
            document.getElementById("mut-emp-mobile").value = employee.Mobile || "";
            document.getElementById("mut-emp-email").value = employee.Email || "";
            document.getElementById("mut-emp-branch").value = employee.Branch || "";
            document.getElementById("mut-emp-dept").value = employee.Department || "";
            document.getElementById("mut-emp-desig").value = employee.Designation || "";
            document.getElementById("mut-emp-joining").value = employee.JoiningDate || "";
            document.getElementById("mut-emp-status").value = employee.Status || "Active";
            document.getElementById("mut-emp-ismanager").checked = !!(employee.IsManager && employee.IsManager.toString().trim().toLowerCase() === "yes");
            
            // Load Bank Details
            document.getElementById("mut-emp-bank-name").value = employee.BankName || "";
            document.getElementById("mut-emp-bank-acc").value = employee.AccountNumber || "";
            document.getElementById("mut-emp-bank-ifsc").value = employee.IFSCCode || "";
            document.getElementById("mut-emp-bank-branch").value = employee.BankBranch || "";
            
            const collapseElement = document.getElementById("collapseBank");
            if (collapseElement) {
                if (employee.BankName || employee.AccountNumber) {
                    collapseElement.classList.add("show");
                } else {
                    collapseElement.classList.remove("show");
                }
            }
            
            // Hide password field for editing
            document.getElementById("modal-emp-pass-wrapper").style.display = "none";
            document.getElementById("mut-emp-pass").required = false;
            form.setAttribute("data-mode", "edit");
        } else {
            document.getElementById("modal-emp-title").innerText = "Add New Employee Roster";
            document.getElementById("mut-emp-id").value = "";
            document.getElementById("mut-emp-id").readOnly = false;
            document.getElementById("mut-emp-ismanager").checked = false;
            
            // Reset Bank Details
            document.getElementById("mut-emp-bank-name").value = "";
            document.getElementById("mut-emp-bank-acc").value = "";
            document.getElementById("mut-emp-bank-ifsc").value = "";
            document.getElementById("mut-emp-bank-branch").value = "";
            const collapseElement = document.getElementById("collapseBank");
            if (collapseElement) {
                collapseElement.classList.remove("show");
            }

            document.getElementById("modal-emp-pass-wrapper").style.display = "block";
            document.getElementById("mut-emp-pass").required = true;
            form.setAttribute("data-mode", "add");
        }

        // Populate Reporting Managers checkbox list (lists active designated managers + ADMIN)
        const managerListContainer = document.getElementById("mut-emp-manager-list");
        if (managerListContainer && this.employeesData) {
            const activeManagers = this.employeesData.filter(e => 
                e.Status === "Active" && 
                e.IsManager === "Yes" &&
                (!employee || e.EmployeeID !== employee.EmployeeID) // prevent employee from reporting to themselves
            );
            
            let htmlOptions = `
                <li class="mb-2">
                    <div class="form-check">
                        <input class="form-check-input manager-checkbox" type="checkbox" value="ADMIN" id="chk-mgr-ADMIN">
                        <label class="form-check-label small fw-bold text-danger" for="chk-mgr-ADMIN">
                            <i class="fa-solid fa-user-shield me-1"></i> ADMIN (System Administrator)
                        </label>
                    </div>
                </li>
            `;

            htmlOptions += activeManagers.map(m => `
                <li class="mb-2">
                    <div class="form-check">
                        <input class="form-check-input manager-checkbox" type="checkbox" value="${m.EmployeeID}" id="chk-mgr-${m.EmployeeID}">
                        <label class="form-check-label small" for="chk-mgr-${m.EmployeeID}">
                            ${m.Name} (${m.EmployeeID} - ${m.Designation || 'Staff'})
                        </label>
                    </div>
                </li>
            `).join('');

            managerListContainer.innerHTML = htmlOptions;

            // Pre-select if editing
            if (employee && employee.ReportingManager) {
                const selectedManagers = employee.ReportingManager.split(',').map(s => s.trim().toLowerCase());
                document.querySelectorAll(".manager-checkbox").forEach(chk => {
                    chk.checked = selectedManagers.includes(chk.value.toLowerCase());
                });
            }

            // Bind change listener to update labels
            this.updateSelectedManagersLabel();
            document.querySelectorAll(".manager-checkbox").forEach(chk => {
                chk.addEventListener("change", () => this.updateSelectedManagersLabel());
            });
        }

        let bootstrapModal = bootstrap.Modal.getInstance(modalEl);
        if (!bootstrapModal) {
            bootstrapModal = new bootstrap.Modal(modalEl);
        }
        bootstrapModal.show();
    },

    updateSelectedManagersLabel() {
        const checked = Array.from(document.querySelectorAll(".manager-checkbox:checked")).map(chk => {
            const lbl = document.querySelector(`label[for="${chk.id}"]`);
            return lbl ? lbl.innerText.split('-')[0].split('(')[0].trim() : chk.value;
        });
        const label = document.getElementById("selected-managers-label");
        if (label) {
            if (checked.length === 0) {
                label.innerText = "Select Managers...";
            } else {
                label.innerText = checked.join(', ');
            }
        }
    },

    // Trigger edit employee loading
    editEmployee(empId) {
        const emp = this.employeesData.find(e => e.EmployeeID === empId);
        if (emp) this.openEmployeeModal(emp);
    },

    // Save/mutate employee record
    async saveEmployeeRecord() {
        const form = document.getElementById("form-employee-mut");
        const mode = form.getAttribute("data-mode");
        
        const empId = document.getElementById("mut-emp-id").value;
        const name = document.getElementById("mut-emp-name").value;
        const mobile = document.getElementById("mut-emp-mobile").value;
        const email = document.getElementById("mut-emp-email").value;
        const branch = document.getElementById("mut-emp-branch").value;
        const dept = document.getElementById("mut-emp-dept").value;
        const desig = document.getElementById("mut-emp-desig").value;
        const status = document.getElementById("mut-emp-status").value;
        const joining = document.getElementById("mut-emp-joining").value;
        
        const bankName = document.getElementById("mut-emp-bank-name").value;
        const bankAcc = document.getElementById("mut-emp-bank-acc").value;
        const bankIfsc = document.getElementById("mut-emp-bank-ifsc").value;
        const bankBranch = document.getElementById("mut-emp-bank-branch").value;
        
        // Extract selected Reporting Managers from checkbox list
        const checkedBoxes = Array.from(document.querySelectorAll(".manager-checkbox:checked")).map(chk => chk.value);
        const reportingManager = checkedBoxes.join(',');

        const isManager = document.getElementById("mut-emp-ismanager").checked ? "Yes" : "No";

        let pass = "";
        if (mode === "add") {
            const passRaw = document.getElementById("mut-emp-pass").value;
            // Hash password client-side
            pass = await Utils.sha256(passRaw);
        }

        const payload = {
            action: "saveEmployee",
            mode: mode,
            data: {
                EmployeeID: empId,
                Name: name,
                Mobile: mobile,
                Email: email,
                Branch: branch,
                Department: dept,
                Designation: desig,
                Status: status,
                JoiningDate: joining,
                Password: pass,
                BankName: bankName,
                AccountNumber: bankAcc,
                IFSCCode: bankIfsc,
                BankBranch: bankBranch,
                ReportingManager: reportingManager,
                IsManager: isManager
            }
        };

        try {
            const res = await API.call(payload);
            if (res.status === "Success") {
                this.forceCloseModal("modal-employee-wizard");
                Swal.fire("Saved", res.message, "success");
                this.loadEmployeesList();
            }
        } catch (err) {
            console.error("Failed to mutate employee", err);
        }
    },

    // Change password to custom value
    async resetEmployeePassword(empId) {
        Swal.fire({
            title: 'Change Employee Password',
            text: `Enter a new access password for employee ${empId}:`,
            input: 'text',
            inputPlaceholder: 'e.g. CustomPassword@123',
            showCancelButton: true,
            confirmButtonText: 'Save Password',
            confirmButtonColor: '#E4002B',
            inputValidator: (value) => {
                if (!value) {
                    return 'You must enter a password!';
                }
                if (value.length < 4) {
                    return 'Password must be at least 4 characters long!';
                }
            }
        }).then(async (result) => {
            if (result.isConfirmed && result.value) {
                const newRawPassword = result.value;
                const newHash = await Utils.sha256(newRawPassword);
                
                Swal.fire({
                    title: "Processing...",
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                try {
                    const res = await API.call({
                        action: "resetPassword",
                        employeeId: empId,
                        newHash: newHash
                    });

                    Swal.close();

                    if (res.status === "Success") {
                        Swal.fire("Saved", `Password for employee ${empId} has been updated successfully.`, "success");
                    } else {
                        Swal.fire("Error", res.message, "error");
                    }
                } catch (err) {
                    Swal.close();
                    Swal.fire("Error", "Failed to communicate with server.", "error");
                }
            }
        });
    },

    // Delete employee record
    async deleteEmployee(empId) {
        Swal.fire({
            title: "Terminate Employee?",
            text: "This will remove the employee records from the roster. This action is irreversible.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#EF4444",
            confirmButtonText: "Yes, Delete"
        }).then(async (result) => {
            if (result.isConfirmed) {
                const res = await API.call({
                    action: "deleteEmployee",
                    employeeId: empId
                });

                if (res.status === "Success") {
                    Swal.fire("Deleted", "Employee profile deleted successfully.", "success");
                    this.loadEmployeesList();
                }
            }
        });
    },

    // Populate branch inputs in employee wizard
    async populateBranchDropdowns() {
        const select = document.getElementById("mut-emp-branch");
        if (!select) return;

        try {
            // Load branches if not loaded
            if (this.branchesData.length === 0) {
                const res = await API.call({ action: "fetchLedger", targetTable: "Branches" }, false);
                if (res.status === "Success" && res.data) {
                    this.branchesData = res.data;
                }
            }

            select.innerHTML = '<option value="">Select Branch Location</option>';
            this.branchesData.forEach(b => {
                if (b.Status === "Active") {
                    select.innerHTML += `<option value="${b.BranchName}">${b.BranchName}</option>`;
                }
            });
        } catch (err) {
            console.error("Failed to load branches for dropdown list", err);
        }
    },

    // Attendance Ledger Methods
    async loadAttendanceLedger(force = false) {
        if (!force && this.attendanceData && this.attendanceData.length > 0) {
            this.renderAttendanceTable();
            return;
        }
        const container = document.getElementById("attendance-table-body");
        container.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;

        try {
            const res = await API.call({ action: "fetchLedger", targetTable: "Attendance" }, false);
            if (res.status === "Success" && res.data) {
                this.attendanceData = res.data;
                this.renderAttendanceTable();
            }
        } catch (err) {
            container.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Failed to stream attendance.</td></tr>`;
        }
    },

    renderAttendanceTable() {
        const container = document.getElementById("attendance-table-body");
        if (this.attendanceData.length === 0) {
            container.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No attendance logs logged.</td></tr>`;
            return;
        }

        // Read active filters from DOM inputs if they exist
        const filterEmp = document.getElementById("filter-att-emp") ? document.getElementById("filter-att-emp").value.trim().toLowerCase() : "";
        const filterStart = document.getElementById("filter-att-start") ? document.getElementById("filter-att-start").value : "";
        const filterEnd = document.getElementById("filter-att-end") ? document.getElementById("filter-att-end").value : "";
        const filterStatus = document.getElementById("filter-att-status") ? document.getElementById("filter-att-status").value : "";

        // Merge duplicate punch records on-the-fly (same date + same employee)
        const mergedMap = {};
        this.attendanceData.forEach(h => {
            if (!h.EmployeeID || !h.Date) return;
            
            const parsed = this.normalizeSheetDate(h.Date);
            if (!parsed) return;
            const dateKey = `${h.EmployeeID}_${parsed.getFullYear()}-${(parsed.getMonth() + 1).toString().padStart(2, '0')}-${parsed.getDate().toString().padStart(2, '0')}`;
            
            if (!mergedMap[dateKey]) {
                mergedMap[dateKey] = { ...h };
            } else {
                const existing = mergedMap[dateKey];
                
                // Merge In details
                if (!existing.PunchIn || existing.PunchIn === "--" || existing.PunchIn === "") {
                    existing.PunchIn = h.PunchIn;
                }
                if (!existing.LatitudeIn && h.LatitudeIn) {
                    existing.LatitudeIn = h.LatitudeIn;
                    existing.LongitudeIn = h.LongitudeIn;
                    existing.DistanceIn = h.DistanceIn;
                }
                if (!existing.ImageIn && h.ImageIn) {
                    existing.ImageIn = h.ImageIn;
                }
                
                // Merge Out details
                if (!existing.PunchOut || existing.PunchOut === "--" || existing.PunchOut === "") {
                    existing.PunchOut = h.PunchOut;
                }
                if (!existing.LatitudeOut && h.LatitudeOut) {
                    existing.LatitudeOut = h.LatitudeOut;
                    existing.LongitudeOut = h.LongitudeOut;
                    existing.DistanceOut = h.DistanceOut;
                }
                if (!existing.ImageOut && h.ImageOut) {
                    existing.ImageOut = h.ImageOut;
                }
                
                // Merge Status
                if (h.Status && (h.Status.includes("Mismatch") || h.Status.includes("Late") || h.Status.includes("Present"))) {
                    existing.Status = h.Status;
                }
            }
        });

        // Convert merged map back to array
        const mergedData = Object.values(mergedMap);
        
        // Filter rows dynamically
        const filteredData = mergedData.filter(log => {
            // 1. Employee query filter
            if (filterEmp) {
                const empId = log.EmployeeID.toLowerCase();
                const empName = (log.EmployeeName || "").toLowerCase();
                if (!empId.includes(filterEmp) && !empName.includes(filterEmp)) {
                    return false;
                }
            }

            // 2. Date range filter
            const logDate = this.normalizeSheetDate(log.Date);
            if (logDate) {
                logDate.setHours(0,0,0,0);
                if (filterStart) {
                    const startLimit = new Date(filterStart);
                    startLimit.setHours(0,0,0,0);
                    if (logDate < startLimit) return false;
                }
                if (filterEnd) {
                    const endLimit = new Date(filterEnd);
                    endLimit.setHours(0,0,0,0);
                    if (logDate > endLimit) return false;
                }
            }

            // 3. Status filter
            if (filterStatus) {
                const hasIn = log.PunchIn && log.PunchIn !== "" && log.PunchIn !== "--";
                const hasOut = log.PunchOut && log.PunchOut !== "" && log.PunchOut !== "--";
                let computedStatus = log.Status || 'Present';
                
                const today = new Date();
                today.setHours(0,0,0,0);
                const isToday = logDate && (logDate.getTime() === today.getTime());

                if (hasIn && !hasOut) {
                    computedStatus = isToday ? "In Progress" : "Absent";
                } else if (!hasIn && hasOut) {
                    computedStatus = "Absent";
                }

                if (filterStatus === "Absent") {
                    if (!computedStatus.toLowerCase().includes("absent") && !computedStatus.toLowerCase().includes("mismatch")) {
                        return false;
                    }
                } else if (filterStatus === "In Progress") {
                    if (computedStatus !== "In Progress") return false;
                } else {
                    if (!computedStatus.toLowerCase().includes(filterStatus.toLowerCase())) {
                        return false;
                    }
                }
            }

            return true;
        });

        // Sort chronologically (newest first)
        filteredData.sort((a, b) => {
            const dateA = this.normalizeSheetDate(a.Date);
            const dateB = this.normalizeSheetDate(b.Date);
            if (!dateA || !dateB) return 0;
            if (dateB.getTime() !== dateA.getTime()) {
                return dateB.getTime() - dateA.getTime();
            }
            return a.EmployeeID.localeCompare(b.EmployeeID);
        });

        if (filteredData.length === 0) {
            container.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">No attendance logs match the active filters.</td></tr>`;
            return;
        }

        // Show logs sorted by date/time (newest first)
        container.innerHTML = filteredData.map(log => {
            let selfieInBtn = "--";
            let selfieOutBtn = "--";
            
            if (log.ImageIn && log.ImageIn !== "") {
                selfieInBtn = `<button class="btn btn-sm btn-outline-secondary" onclick="AdminApp.viewSelfie('${log.ImageIn}')"><i class="fa-solid fa-image"></i> View</button>`;
            }
            if (log.ImageOut && log.ImageOut !== "") {
                selfieOutBtn = `<button class="btn btn-sm btn-outline-secondary" onclick="AdminApp.viewSelfie('${log.ImageOut}')"><i class="fa-solid fa-image"></i> View</button>`;
            }

            let locationInMap = "--";
            let locationOutMap = "--";
            if (log.LatitudeIn && log.LongitudeIn) {
                locationInMap = `<a href="https://www.google.com/maps?q=${log.LatitudeIn},${log.LongitudeIn}" target="_blank" class="btn btn-sm btn-outline-secondary" title="In Distance: ${log.DistanceIn}m"><i class="fa-solid fa-map-marker-alt"></i> Map</a>`;
            }
            if (log.LatitudeOut && log.LongitudeOut) {
                locationOutMap = `<a href="https://www.google.com/maps?q=${log.LatitudeOut},${log.LongitudeOut}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Out Distance: ${log.DistanceOut}m"><i class="fa-solid fa-map-marker-alt"></i> Map</a>`;
            }

            const hasIn = log.PunchIn && log.PunchIn !== "" && log.PunchIn !== "--";
            const hasOut = log.PunchOut && log.PunchOut !== "" && log.PunchOut !== "--";
            
            let statusBadgeClass = "bg-secondary";
            let status = log.Status || 'Present';
            
            const logDate = this.normalizeSheetDate(log.Date);
            const today = new Date();
            today.setHours(0,0,0,0);
            const isToday = logDate && (logDate.getTime() === today.getTime());
            
            // Check if status has been explicitly overridden by admin (e.g. Present, Half Day, etc.)
            const isManualOverride = status.includes("Present") || status.includes("Half") || 
                                     status.includes("Late") || status.includes("Manual") || 
                                     status.includes("Leave") || status.includes("Off") || status.includes("Absent");

            if (hasIn && !hasOut && !status.includes("Present") && !status.includes("Manual") && !status.includes("Half") && !status.includes("Late")) {
                if (isToday) {
                    status = "In Progress";
                    statusBadgeClass = "bg-info";
                } else {
                    status = "Absent (Missing Out Punch)";
                    statusBadgeClass = "bg-danger";
                }
            } else if (!hasIn && hasOut && !status.includes("Present") && !status.includes("Manual") && !status.includes("Half") && !status.includes("Late")) {
                if (isToday) {
                    status = "Out Recorded (Missing In)";
                    statusBadgeClass = "bg-info";
                } else {
                    status = "Absent (Missing In Punch)";
                    statusBadgeClass = "bg-danger";
                }
            } else {
                if (status.includes("Present") || status.includes("Completed") || status.includes("Manual")) statusBadgeClass = "bg-success";
                else if (status.includes("Mismatch") || status.includes("Absent") || status.includes("Missing")) statusBadgeClass = "bg-danger";
                else if (status.includes("Late")) statusBadgeClass = "bg-warning text-dark";
                else if (status.includes("Half")) statusBadgeClass = "bg-info text-dark";
                else if (status.includes("Leave") || status.includes("Off")) statusBadgeClass = "bg-purple text-white";
            }

            return `
                <tr>
                    <td><strong>${log.EmployeeID}</strong></td>
                    <td>${this.cleanDateFormat(log.Date)}</td>
                    <td><span class="text-success fw-bold">${this.cleanTimeFormat(log.PunchIn)}</span></td>
                    <td><span class="text-danger fw-bold">${this.cleanTimeFormat(log.PunchOut)}</span></td>
                    <td>${locationInMap}</td>
                    <td>${locationOutMap}</td>
                    <td>${selfieInBtn}</td>
                    <td>${selfieOutBtn}</td>
                    <td><span class="badge ${statusBadgeClass}">${status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="AdminApp.editAttendanceLog('${log.AttendanceID || log.EmployeeID + "_" + log.Date}')"><i class="fa-solid fa-edit"></i> Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // Show image preview using SweetAlert2
    viewSelfie(url) {
        if (!url || url.indexOf("http") !== 0) {
            Swal.fire({
                icon: "error",
                title: "Selfie Image Missing",
                text: url || "No photo proof was registered for this punch transaction.",
                confirmButtonColor: "#E4002B"
            });
            return;
        }

        // Convert Google Drive view URL to direct image stream URL on-the-fly
        let directUrl = url;
        if (url.includes("drive.google.com")) {
            const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                directUrl = `https://drive.google.com/thumbnail?sz=w1000&id=${match[1]}`;
            }
        }

        Swal.fire({
            imageUrl: directUrl,
            imageAlt: "EAMS Selfie Attendance Photo Capture Proof",
            confirmButtonColor: "#E4002B"
        });
    },

    // Trigger Attendance Log Edit modal
    editAttendanceLog(attId) {
        const parseTo24h = (timeStr) => {
            if (!timeStr || timeStr === "--" || timeStr === "") return "";
            const match = timeStr.match(/^(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?$/i);
            if (!match) return timeStr.slice(0, 5);
            let hrs = parseInt(match[1]);
            const mins = match[2].padStart(2, '0');
            const pm = match[4];
            if (pm) {
                if (pm.toUpperCase() === "PM" && hrs < 12) hrs += 12;
                if (pm.toUpperCase() === "AM" && hrs === 12) hrs = 0;
            }
            return `${hrs.toString().padStart(2, '0')}:${mins}`;
        };

        const log = this.attendanceData.find(a => a.AttendanceID === attId || `${a.EmployeeID}_${a.Date}` === attId);
        if (!log) return;

        document.getElementById("edit-att-id").value = log.AttendanceID || `${log.EmployeeID}_${log.Date}`;
        document.getElementById("edit-att-empid").value = log.EmployeeID;
        document.getElementById("edit-att-date").value = log.Date;
        document.getElementById("edit-att-in").value = parseTo24h(log.PunchIn);
        document.getElementById("edit-att-out").value = parseTo24h(log.PunchOut);
        document.getElementById("edit-att-status").value = log.Status || "Present";
        document.getElementById("edit-att-remarks").value = log.Remarks || "";

        const modalEl = document.getElementById("modal-attendance-edit");
        let bootstrapModal = bootstrap.Modal.getInstance(modalEl);
        if (!bootstrapModal) {
            bootstrapModal = new bootstrap.Modal(modalEl);
        }
        bootstrapModal.show();
    },

    // Save attendance ledger correction
    async saveAttendanceEdit() {
        const attId = document.getElementById("edit-att-id").value;
        const empId = document.getElementById("edit-att-empid").value;
        const date = document.getElementById("edit-att-date").value;
        const punchIn = document.getElementById("edit-att-in").value;
        const punchOut = document.getElementById("edit-att-out").value;
        const status = document.getElementById("edit-att-status").value;
        const remarks = document.getElementById("edit-att-remarks").value;

        try {
            const res = await API.call({
                action: "updateAttendance",
                AttendanceID: attId,
                EmployeeID: empId,
                Date: date,
                PunchIn: punchIn,
                PunchOut: punchOut,
                Status: status,
                Remarks: remarks
            });

            if (res.status === "Success") {
                this.forceCloseModal("modal-attendance-edit");
                Swal.fire("Saved", res.message, "success");
                this.loadAttendanceLedger();
            } else {
                Swal.fire("Error", res.message, "error");
            }
        } catch (err) {
            console.error("Attendance edit failed", err);
        }
    },

    // Load Branch Configurations
    async loadBranchesList(force = false) {
        if (!force && this.branchesData && this.branchesData.length > 0) {
            this.renderBranchesTable();
            return;
        }
        const container = document.getElementById("branches-table-body");
        container.innerHTML = `<tr><td colspan="7" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;

        try {
            const res = await API.call({ action: "fetchLedger", targetTable: "Branches" }, false);
            if (res.status === "Success" && res.data) {
                this.branchesData = res.data;
                this.renderBranchesTable();
            }
        } catch (err) {
            container.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to stream branch locations.</td></tr>`;
        }
    },

    renderBranchesTable(filterQuery = "") {
        const container = document.getElementById("branch-table-body");
        const query = filterQuery.toLowerCase().trim();

        const filtered = this.branchesData.filter(b => 
            b.BranchName.toLowerCase().includes(query) ||
            b.BranchID.toLowerCase().includes(query) ||
            b.Address.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            container.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No branches mapped.</td></tr>`;
            return;
        }

        container.innerHTML = filtered.map(b => `
            <tr>
                <td><strong>${b.BranchID}</strong></td>
                <td>${b.BranchName}</td>
                <td>${b.Address}</td>
                <td>${b.Latitude}, ${b.Longitude}</td>
                <td>${b.Radius} meters</td>
                <td>
                    <span class="badge ${b.Status === 'Active' ? 'bg-success' : 'bg-secondary'}">
                        ${b.Status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="AdminApp.editBranch('${b.BranchID}')"><i class="fa-solid fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="AdminApp.deleteBranch('${b.BranchID}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // Open branch modal dialog
    openBranchModal(branch = null) {
        const modalEl = document.getElementById("modal-branch-wizard");
        const form = document.getElementById("form-branch-mut");
        form.reset();

        if (branch) {
            document.getElementById("modal-branch-title").innerText = "Edit Branch Settings";
            document.getElementById("mut-branch-id").value = branch.BranchID;
            document.getElementById("mut-branch-id").readOnly = true;
            document.getElementById("mut-branch-name").value = branch.BranchName;
            document.getElementById("mut-branch-address").value = branch.Address || "";
            document.getElementById("mut-branch-lat").value = branch.Latitude;
            document.getElementById("mut-branch-lng").value = branch.Longitude;
            document.getElementById("mut-branch-radius").value = branch.Radius;
            document.getElementById("mut-branch-start").value = branch.OfficeStart || "";
            document.getElementById("mut-branch-end").value = branch.OfficeEnd || "";
            document.getElementById("mut-branch-grace").value = branch.GraceTime || 0;
            document.getElementById("mut-branch-halfday").value = branch.HalfDayTime || "";
            document.getElementById("mut-branch-overtime").value = branch.OvertimeStart || "";
            document.getElementById("mut-branch-off").value = branch.WeeklyOff || "Sunday";
            document.getElementById("mut-branch-status").value = branch.Status || "Active";
            
            form.setAttribute("data-mode", "edit");
        } else {
            document.getElementById("modal-branch-title").innerText = "Configure New Branch";
            document.getElementById("mut-branch-id").value = "";
            document.getElementById("mut-branch-id").readOnly = false;
            form.setAttribute("data-mode", "add");
        }

        let bootstrapModal = bootstrap.Modal.getInstance(modalEl);
        if (!bootstrapModal) {
            bootstrapModal = new bootstrap.Modal(modalEl);
        }
        bootstrapModal.show();
    },

    editBranch(branchId) {
        const branch = this.branchesData.find(b => b.BranchID === branchId);
        if (branch) this.openBranchModal(branch);
    },

    // Save branch record mutations
    async saveBranchRecord() {
        const form = document.getElementById("form-branch-mut");
        const mode = form.getAttribute("data-mode");

        const payload = {
            action: "saveBranch",
            mode: mode,
            data: {
                BranchID: document.getElementById("mut-branch-id").value,
                BranchName: document.getElementById("mut-branch-name").value,
                Address: document.getElementById("mut-branch-address").value,
                Latitude: parseFloat(document.getElementById("mut-branch-lat").value),
                Longitude: parseFloat(document.getElementById("mut-branch-lng").value),
                Radius: parseFloat(document.getElementById("mut-branch-radius").value),
                OfficeStart: document.getElementById("mut-branch-start").value,
                OfficeEnd: document.getElementById("mut-branch-end").value,
                GraceTime: parseInt(document.getElementById("mut-branch-grace").value || "0"),
                HalfDayTime: document.getElementById("mut-branch-halfday").value,
                OvertimeStart: document.getElementById("mut-branch-overtime").value,
                WeeklyOff: document.getElementById("mut-branch-off").value,
                Status: document.getElementById("mut-branch-status").value
            }
        };

        try {
            const res = await API.call(payload);
            if (res.status === "Success") {
                this.forceCloseModal("modal-branch-wizard");
                Swal.fire("Branch Saved", res.message, "success");
                this.loadBranchesList();
            }
        } catch (err) {
            console.error("Failed to mutate branch coordinates", err);
        }
    },

    // Delete Branch record
    async deleteBranch(branchId) {
        Swal.fire({
            title: "Delete Branch?",
            text: "Are you sure you want to delete this branch from configuration maps?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#EF4444",
            confirmButtonText: "Yes, Delete"
        }).then(async (result) => {
            if (result.isConfirmed) {
                const res = await API.call({
                    action: "deleteBranch",
                    branchId: branchId
                });

                if (res.status === "Success") {
                    Swal.fire("Deleted", "Branch parameters deleted successfully.", "success");
                    this.loadBranchesList();
                }
            }
        });
    },

    // Load Leave Applications
    async loadLeaveRequests(force = false) {
        if (!force && this.leaveRequestsData && this.leaveRequestsData.length > 0) {
            this.renderLeaveTable();
            return;
        }
        const container = document.getElementById("leave-requests-table-body");
        container.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;

        try {
            // Make sure employees list is loaded so we have the ReportingManager relations
            if (!this.employeesData || this.employeesData.length === 0) {
                const empRes = await API.call({ action: "fetchLedger", targetTable: "Employees" }, false);
                if (empRes.status === "Success" && empRes.data) {
                    this.employeesData = empRes.data;
                }
            }

            const res = await API.call({ action: "fetchLedger", targetTable: "Leave" }, false);
            if (res.status === "Success" && res.data) {
                this.leaveRequestsData = res.data;
                
                // Get role info
                const role = Auth.getRole();
                const designation = localStorage.getItem("EAMS_designation") || "";
                const isManager = (role === "Manager") || designation.toLowerCase().includes("manager");
                const currentUserId = Auth.getUserId().toLowerCase();

                let pending = res.data.filter(l => l.Status === "Pending");
                
                // If Manager is logged in, filter to show ONLY employees who have this Manager designated as their ReportingManager
                if (isManager) {
                    pending = pending.filter(l => {
                        const emp = this.employeesData.find(e => e.EmployeeID.toString().toLowerCase() === l.EmployeeID.toString().toLowerCase());
                        if (!emp || !emp.ReportingManager) return false;
                        const managers = emp.ReportingManager.split(',').map(m => m.trim().toLowerCase());
                        return managers.includes(currentUserId);
                    });
                }
                
                if (pending.length === 0) {
                    container.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">No pending leaves to review.</td></tr>`;
                    return;
                }

                container.innerHTML = pending.map(l => `
                    <tr>
                        <td><strong>${l.EmployeeID}</strong></td>
                        <td>${l.EmployeeName}</td>
                        <td><span class="badge bg-secondary">${l.Type}</span></td>
                        <td>${l.StartDate} to ${l.EndDate}</td>
                        <td>${l.Duration} days</td>
                        <td>${l.Reason}</td>
                        <td>
                            ${l.Attachment ? `<a href="${l.Attachment}" target="_blank" class="btn btn-xs btn-outline-info py-0 px-2" style="font-size: 0.75rem;"><i class="fa-solid fa-file-image"></i> View Proof</a>` : '<span class="text-muted small">None</span>'}
                        </td>
                        <td>
                            <button class="btn btn-sm btn-success" onclick="AdminApp.reviewLeave('${l.LeaveID}', 'Approved')"><i class="fa-solid fa-check"></i> Approve</button>
                            <button class="btn btn-sm btn-danger" onclick="AdminApp.reviewLeave('${l.LeaveID}', 'Rejected')"><i class="fa-solid fa-times"></i> Reject</button>
                        </td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            container.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to stream leaves requests.</td></tr>`;
        }
    },

    // Review and mutate leave status
    reviewLeave(leaveId, status) {
        // Enforce Manager restrictions client-side
        const role = Auth.getRole();
        const designation = localStorage.getItem("EAMS_designation") || "";
        const isManager = (role === "Manager") || designation.toLowerCase().includes("manager");

        if (isManager && status === "Approved" && this.leaveRequestsData) {
            const request = this.leaveRequestsData.find(l => l.LeaveID === leaveId);
            if (request && request.Type === "Weekly Off") {
                const duration = parseInt(request.Duration) || 0;
                if (duration >= 3) {
                    Swal.fire("Approval Restricted", "Managers cannot approve Weekly Off requests of 3 or more days. This must be approved by the Administrator.", "warning");
                    return;
                }

                // Check 15-day WO limits
                const S = new Date(request.StartDate);
                const E = new Date(request.EndDate);
                
                const windowStart = new Date(S);
                windowStart.setDate(windowStart.getDate() - 15);
                
                const windowEnd = new Date(E);
                windowEnd.setDate(windowEnd.getDate() + 15);
                
                const uniqueApprovedWoDates = {};
                const empId = request.EmployeeID.toString().toLowerCase();

                this.leaveRequestsData.forEach(l => {
                    if (l.EmployeeID.toString().toLowerCase() === empId && l.Type === "Weekly Off" && l.Status === "Approved" && l.LeaveID !== leaveId) {
                        let curr = new Date(l.StartDate);
                        const end = new Date(l.EndDate);
                        if (!isNaN(curr.getTime()) && !isNaN(end.getTime())) {
                            curr.setHours(0,0,0,0);
                            end.setHours(0,0,0,0);
                            while (curr <= end) {
                                if (curr >= windowStart && curr <= windowEnd) {
                                    const key = `${curr.getFullYear()}-${curr.getMonth() + 1}-${curr.getDate()}`;
                                    uniqueApprovedWoDates[key] = true;
                                }
                                curr.setDate(curr.getDate() + 1);
                            }
                        }
                    }
                });

                // Proposed count
                let currProposed = new Date(S);
                const endProposed = new Date(E);
                let proposedCount = 0;
                if (!isNaN(currProposed.getTime()) && !isNaN(endProposed.getTime())) {
                    currProposed.setHours(0,0,0,0);
                    endProposed.setHours(0,0,0,0);
                    while (currProposed <= endProposed) {
                        proposedCount++;
                        currProposed.setDate(currProposed.getDate() + 1);
                    }
                }

                const totalWoTaken = Object.keys(uniqueApprovedWoDates).length + proposedCount;
                if (totalWoTaken > 2) {
                    Swal.fire("Approval Restricted", `Managers cannot approve Weekly Off requests when the employee exceeds 2 WOs within a 15-day period (This request results in ${totalWoTaken} WOs). This must be approved by the Administrator.`, "warning");
                    return;
                }
            }
        }

        Swal.fire({
            title: `Confirm Leave ${status}?`,
            input: "text",
            inputLabel: "Add review remarks/comments (optional):",
            inputPlaceholder: "Type here...",
            showCancelButton: true,
            confirmButtonColor: status === "Approved" ? "#10B981" : "#EF4444",
            confirmButtonText: `Confirm ${status}`
        }).then(async (result) => {
            if (result.isConfirmed) {
                const comments = result.value || "";
                
                const res = await API.call({
                    action: "reviewLeave",
                    leaveId: leaveId,
                    status: status,
                    comments: comments,
                    approvedBy: Auth.getUserId()
                });

                if (res.status === "Success") {
                    Swal.fire("Complete", `Leave request has been ${status.toLowerCase()}.`, "success");
                    this.loadLeaveRequests();
                } else {
                    Swal.fire("Error", res.message || "Action failed.", "error");
                }
            }
        });
    },

    // Load Holidays
    async loadHolidaysList(force = false) {
        if (!force && this.holidaysData && this.holidaysData.length > 0) {
            this.renderHolidaysTable();
            return;
        }
        const container = document.getElementById("holidays-table-body");
        container.innerHTML = `<tr><td colspan="4" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;

        try {
            const res = await API.call({ action: "fetchLedger", targetTable: "Holiday" }, false);
            if (res.status === "Success" && res.data) {
                if (res.data.length === 0) {
                    container.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No holidays registered.</td></tr>`;
                    return;
                }

                container.innerHTML = res.data.map(h => `
                    <tr>
                        <td><strong>${h.HolidayID}</strong></td>
                        <td>${h.Date}</td>
                        <td>${h.Name}</td>
                        <td>${h.Type}</td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            container.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to stream holiday configurations.</td></tr>`;
        }
    },

    // Add holiday config
    async saveHolidayRecord() {
        const name = document.getElementById("holiday-name").value;
        const date = document.getElementById("holiday-date").value;
        const type = document.getElementById("holiday-type").value;

        if (!name || !date) {
            Swal.fire("Details Missing", "Please complete all fields.", "warning");
            return;
        }

        try {
            const res = await API.call({
                action: "saveHoliday",
                data: {
                    HolidayID: `HOL-${Date.now().toString().slice(-6)}`,
                    Name: name,
                    Date: date,
                    Type: type
                }
            });

            if (res.status === "Success") {
                Swal.fire("Saved", "Holiday record added.", "success").then(() => {
                    document.getElementById("form-add-holiday").reset();
                    this.loadHolidaysList();
                });
            }
        } catch (err) {
            console.error("Holiday save failed", err);
        }
    },

    // Compile reports view
    async runReportGeneration() {
        const type = document.getElementById("report-select-type").value;
        const dateVal = document.getElementById("report-select-date").value;
        
        const containerHeaders = document.getElementById("report-table-headers");
        const containerRows = document.getElementById("report-table-rows");
        
        containerRows.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;
        
        try {
            const res = await API.call({
                action: "generateReport",
                reportType: type,
                date: dateVal
            });

            if (res.status === "Success" && res.headers && res.data) {
                // Populate headers
                let headHtml = "<tr>";
                res.headers.forEach(h => {
                    if (!isNaN(h)) {
                        headHtml += `<th class="text-center small" style="min-width: 32px; padding: 4px 2px;">${h}</th>`;
                    } else {
                        headHtml += `<th>${h}</th>`;
                    }
                });
                headHtml += "</tr>";
                containerHeaders.innerHTML = headHtml;

                // Populate rows
                if (res.data.length === 0) {
                    containerRows.innerHTML = `<tr><td colspan="${res.headers.length}" class="text-center text-muted">No matching records found.</td></tr>`;
                    return;
                }

                let bodyHtml = "";
                res.data.forEach(row => {
                    bodyHtml += "<tr>";
                    res.headers.forEach(h => {
                        const val = row[h] !== undefined && row[h] !== null ? row[h] : '--';
                        if (!isNaN(h)) {
                            // Color-code matrix table day cells dynamically
                            let cellStyle = "min-width: 32px; padding: 4px 2px; text-align: center;";
                            let textClass = "text-muted small";
                            
                            if (val === "P") textClass = "text-success fw-bold";
                            else if (val === "A") textClass = "text-danger fw-bold";
                            else if (val === "L") textClass = "text-warning fw-bold";
                            else if (val === "H") textClass = "text-info fw-bold";
                            else if (val === "WO") textClass = "text-primary fw-bold";
                            else if (val === "LV") textClass = "text-danger fw-bold";
                            else if (val === "HL") textClass = "text-dark fw-bold";

                            bodyHtml += `<td class="${textClass}" style="${cellStyle}">${val}</td>`;
                        } else {
                            bodyHtml += `<td style="padding: 8px 12px;">${val}</td>`;
                        }
                    });
                    bodyHtml += "</tr>";
                });
                containerRows.innerHTML = bodyHtml;
            }
        } catch (err) {
            containerRows.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Failed to compile reports data matrix.</td></tr>`;
        }
    },

    // Export report data to CSV
    exportReportCSV() {
        const type = document.getElementById("report-select-type").value;
        const tableHeaders = [];
        document.querySelectorAll("#report-table-headers th").forEach(th => tableHeaders.push(th.innerText));
        
        const rows = [];
        document.querySelectorAll("#report-table-rows tr").forEach(tr => {
            const cells = tr.querySelectorAll("td");
            if (cells.length > 1) {
                const rowObj = {};
                cells.forEach((td, idx) => {
                    rowObj[tableHeaders[idx]] = td.innerText;
                });
                rows.push(rowObj);
            }
        });

        if (rows.length === 0) {
            Swal.fire("Export Blank", "No report data available to export.", "warning");
            return;
        }

        Utils.exportToCSV(tableHeaders, rows, `${type}_Report_${Utils.formatDate(new Date())}.csv`);
    },

    // Trigger database logs purging
    async purgeOldDatabaseLogs() {
        const select = document.getElementById("purge-months-select");
        if (!select) return;
        const months = select.value;

        Swal.fire({
            title: "Execute Database Purge?",
            text: `This will permanently delete all logs, leaves, and attendance data older than ${months} months. Make sure you have exported backups first!`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#EF4444",
            confirmButtonText: "Yes, Delete Permanently",
            cancelButtonText: "Cancel"
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.fire({
                    title: "Purging Database...",
                    html: "This transaction might take a few seconds.",
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                try {
                    const res = await API.call({
                        action: "purgeLogs",
                        months: months
                    });

                    Swal.close();

                    if (res.status === "Success") {
                        Swal.fire("Purge Completed", res.message, "success");
                    } else {
                        Swal.fire("Failed", res.message, "error");
                    }
                } catch (err) {
                    Swal.close();
                    Swal.fire("Error", "Server communications failed.", "error");
                    console.error("Purging failed", err);
                }
            }
        });
    },

    // Load Missing Punch Correction Requests
    async loadCorrectionRequests(force = false) {
        if (!force && this.correctionsData && this.correctionsData.length > 0) {
            this.renderCorrectionsTable();
            return;
        }
        const container = document.getElementById("corrections-table-body");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="11" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;

        try {
            const res = await API.call({ action: "fetchCorrections" }, false);
            if (res.status === "Success" && res.data) {
                this.correctionsData = res.data;
                this.renderCorrectionRequests(this.correctionsData);
            } else {
                container.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-danger">${res.message || 'Failed to load requests.'}</td></tr>`;
            }
        } catch (err) {
            console.error("Failed to load corrections", err);
            container.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-danger">Server communication error.</td></tr>`;
        }
    },

    renderCorrectionRequests(requests) {
        const container = document.getElementById("corrections-table-body");
        if (!container) return;

        if (!requests || requests.length === 0) {
            container.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted">No punch correction requests found.</td></tr>`;
            return;
        }

        // Sort requests by SubmittedAt descending (newest first)
        requests.sort((a, b) => new Date(b.SubmittedAt) - new Date(a.SubmittedAt));

        container.innerHTML = requests.map(r => {
            const isPending = r.Status === "Pending";
            let statusBadge = `<span class="badge bg-secondary">${r.Status}</span>`;
            if (r.Status === "Approved") {
                statusBadge = `<span class="badge bg-success">Approved</span>`;
            } else if (r.Status === "Rejected") {
                statusBadge = `<span class="badge bg-danger">Rejected</span>`;
            }

            let attachmentHtml = "--";
            if (r.Attachment && r.Attachment !== "") {
                attachmentHtml = `<a href="${r.Attachment}" target="_blank" class="btn btn-sm btn-outline-primary" title="View Attachment"><i class="fa-solid fa-file-arrow-down"></i> Open File</a>`;
            }

            let actionsHtml = "--";
            if (isPending) {
                actionsHtml = `
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-success px-2" onclick="AdminApp.processCorrectionRequest('${r.RequestID}', 'Approved')"><i class="fa-solid fa-check"></i> Approve</button>
                        <button class="btn btn-sm btn-danger px-2" onclick="AdminApp.processCorrectionRequest('${r.RequestID}', 'Rejected')"><i class="fa-solid fa-xmark"></i> Reject</button>
                    </div>
                `;
            }

            return `
                <tr>
                    <td><strong>${r.RequestID}</strong></td>
                    <td>${r.EmployeeID}</td>
                    <td>${r.EmployeeName}</td>
                    <td>${r.Date}</td>
                    <td><span class="badge bg-dark">${r.RequestType}</span></td>
                    <td><span class="text-success">${r.RequestedInTime || '--'}</span></td>
                    <td><span class="text-danger">${r.RequestedOutTime || '--'}</span></td>
                    <td class="text-truncate" style="max-width: 150px;" title="${r.Reason}">${r.Reason}</td>
                    <td>${attachmentHtml}</td>
                    <td>${statusBadge}</td>
                    <td>${actionsHtml}</td>
                </tr>
            `;
        }).join('');
    },

    async processCorrectionRequest(reqId, status) {
        const self = this;
        Swal.fire({
            title: `Are you sure?`,
            text: `You are about to mark request ${reqId} as ${status}.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: status === "Approved" ? "#198754" : "#DC3545",
            confirmButtonText: `Yes, ${status}`
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.fire({
                    title: "Processing Request...",
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                try {
                    const res = await API.call({
                        action: "processCorrection",
                        requestId: reqId,
                        status: status
                    });

                    Swal.close();

                    if (res.status === "Success") {
                        Swal.fire("Processed", res.message, "success").then(() => {
                            self.loadCorrectionRequests();
                        });
                    } else {
                        Swal.fire("Transaction Failed", res.message, "error");
                    }
                } catch (err) {
                    Swal.close();
                    console.error("Processing correction failed", err);
                    Swal.fire("Error", "Server communication failure.", "error");
                }
            }
        });
    },

    cleanDateFormat(dateStr) {
        if (!dateStr) return "--";
        const str = dateStr.toString();
        if (str.includes("GMT") || str.includes("00:00:00")) {
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const day = d.getDate().toString().padStart(2, '0');
                    const month = months[d.getMonth()];
                    const year = d.getFullYear();
                    return `${day}-${month}-${year}`;
                }
            } catch(e) {}
        }
        return dateStr;
    },

    cleanTimeFormat(timeStr) {
        if (!timeStr || timeStr === "--") return "--";
        const str = timeStr.toString();
        if (str.includes("GMT") || str.includes("1899")) {
            try {
                const d = new Date(timeStr);
                if (!isNaN(d.getTime())) {
                    const hrs = d.getHours().toString().padStart(2, '0');
                    const mins = d.getMinutes().toString().padStart(2, '0');
                    const secs = d.getSeconds().toString().padStart(2, '0');
                    return `${hrs}:${mins}:${secs}`;
                }
            } catch(e) {}
        }
        return timeStr;
    },
 
    normalizeSheetDate(dateInput) {
        if (!dateInput) return null;
        if (dateInput instanceof Date) {
            return new Date(dateInput);
        }
        let d = new Date(dateInput);
        if (isNaN(d.getTime())) {
            const str = dateInput.toString().trim();
            const match = str.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{4})$/);
            if (match) {
                const day = parseInt(match[1], 10);
                const monthStr = match[2].toLowerCase();
                const year = parseInt(match[3], 10);
                const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                const monthIndex = months.indexOf(monthStr);
                if (monthIndex !== -1) {
                    d = new Date(year, monthIndex, day, 12, 0, 0);
                }
            }
        } else {
            const str = dateInput.toString();
            if (str.includes("T") && str.includes("Z")) {
                d = new Date(d.getTime() + 12 * 60 * 60 * 1000);
            }
        }
        return isNaN(d.getTime()) ? null : d;
    },

    filterAttendanceTable() {
        this.renderAttendanceTable();
    },

    resetAttendanceFilters() {
        const emp = document.getElementById("filter-att-emp");
        const start = document.getElementById("filter-att-start");
        const end = document.getElementById("filter-att-end");
        const status = document.getElementById("filter-att-status");
        
        if (emp) emp.value = "";
        if (start) start.value = "";
        if (end) end.value = "";
        if (status) status.value = "";
        
        this.renderAttendanceTable();
    },

    // Load Monthly Registry Matrix directly on Admin Dashboard
    async loadDashboardMatrix(force = false) {
        const dateInput = document.getElementById("dashboard-matrix-month");
        if (!dateInput) return;
        const targetVal = dateInput.value; // e.g. "2026-07"
        
        const containerHeaders = document.getElementById("dashboard-matrix-headers");
        const containerRows = document.getElementById("dashboard-matrix-rows");
        if (!containerHeaders || !containerRows) return;
        
        if (!force && this.matrixCachedMonth === targetVal && this.matrixCachedData) {
            // Already loaded for this month, just render from cache
            this.renderDashboardMatrixFromCache();
            return;
        }

        containerRows.innerHTML = `<tr><td colspan="10" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;
        
        try {
            // Fetch employees database cache if empty
            if (this.employeesData.length === 0) {
                const empRes = await API.call({ action: "fetchLedger", targetTable: "Employees" }, false);
                if (empRes.status === "Success" && empRes.data) {
                    this.employeesData = empRes.data;
                }
            }

            const res = await API.call({
                action: "generateReport",
                reportType: "Matrix",
                date: targetVal ? `${targetVal}-01` : ""
            }, false);

            if (res.status === "Success" && res.headers && res.data) {
                this.matrixCachedData = res.data;
                this.matrixCachedHeaders = res.headers;
                this.matrixCachedMonth = targetVal;
                
                this.renderDashboardMatrixFromCache();
            }
        } catch (err) {
            containerRows.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Communications error fetching registry.</td></tr>`;
        }
    },

    // Backward-compatible alias for older UI bundles / cached scripts.
    // Some clients still call the legacy matrix loader name after updates.
    async loadAttendanceMatrix(force = false) {
        return this.loadDashboardMatrix(force);
    },

    renderDashboardMatrixFromCache() {
        const containerHeaders = document.getElementById("dashboard-matrix-headers");
        const containerRows = document.getElementById("dashboard-matrix-rows");
        const targetVal = this.matrixCachedMonth;

        let headHtml = "<tr>";
        this.matrixCachedHeaders.forEach(h => {
            if (!isNaN(h)) {
                headHtml += `<th class="text-center small" style="min-width: 32px; padding: 4px 2px;">${h}</th>`;
            } else {
                headHtml += `<th>${h}</th>`;
            }
        });
        headHtml += "</tr>";
        containerHeaders.innerHTML = headHtml;

        if (this.matrixCachedData.length === 0) {
            containerRows.innerHTML = `<tr><td colspan="${this.matrixCachedHeaders.length}" class="text-center text-muted">No active employee roster records found.</td></tr>`;
            return;
        }

        let bodyHtml = "";
        this.matrixCachedData.forEach(row => {
            bodyHtml += "<tr>";
            this.matrixCachedHeaders.forEach(h => {
                const val = row[h] !== undefined && row[h] !== null ? row[h] : '--';
                if (h === "Name") {
                    bodyHtml += `<td style="padding: 8px 12px;"><a href="#" class="text-decoration-none fw-semibold text-brand" onclick="AdminApp.showEmployeeMonthAudit('${row.EmployeeID}', '${targetVal}')">${val}</a></td>`;
                } else if (!isNaN(h)) {
                    let cellStyle = "min-width: 32px; padding: 4px 2px; text-align: center; cursor: pointer;";
                    let textClass = "text-muted small";
                    
                    let innerHtml = val;
                    if (val === "P") textClass = "text-success fw-bold";
                    else if (val === "A") textClass = "text-danger fw-bold";
                    else if (val === "L") textClass = "text-warning fw-bold";
                    else if (val === "H") textClass = "text-info fw-bold";
                    else if (val === "WO") textClass = "text-primary fw-bold";
                    else if (val === "LV") textClass = "text-danger fw-bold";
                    else if (val === "HL") textClass = "text-dark fw-bold";
                    else if (val === "ACT_IN" || val.trim() === "ACT_IN") { 
                        textClass = ""; 
                        innerHtml = `<span class="badge bg-success rounded-pill shadow-sm" style="font-size:0.7rem; padding: 4px 8px;">IN</span>`; 
                    }
                    else if (val === "MISS_OUT" || val.trim() === "MISS_OUT") { 
                        textClass = ""; 
                        innerHtml = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.7rem; padding: 4px 6px;">OUT</span>`; 
                    }
                    else if (val === "MISS_IN" || val.trim() === "MISS_IN") { 
                        textClass = ""; 
                        innerHtml = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.7rem; padding: 4px 8px;">IN</span>`; 
                    }

                    bodyHtml += `<td class="${textClass}" style="${cellStyle}" onclick="AdminApp.showDayPunchAudit('${row.EmployeeID}', '${targetVal}-${h.toString().padStart(2, '0')}')">${innerHtml}</td>`;
                } else {
                    bodyHtml += `<td style="padding: 8px 12px;">${val}</td>`;
                }
            });
            bodyHtml += "</tr>";
        });
        containerRows.innerHTML = bodyHtml;
    },

    // Normalize any backend date format (dd-MMM-yyyy, M/D/YYYY, ISO) to YYYY-MM-DD
    // The backend formatDate() returns "dd-MMM-yyyy" (e.g. "10-Jul-2026")
    normDateToISO(d) {
        if (!d) return "";
        const s = d.toString().trim();
        // Already ISO YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // dd-MMM-yyyy  e.g. 10-Jul-2026
        const months = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
                         jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
        const m1 = s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{4})$/);
        if (m1) {
            const mon = months[m1[2].toLowerCase()] || "01";
            return `${m1[3]}-${mon}-${m1[1].toString().padStart(2,'0')}`;
        }
        // M/D/YYYY  e.g. 7/10/2026
        const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
        // Fallback: try native Date
        try {
            const dt = new Date(s);
            if (!isNaN(dt)) {
                return `${dt.getFullYear()}-${(dt.getMonth()+1).toString().padStart(2,'0')}-${dt.getDate().toString().padStart(2,'0')}`;
            }
        } catch(e) {}
        return s;
    },

    // Sub-view navigation helpers
    showMatrixGridHome() {
        document.getElementById("matrix-grid-subview").style.display = "";
        document.getElementById("matrix-emp-detail-subview").style.display = "none";
        document.getElementById("matrix-punch-detail-subview").style.display = "none";
        this._matrixPunchFromEmployee = false;
    },

    showMatrixEmpDetailView() {
        document.getElementById("matrix-grid-subview").style.display = "none";
        document.getElementById("matrix-emp-detail-subview").style.display = "";
        document.getElementById("matrix-punch-detail-subview").style.display = "none";
    },

    showMatrixPunchDetailView() {
        document.getElementById("matrix-grid-subview").style.display = "none";
        document.getElementById("matrix-emp-detail-subview").style.display = "none";
        document.getElementById("matrix-punch-detail-subview").style.display = "";
    },

    backFromPunchAudit() {
        if (this._matrixPunchFromEmployee) {
            this.showMatrixEmpDetailView();
        } else {
            this.showMatrixGridHome();
        }
    },

    // Click Employee Name: Audit Month Log Details (Full-page sub-view)
    async showEmployeeMonthAudit(employeeId, yearMonth) {
        // Switch to employee detail sub-view
        this.switchTab("matrix-dashboard");
        this.showMatrixEmpDetailView();
        this._matrixPunchFromEmployee = false;
        this._currentAuditEmployeeId = employeeId;
        this._currentAuditYearMonth = yearMonth;

        document.getElementById("audit-emp-name-id").innerText = "Loading...";
        document.getElementById("audit-emp-branch").innerText = "--";
        document.getElementById("audit-emp-dept-desig").innerText = "--";
        document.getElementById("audit-emp-rows").innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;
        
        try {
            // Ensure employee list is loaded
            if (this.employeesData.length === 0) {
                const empRes = await API.call({ action: "fetchLedger", targetTable: "Employees" }, false);
                if (empRes.status === "Success" && empRes.data) this.employeesData = empRes.data;
            }

            const emp = this.employeesData.find(e => e.EmployeeID.toString().toLowerCase() === employeeId.toLowerCase());
            if (emp) {
                document.getElementById("audit-emp-name-id").innerText = `${emp.Name} (${emp.EmployeeID})`;
                document.getElementById("audit-emp-branch").innerText = emp.Branch || "Main Office";
                document.getElementById("audit-emp-dept-desig").innerText = `${emp.Department || '--'} / ${emp.Designation || '--'}`;
            }

            // Single call — fetchHistoryLogs returns { data: attLogs, leaves: approvedLeaves }
            const res = await API.call({ action: "fetchHistory", employeeId: employeeId }, false);
            if (res.status === "Success" && res.data) {
                // Build lookup map by NORMALIZED ISO date and merge split punch records
                const logMap = {};
                res.data.forEach(log => {
                    if (!log.Date) return;
                    const dKey = this.normDateToISO(log.Date);
                    if (!logMap[dKey]) {
                        logMap[dKey] = { ...log };
                    } else {
                        const existing = logMap[dKey];
                        // Merge Punch In
                        if (!existing.PunchIn || existing.PunchIn === "--" || existing.PunchIn === "") existing.PunchIn = log.PunchIn;
                        // Merge Punch Out
                        if (!existing.PunchOut || existing.PunchOut === "--" || existing.PunchOut === "") existing.PunchOut = log.PunchOut;
                        // Merge Working Hours
                        if (!existing.WorkingHours || existing.WorkingHours === "--" || existing.WorkingHours === "") existing.WorkingHours = log.WorkingHours;
                        
                        // Merge Status (prefer concrete statuses over generic absence)
                        if (log.Status && (log.Status.includes("Mismatch") || log.Status.includes("Late") || log.Status.includes("Present") || log.Status.includes("Manual") || log.Status.includes("Half"))) {
                            existing.Status = log.Status;
                        }
                        // Merge Remarks
                        if (log.Remarks && log.Remarks !== "") {
                            existing.Remarks = existing.Remarks && existing.Remarks !== "--" ? existing.Remarks + " | " + log.Remarks : log.Remarks;
                        }
                    }

                    // Dynamically calculate working hours if both punches exist but hours are missing
                    const current = logMap[dKey];
                    if ((!current.WorkingHours || current.WorkingHours === "--" || current.WorkingHours === "") && 
                        current.PunchIn && current.PunchIn !== "--" && current.PunchIn !== "" &&
                        current.PunchOut && current.PunchOut !== "--" && current.PunchOut !== "") {
                        
                        try {
                            const parseTime = (timeStr) => {
                                const parts = timeStr.split(':');
                                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
                            };
                            const inMin = parseTime(current.PunchIn);
                            const outMin = parseTime(current.PunchOut);
                            let diff = outMin - inMin;
                            if (diff < 0) diff = 0;
                            const hrs = Math.floor(diff / 60);
                            const mins = diff % 60;
                            current.WorkingHours = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }
                });

                // Approved leaves — normalize StartDate/EndDate for comparison
                const approvedLeaves = (res.leaves || []).map(lv => ({
                    ...lv,
                    _startISO: this.normDateToISO(lv.StartDate),
                    _endISO:   this.normDateToISO(lv.EndDate)
                }));

                const parts = yearMonth.split('-');
                const year  = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                const lastDay = new Date(year, month + 1, 0).getDate();

                const rows = [];
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                for (let d = 1; d <= lastDay; d++) {
                    const checkDate = new Date(year, month, d);
                    const dateKey = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

                    if (checkDate > today) continue;

                    const log = logMap[dateKey]; // dateKey is already YYYY-MM-DD
                    if (log) {
                        // Mirror backend Matrix status classification exactly
                        const dbStatus = log.Status || "Present";

                        rows.push({
                            date: dateKey,
                            status: dbStatus,
                            punchIn: log.PunchIn || "--",
                            punchOut: log.PunchOut || "--",
                            workingHours: log.WorkingHours || "--",
                            remarks: log.Remarks || "--",
                            attId: log.AttendanceID || ""
                        });
                    } else {
                        // No attendance record — check approved leaves (normalized dates)
                        let leaveText = "Absent";
                        for (let l = 0; l < approvedLeaves.length; l++) {
                            const start = new Date(approvedLeaves[l]._startISO);
                            const end   = new Date(approvedLeaves[l]._endISO);
                            start.setHours(0,0,0,0);
                            end.setHours(23,59,59,999);
                            if (checkDate >= start && checkDate <= end) {
                                const lType = approvedLeaves[l].Type || "Leave";
                                leaveText = `On Leave (${lType})`;
                                break;
                            }
                        }

                        rows.push({
                            date: dateKey,
                            status: leaveText,
                            punchIn: "--",
                            punchOut: "--",
                            workingHours: "--",
                            remarks: "--",
                            attId: ""
                        });
                    }
                }

                // Show newest first
                rows.sort((a, b) => new Date(b.date) - new Date(a.date));

                if (rows.length === 0) {
                    document.getElementById("audit-emp-rows").innerHTML = `<tr><td colspan="6" class="text-center text-muted">No records for this period.</td></tr>`;
                    return;
                }

                document.getElementById("audit-emp-rows").innerHTML = rows.map(r => {
                    // Badge color — mirrors Matrix cell colors exactly
                    let badgeClass = "bg-secondary";
                    const s = r.status;
                    if (s.startsWith("Present") || s.startsWith("Completed") || s.startsWith("Manual")) badgeClass = "bg-success";
                    else if (s.startsWith("Late"))            badgeClass = "bg-warning text-dark";
                    else if (s.startsWith("Half"))            badgeClass = "bg-info text-dark";
                    else if (s.startsWith("Absent") || s.includes("Missing")) badgeClass = "bg-danger";
                    else if (s.startsWith("Weekly Off") || s.includes("Weekly Off")) badgeClass = "bg-primary";
                    else if (s.startsWith("Leave") || s.includes("Leave")) badgeClass = "bg-purple text-white";
                    else if (s === "On Leave (Weekly Off)")   badgeClass = "bg-primary";
                    else if (s.startsWith("On Leave"))        badgeClass = "bg-secondary";

                    // Clean time values (handles 1899-epoch Google Sheets time-only blobs)
                    const inDisplay  = this.cleanTimeDisplay(r.punchIn);
                    const outDisplay = this.cleanTimeDisplay(r.punchOut);

                    // Build select options
                    const sClean = (r.status || "").replace(/\[.*?\]\s*/g, '').replace(/\(.*?$/g, '').trim();
                    let options = ["Present", "Absent", "Half Day", "Late", "Manual Punch", "Weekly Off", "Leave", "On Leave"];
                    if (sClean && !options.includes(sClean)) options.push(sClean); // Ensure current status is always selectable
                    const selectOptions = options.map(opt => `<option value="${opt}" ${sClean === opt ? 'selected' : ''}>${opt}</option>`).join('');

                    return `
                        <tr style="cursor:pointer;" onclick="AdminApp.showDayPunchAudit('${employeeId}', '${r.date}', true)" title="Click to view punch verification details">
                            <td><strong class="text-brand">${r.date}</strong></td>
                            <td><span class="badge ${badgeClass}">${r.status}</span></td>
                            <td>${inDisplay}</td>
                            <td>${outDisplay}</td>
                            <td>${r.workingHours}</td>
                            <td class="small text-muted">${r.remarks}</td>
                            <td onclick="event.stopPropagation()">
                                <select class="form-select form-select-sm bg-dark text-white border-secondary day-status-select" style="width:140px;" data-original="${sClean}" data-empid="${employeeId}" data-date="${r.date}" data-attid="${r.attId}" onchange="AdminApp.markStatusChanged(this)">
                                    ${selectOptions}
                                </select>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                document.getElementById("audit-emp-rows").innerHTML = `<tr><td colspan="6" class="text-center text-danger">Failed to retrieve logs. ${res.message || ''}</td></tr>`;
            }
        } catch (err) {
            document.getElementById("audit-emp-rows").innerHTML = `<tr><td colspan="6" class="text-center text-danger">Communication failure.</td></tr>`;
        }
    },

    // Helper: convert a raw selfie URL to a direct viewable image URL
    resolveImageUrl(url) {
        if (!url || url.toString().trim() === "") return null;
        const s = url.toString().trim();
        // Google Drive file/view URL → use lh3 direct image serve (no CORS issues)
        const driveMatch = s.match(/\/file\/d\/([^/]+)/);
        if (driveMatch) {
            const fileId = driveMatch[1].replace(/\/view.*$/, '').replace(/[?].*$/, '');
            // Use the thumbnail endpoint because it is more reliable for embedded admin previews.
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
        }
        // Already a direct image URL
        return s;
    },

    // Helper: safely format a time value from sheet (handles "HH:MM:SS" and 1899 date objects)
    cleanTimeDisplay(raw) {
        if (!raw || raw === "" || raw === "--") return "--";
        const s = raw.toString().trim();
        // "HH:MM:SS" pattern
        if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.substring(0, 5);
        // Full date-time string — extract time part
        const dt = new Date(s);
        if (!isNaN(dt)) {
            return dt.getHours().toString().padStart(2, '0') + ':' + dt.getMinutes().toString().padStart(2, '0');
        }
        return s;
    },

    // Helper: render a selfie box
    renderSelfieBox(containerId, imageUrl) {
        const box = document.getElementById(containerId);
        if (!box) return;
        const src = this.resolveImageUrl(imageUrl);
        if (src) {
            box.innerHTML = `<img src="${src}" class="w-100 h-100" style="object-fit:cover; cursor:pointer;" alt="Selfie" onclick="window.open('${src}','_blank')" onerror="this.onerror=null;this.outerHTML='\x3cdiv class=\"d-flex align-items-center justify-content-center h-100 text-muted flex-column\"\x3e\x3ci class=\"fa-solid fa-image-portrait fa-3x mb-2 opacity-50\"\x3e\x3c/i\x3e\x3cspan class=\"small\"\x3eImage unavailable\x3c/span\x3e\x3c/div\x3e'">`;
        } else {
            box.innerHTML = `<div class="d-flex align-items-center justify-content-center h-100 text-muted flex-column"><i class="fa-solid fa-image-portrait fa-3x mb-2 opacity-50"></i><span class="small">No Selfie</span></div>`;
        }
    },

    // Click Status Cell: Verification Selfie, Location Map Details & Alerts (Full-page sub-view)
    async showDayPunchAudit(employeeId, dateStr, fromEmployee = false) {
        this._currentAuditDateStr = dateStr;
        this._currentAuditEmployeeId = employeeId;
        this._currentAuditLog = null; // Will set below if found

        // Navigate to punch detail sub-view
        this.switchTab("matrix-dashboard");
        this._matrixPunchFromEmployee = fromEmployee;
        this.showMatrixPunchDetailView();

        // Reset all fields
        document.getElementById("day-audit-emp-name").innerText = "Loading...";
        document.getElementById("day-audit-date").innerText = dateStr;
        document.getElementById("day-audit-status").className = "badge bg-secondary";
        document.getElementById("day-audit-status").innerText = "--";
        document.getElementById("day-audit-in-time").innerText = "--";
        document.getElementById("day-audit-out-time").innerText = "--";
        document.getElementById("day-audit-working-hours").innerText = "--";
        document.getElementById("day-audit-dist-in").innerText = "Distance: --";
        document.getElementById("day-audit-dist-out").innerText = "Distance: --";
        document.getElementById("day-audit-remarks").innerText = "--";
        document.getElementById("day-audit-remarks").className = "fw-semibold text-muted";
        document.getElementById("day-audit-map-in").classList.add("d-none");
        document.getElementById("day-audit-map-out").classList.add("d-none");
        // Show spinners in selfie boxes
        document.getElementById("day-audit-selfie-in").innerHTML = `<div class="d-flex align-items-center justify-content-center h-100"><div class="spinner-border text-success"></div></div>`;
        document.getElementById("day-audit-selfie-out").innerHTML = `<div class="d-flex align-items-center justify-content-center h-100"><div class="spinner-border text-danger"></div></div>`;

        try {
            // Ensure employee list loaded
            if (this.employeesData.length === 0) {
                const empRes = await API.call({ action: "fetchLedger", targetTable: "Employees" }, false);
                if (empRes.status === "Success" && empRes.data) this.employeesData = empRes.data;
            }

            const emp = this.employeesData.find(e => e.EmployeeID.toString().toLowerCase() === employeeId.toLowerCase());
            document.getElementById("day-audit-emp-name").innerText = emp ? `${emp.Name} (${emp.EmployeeID})` : employeeId;

            // Fetch attendance records — fetchHistoryLogs returns data + leaves
            const res = await API.call({ action: "fetchHistory", employeeId: employeeId }, false);
            if (res.status === "Success" && res.data) {
                // Find matching record — normalize both sides to ISO before comparing
                // Also merge records for same date (manual corrections can create 2nd row)
                const dayLogs = res.data.filter(a => this.normDateToISO(a.Date) === dateStr);
                // Merge: primary punch record first, then any correction/manual
                const log = dayLogs.find(a => (a.Status || "").indexOf("Manual") === -1) || dayLogs[0];
                const correctionLog = dayLogs.find(a => (a.Status || "").indexOf("Manual") !== -1 && a !== log);

                if (log) {
                    this._currentAuditLog = log;
                    // Status badge
                    const status = log.Status || "Present";
                    
                    // Preselect dropdown
                    const sel = document.getElementById("day-audit-status-edit");
                    if (sel) {
                        const sClean = status.replace(/\[.*?\]\s*/g, '').replace(/\(.*?$/g, '').trim();
                        let found = false;
                        for(let i=0; i<sel.options.length; i++) {
                            if(sel.options[i].value === sClean || sel.options[i].value === status) {
                                sel.selectedIndex = i; found = true; break;
                            }
                        }
                        if(!found && sel.options.length > 0) sel.selectedIndex = 0;
                    }

                    let badgeClass = "bg-success";
                    if (status.includes("Late"))    badgeClass = "bg-warning text-dark";
                    else if (status.startsWith("Half")) badgeClass = "bg-info text-dark";
                    else if (status.startsWith("Absent") || status.includes("Missing")) badgeClass = "bg-danger";
                    else if (status.includes("Manual") || status.includes("Correction")) badgeClass = "bg-purple text-white";
                    else if (status.includes("Weekly Off")) badgeClass = "bg-primary";
                    document.getElementById("day-audit-status").className = `badge ${badgeClass} fs-6 px-3 py-2`;
                    document.getElementById("day-audit-status").innerText = status;

                    // Times — use cleanTimeDisplay to safely handle 1899-epoch Google Sheets time objects
                    const inTime  = this.cleanTimeDisplay(log.PunchIn  || (correctionLog && correctionLog.PunchIn));
                    const outTime = this.cleanTimeDisplay(log.PunchOut || (correctionLog && correctionLog.PunchOut));
                    document.getElementById("day-audit-in-time").innerText  = inTime  || "--";
                    document.getElementById("day-audit-out-time").innerText = outTime || "--";
                    document.getElementById("day-audit-working-hours").innerText = log.WorkingHours || "--";

                    // --- Punch IN selfie + GPS ---
                    this.renderSelfieBox("day-audit-selfie-in", log.ImageIn);

                    const latIn  = parseFloat(log.LatitudeIn);
                    const lngIn  = parseFloat(log.LongitudeIn);
                    const distIn = log.DistanceIn ? `${parseFloat(log.DistanceIn).toFixed(1)} m` : "--";
                    document.getElementById("day-audit-dist-in").innerText = `GPS Distance: ${distIn}`;
                    if (!isNaN(latIn) && !isNaN(lngIn) && latIn !== 0) {
                        const mapInEl = document.getElementById("day-audit-map-in");
                        mapInEl.href = `https://www.google.com/maps?q=${latIn},${lngIn}`;
                        mapInEl.classList.remove("d-none");
                    }

                    // --- Punch OUT selfie + GPS ---
                    this.renderSelfieBox("day-audit-selfie-out", log.ImageOut);

                    const latOut  = parseFloat(log.LatitudeOut);
                    const lngOut  = parseFloat(log.LongitudeOut);
                    const distOut = log.DistanceOut ? `${parseFloat(log.DistanceOut).toFixed(1)} m` : "--";
                    document.getElementById("day-audit-dist-out").innerText = `GPS Distance: ${distOut}`;
                    if (!isNaN(latOut) && !isNaN(lngOut) && latOut !== 0) {
                        const mapOutEl = document.getElementById("day-audit-map-out");
                        mapOutEl.href = `https://www.google.com/maps?q=${latOut},${lngOut}`;
                        mapOutEl.classList.remove("d-none");
                    }

                    // Remarks
                    const remarks = [log.Remarks, correctionLog && correctionLog.Remarks ? `[Manual] ${correctionLog.Remarks}` : ""]
                        .filter(Boolean).join(" | ") || "No alerts recorded.";
                    const isBad = status.toLowerCase().includes("mismatch")
                        || remarks.toLowerCase().includes("geofence")
                        || remarks.toLowerCase().includes("mismatch")
                        || status.startsWith("Absent");
                    document.getElementById("day-audit-remarks").innerText = remarks;
                    document.getElementById("day-audit-remarks").className = isBad ? "fw-bold text-danger" : "fw-semibold text-success";

                } else {
                    // No punch record — check leaves
                    const leaveRes = res; // leaves already in fetchHistory response
                    let statusText = "Absent (No Record)";
                    let badgeClass = "bg-danger";

                    const approvedLeaves = res.leaves || [];
                    if (approvedLeaves.length > 0) {
                        const checkDate = new Date(dateStr);
                        checkDate.setHours(12, 0, 0, 0);
                        for (const lv of approvedLeaves) {
                            const s = new Date(this.normDateToISO(lv.StartDate));
                            const e = new Date(this.normDateToISO(lv.EndDate));
                            s.setHours(0,0,0,0); e.setHours(23,59,59,999);
                            if (checkDate >= s && checkDate <= e) {
                                statusText = `On Leave (${lv.Type})`;
                                badgeClass = "bg-info text-dark";
                                break;
                            }
                        }
                    }

                    document.getElementById("day-audit-status").className = `badge ${badgeClass} fs-6 px-3 py-2`;
                    document.getElementById("day-audit-status").innerText = statusText;
                    const noRecord = `<div class="d-flex align-items-center justify-content-center h-100 text-muted flex-column"><i class="fa-solid fa-ban fa-3x mb-2 text-danger opacity-75"></i><span class="small">No Punch Record</span></div>`;
                    document.getElementById("day-audit-selfie-in").innerHTML = noRecord;
                    document.getElementById("day-audit-selfie-out").innerHTML = noRecord;
                    document.getElementById("day-audit-remarks").innerText = "No punch records found for this date.";
                    document.getElementById("day-audit-remarks").className = "fw-semibold text-danger";
                }
            } else {
                const errHtml = `<div class="d-flex align-items-center justify-content-center h-100 flex-column text-danger"><i class="fa-solid fa-triangle-exclamation fa-3x mb-2"></i><span class="small">Failed to load</span></div>`;
                document.getElementById("day-audit-selfie-in").innerHTML = errHtml;
                document.getElementById("day-audit-selfie-out").innerHTML = errHtml;
            }
        } catch (err) {
            console.error("Day punch audit failed:", err);
            const errHtml = `<div class="d-flex align-items-center justify-content-center h-100 flex-column text-danger"><i class="fa-solid fa-triangle-exclamation fa-3x mb-2"></i><span class="small">Error: ${err.message}</span></div>`;
            document.getElementById("day-audit-selfie-in").innerHTML = errHtml;
            document.getElementById("day-audit-selfie-out").innerHTML = errHtml;
        }
    },

    // Handle Admin Override Status Update
    async updateAuditStatus() {
        if (!this._currentAuditDateStr || !this._currentAuditEmployeeId) {
            alert("No audit context available.");
            return;
        }
        
        const newStatus = document.getElementById("day-audit-status-edit").value;
        const btn = document.getElementById("btn-audit-update");
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;
        btn.disabled = true;

        const packet = {
            action: "updateAttendance",
            AttendanceID: this._currentAuditLog ? this._currentAuditLog.AttendanceID : `${this._currentAuditEmployeeId}_${this._currentAuditDateStr}`,
            EmployeeID: this._currentAuditEmployeeId,
            Date: this._currentAuditDateStr,
            PunchIn: this._currentAuditLog ? this._currentAuditLog.PunchIn : "",
            PunchOut: this._currentAuditLog ? this._currentAuditLog.PunchOut : "",
            Status: newStatus,
            Remarks: "[Admin Modified] Override status: " + newStatus
        };

        try {
            const res = await API.call(packet, true);
            if (res.status === "Success") {
                // Wipe cache and redraw
                sessionStorage.removeItem("EAMS_admin_cache_history");
                this.historyCache = {}; // memory cache too
                
                // Show toast
                const toast = document.createElement("div");
                toast.className = "position-fixed top-0 start-50 translate-middle-x mt-4 p-3 bg-success text-white rounded shadow-lg";
                toast.style.zIndex = "9999";
                toast.innerText = "Status Updated Successfully!";
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);

                // Reload the same view so changes reflect visually
                await this.showDayPunchAudit(this._currentAuditEmployeeId, this._currentAuditDateStr, this._matrixPunchFromEmployee);
                // Also trigger re-render of matrix if it was the source
                if (this._matrixPunchFromEmployee) {
                    this.showEmployeeMonthAudit(this._currentAuditEmployeeId, this._currentAuditYearMonth);
                } else {
                    await this.loadDashboardMatrix(true);
                }
            } else {
                alert("Update failed: " + res.message);
            }
        } catch (err) {
            console.error("Update failed:", err);
            alert("Communication error during update.");
        } finally {
            btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Changes`;
            btn.disabled = false;
        }
    },

    // Handle dropdown change event to mark visually and show save button
    markStatusChanged(selectElement) {
        if (selectElement.value !== selectElement.dataset.original) {
            selectElement.classList.remove("border-secondary");
            selectElement.classList.add("border-warning", "changed-status");
            document.getElementById("btn-bulk-save").style.display = "inline-block";
        } else {
            selectElement.classList.add("border-secondary");
            selectElement.classList.remove("border-warning", "changed-status");
            // Hide button if no changes left
            if (document.querySelectorAll('.changed-status').length === 0) {
                document.getElementById("btn-bulk-save").style.display = "none";
            }
        }
    },

    // Save all modified dropdowns
    async saveBulkStatusUpdates() {
        const changedSelects = document.querySelectorAll('.changed-status');
        if (changedSelects.length === 0) return;

        const changes = [];
        changedSelects.forEach(sel => {
            changes.push({
                EmployeeID: sel.dataset.empid,
                Date: sel.dataset.date,
                Status: sel.value,
                AttendanceID: sel.dataset.attid || `${sel.dataset.empid}_${sel.dataset.date}`
            });
        });

        const btn = document.getElementById("btn-bulk-save");
        const originalBtnHtml = btn.innerHTML;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;
        btn.disabled = true;
        
        changedSelects.forEach(sel => sel.disabled = true);

        try {
            const res = await API.call({
                action: "batchUpdateAttendance",
                changes: changes
            }, true);

            if (res.status === "Success") {
                sessionStorage.removeItem("EAMS_admin_cache_history");
                this.historyCache = {}; 
                
                const toast = document.createElement("div");
                toast.className = "position-fixed top-0 start-50 translate-middle-x mt-4 p-3 bg-success text-white rounded shadow-lg";
                toast.style.zIndex = "9999";
                toast.innerText = res.message;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);

                btn.style.display = "none";
                await this.showEmployeeMonthAudit(this._currentAuditEmployeeId, this._currentAuditYearMonth);
            } else {
                alert("Bulk update failed: " + res.message);
                changedSelects.forEach(sel => sel.disabled = false);
            }
        } catch (err) {
            console.error("Bulk update failed:", err);
            alert("Communication error during bulk update.");
            changedSelects.forEach(sel => sel.disabled = false);
        } finally {
            btn.innerHTML = originalBtnHtml;
            btn.disabled = false;
        }
    }
};


