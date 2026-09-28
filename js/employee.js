/**
 * EAMS - Employee SPA UI Logic Engine
 */

const EmployeeApp = {
    assignedBranch: null,
    gpsLocked: false,
    currentCoords: { lat: 0, lng: 0, accuracy: 0 },
    activeStream: null,
    capturedImage: null,
    attendanceStats: { present: 0, absent: 0, late: 0, leaves: 0 },
    
    // Calendar month tracking states
    currentCalendarMonth: new Date().getMonth(),
    currentCalendarYear: new Date().getFullYear(),
    personalHistoryLogs: [],
    personalApprovedLeaves: [],

    currentActiveView: "dashboard",
    autoSyncInterval: null,
    autoSyncEnabled: true,
    isSyncing: false,

    // Initialize Employee panel
    async init() {
        if (this.initialized) return;
        this.initialized = true;
        Auth.initSessionLoop();
        
        // Show manager approvals queue link if this employee is a designated manager
        const approvalsLink = document.getElementById("nav-manager-approvals");
        if (approvalsLink) {
            const isManager = localStorage.getItem("EAMS_is_manager") === "Yes";
            approvalsLink.style.display = isManager ? "flex" : "none";
        }

        this.bindEvents();
        this.switchView("dashboard");
        
        // Show cached profile photo immediately for instant loading
        const cachedPhoto = localStorage.getItem("EAMS_profile_photo");
        if (cachedPhoto && cachedPhoto.trim() !== "") {
            this.updateProfilePhotoUI(cachedPhoto);
        }

        await this.loadDashboardData();
        this.startAutoSync();
    },

    // Event Bindings
    bindEvents() {
        // Manual Auto-Sync button
        document.getElementById("btn-sync-emp")?.addEventListener("click", () => {
            this.triggerSync(false);
        });
        // Navigation clicks
        document.querySelectorAll(".bottom-nav-link").forEach(link => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const targetView = link.getAttribute("data-view");
                this.switchView(targetView);
            });
        });

        // Theme toggle
        document.getElementById("theme-toggle-emp")?.addEventListener("click", () => {
            document.body.classList.toggle("dark-mode");
            const isDark = document.body.classList.contains("dark-mode");
            localStorage.setItem("EAMS_dark_mode", isDark ? "true" : "false");
        });

        // Load theme preference
        if (localStorage.getItem("EAMS_dark_mode") === "true") {
            document.body.classList.add("dark-mode");
        }

        // Camera handlers
        document.getElementById("btn-capture-selfie")?.addEventListener("click", () => this.captureSelfie());
        document.getElementById("btn-retake-selfie")?.addEventListener("click", () => this.retakeSelfie());

        // Punch Submission
        document.getElementById("btn-submit-punch-in")?.addEventListener("click", () => this.submitPunch("In"));
        document.getElementById("btn-submit-punch-out")?.addEventListener("click", () => this.submitPunch("Out"));

        // Leave application submit
        document.getElementById("form-apply-leave")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.submitLeaveApplication();
        });

        // Manager relaxation request
        document.getElementById("form-request-relaxation")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.submitRelaxationRequest();
        });

        // Password Change submit
        document.getElementById("form-change-password")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.changePassword();
        });

        // Profile Photo Upload
        const photoContainer = document.getElementById("profile-photo-container");
        const photoInput = document.getElementById("profile-photo-input");
        if (photoContainer && photoInput) {
            photoContainer.addEventListener("click", () => photoInput.click());
            photoInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.uploadProfilePhoto(e.target.files[0]);
                }
            });
        }
    },

    // Switch active view sections
    switchView(viewId) {
        this.currentActiveView = viewId;
        document.querySelectorAll(".employee-view").forEach(section => {
            section.style.display = "none";
        });
        const targetSection = document.getElementById(`view-${viewId}`);
        if (targetSection) {
            targetSection.style.display = "block";
            targetSection.classList.add("animated-fade-in-up");
        }

        // Update active nav status
        document.querySelectorAll(".bottom-nav-link").forEach(link => {
            link.classList.remove("active");
            if (link.getAttribute("data-view") === viewId) {
                link.classList.add("active");
            }
        });

        // Trigger specific view initializations
        if (viewId === "punch") {
            this.startCameraAndGPS();
        } else {
            this.stopCamera();
        }

        if (viewId === "history") {
            this.loadHistoryView();
        } else if (viewId === "approvals") {
            this.loadManagerApprovalsQueue();
        } else if (viewId === "leave") {
            this.loadLeaveView();
        } else if (viewId === "holidays") {
            this.loadHolidaysView();
        } else if (viewId === "profile") {
            this.loadProfileView();
        }
    },

    // Fetch and render employee dashboard statistics
    async loadDashboardData() {
        try {
            const currentUserId = Auth.getUserId();
            if (!currentUserId) {
                console.warn("Invalid or missing user session ID. Please log in again.");
                Auth.logout();
                return;
            }

            document.getElementById("employee-welcome-name").innerText = Auth.getUserName();
            
            const res = await API.call({
                action: "getEmployeeDashboard",
                employeeId: currentUserId
            }, false);

            if (res.status === "Success") {
                this.assignedBranch = res.branchDetails;

                // Sync and display official employee name
                const officialName = res.employeeName || (res.empInfo && res.empInfo.Name) || (res.employeeData && res.employeeData.Name);
                if (officialName) {
                    document.getElementById("employee-welcome-name").innerText = officialName;
                    localStorage.setItem("EAMS_username", officialName);
                }

                // Sync profile metadata if available
                const empMeta = res.empInfo || res.employeeData;
                if (empMeta) {
                    if (empMeta.Branch) localStorage.setItem("EAMS_branch", empMeta.Branch);
                    if (empMeta.Department) localStorage.setItem("EAMS_department", empMeta.Department);
                    if (empMeta.Designation) localStorage.setItem("EAMS_designation", empMeta.Designation);
                    if (empMeta.BankName) localStorage.setItem("EAMS_bank_name", empMeta.BankName);
                    if (empMeta.AccountNumber) localStorage.setItem("EAMS_bank_acc", empMeta.AccountNumber);
                    if (empMeta.IFSCCode) localStorage.setItem("EAMS_bank_ifsc", empMeta.IFSCCode);
                    if (empMeta.BankBranch) localStorage.setItem("EAMS_bank_branch", empMeta.BankBranch);
                    if (empMeta.JoiningDate) localStorage.setItem("EAMS_joining_date", empMeta.JoiningDate);
                }
                
                if (res.employeeData && res.employeeData.ProfilePhoto) {
                    localStorage.setItem("EAMS_profile_photo", res.employeeData.ProfilePhoto);
                    this.updateProfilePhotoUI(res.employeeData.ProfilePhoto);
                }
                this.attendanceStats = res.stats || { present: 0, absent: 0, late: 0, leaves: 0, half: 0 };
                
                // Set stats cards text
                document.getElementById("stat-present").innerText = this.attendanceStats.present || 0;
                document.getElementById("stat-absent").innerText = this.attendanceStats.absent || 0;
                document.getElementById("stat-late").innerText = this.attendanceStats.late || 0;
                document.getElementById("stat-leaves").innerText = this.attendanceStats.leaves || 0;
                document.getElementById("stat-half").innerText = this.attendanceStats.half || 0;

                // Instant prefetch sync for leaves and WO balance
                if (res.leaves) {
                    this.personalLeaves = res.leaves;
                    this.personalApprovedLeaves = (res.leaves || []).filter(l => l.Status === 'Approved');
                    this.personalLeaveBalances = res.leaveBalances;
                    const woBalEl = document.getElementById("leave-balance-wo");
                    if (woBalEl && res.leaveBalances) {
                        woBalEl.innerText = res.leaveBalances.weeklyOff || 0;
                    }
                }

                // Render circular attendance percentage
                const totalWorking = (this.attendanceStats.present || 0) + (this.attendanceStats.absent || 0);
                const percentage = totalWorking > 0 ? Math.round(((this.attendanceStats.present || 0) / totalWorking) * 100) : 100;
                this.updateCircularProgress(percentage);

                // Render Branch info cards
                if (this.assignedBranch) {
                    document.getElementById("dash-branch-name").innerText = this.assignedBranch.BranchName || "--";
                    const timingEl = document.getElementById("dash-office-timing");
                    if (timingEl) {
                        if (this.assignedBranch.isRelaxed) {
                            timingEl.innerHTML = `<span class="badge bg-warning text-dark me-1"><i class="fa-solid fa-umbrella-beach"></i> Relaxed</span> ${this.assignedBranch.OfficeStart || "09:30"} - ${this.assignedBranch.OfficeEnd || "19:30"}`;
                        } else {
                            timingEl.innerText = `${this.assignedBranch.OfficeStart || "09:30"} - ${this.assignedBranch.OfficeEnd || "19:30"}`;
                        }
                    }
                }

                // Render Punch Status
                const punchStateElement = document.getElementById("dash-punch-state");
                this.todayPunchObj = res.todayPunch || null;
                if (res.todayPunch) {
                    if (res.todayPunch.PunchIn && !res.todayPunch.PunchOut) {
                        punchStateElement.innerHTML = `<span class="badge bg-success">Punch In: ${res.todayPunch.PunchIn}</span> (Punch Out Required)`;
                        this.startGeofenceTracking();
                    } else if (res.todayPunch.PunchIn && res.todayPunch.PunchOut) {
                        punchStateElement.innerHTML = `<span class="badge bg-danger">Shift Completed</span> (In: ${res.todayPunch.PunchIn} | Out: ${res.todayPunch.PunchOut})`;
                        this.stopGeofenceTracking();
                    }
                } else {
                    punchStateElement.innerHTML = `<span class="badge bg-secondary">Not Punched In Today</span>`;
                    this.stopGeofenceTracking();
                }

                // Update Talking Angela / Tom Mascot Greeting and Action CTA
                this.updateMascotGreeting(officialName, res.todayPunch);

                // Render Recent activities
                this.renderRecentActivities(res.recentPunches || []);
                
                // Keep punch state banner updated
                this.updatePunchScreenState();

                // Pre-warm Google Location / GPS in background for instant punch response
                if (navigator.geolocation && !this.cachedPosition) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            this.cachedPosition = pos;
                            this.cachedPositionTime = Date.now();
                        },
                        () => {},
                        { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 }
                    );
                }

                // Start background foreground alarm tracker
                this.startOverdueAlarmTracker();
            }
        } catch (err) {
            console.error("Failed to load dashboard metrics", err);
        }
    },

    // Background Auto-Sync loop
    startAutoSync() {
        if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);

        // Auto background poll every 15 seconds
        this.autoSyncInterval = setInterval(() => {
            if (!this.autoSyncEnabled || this.isSyncing) return;
            if (document.visibilityState === 'hidden') return;
            if (!Auth.getUserId()) return;
            this.triggerSync(true);
        }, 15000);

        // Immediate background sync when employee reopens tab
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === 'visible' && this.autoSyncEnabled && !this.isSyncing && Auth.getUserId()) {
                this.triggerSync(true);
            }
        });
    },

    // Trigger on-demand or background sync
    async triggerSync(isSilent = false) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        const iconSync = document.getElementById("icon-sync-emp");
        const textSync = document.getElementById("text-sync-emp");
        if (iconSync) iconSync.classList.add("fa-spin");
        if (textSync && !isSilent) textSync.innerText = "Syncing...";

        try {
            // Refresh dashboard data and active view concurrently for instant speed
            const syncTasks = [this.loadDashboardData()];
            if (this.currentActiveView === "history") {
                syncTasks.push(this.loadHistoryView(true));
            } else if (this.currentActiveView === "approvals") {
                syncTasks.push(this.loadManagerApprovalsQueue(true));
            } else if (this.currentActiveView === "leave") {
                syncTasks.push(this.loadLeaveView(true));
            }
            await Promise.all(syncTasks);

            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            if (textSync) textSync.innerText = `Synced ${timeStr}`;

            if (!isSilent && typeof Swal !== "undefined") {
                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000,
                    timerProgressBar: false
                });
                Toast.fire({
                    icon: 'success',
                    title: 'Data synchronized'
                });
            }
        } catch (err) {
            console.error("Employee auto-sync error:", err);
            if (textSync) textSync.innerText = "Sync Failed";
        } finally {
            this.isSyncing = false;
            if (iconSync) {
                setTimeout(() => {
                    iconSync.classList.remove("fa-spin");
                }, 400);
            }
        }
    },

    // Updates SVG circular progress bar
    updateCircularProgress(percent) {
        const circle = document.getElementById("circle-progress-fill");
        if (circle) {
            const radius = circle.r.baseVal.value;
            const circumference = radius * 2 * Math.PI;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            const offset = circumference - (percent / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }
        const textElement = document.getElementById("circle-progress-text");
        if (textElement) {
            textElement.innerText = `${percent}%`;
        }
    },

    // Render recent logs in list
    renderRecentActivities(punches) {
        const container = document.getElementById("recent-activities-list");
        if (!container) return;

        if (!punches || punches.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">No recent clock logs found.</div>`;
            return;
        }

        container.innerHTML = punches.map(p => {
            const isOut = p.PunchOut && p.PunchOut !== "";
            const isLate = p.Status && p.Status.includes("Late");
            let statusClass = "verified";
            if (p.Status && p.Status.includes("Mismatch")) statusClass = "mismatch";
            else if (isLate) statusClass = "late";

            let punchStr = `Punch In: <strong>${p.PunchIn}</strong>`;
            let iconClass = "fa-fingerprint";
            let iconColor = "in";
            
            if (isOut) {
                punchStr += ` | Punch Out: <strong>${p.PunchOut}</strong>`;
            }

            return `
                <div class="history-feed-item">
                    <div class="feed-left">
                        <div class="feed-icon ${iconColor}">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <div class="feed-meta">
                            <h6>${p.Date}</h6>
                            <small>${punchStr}</small>
                        </div>
                    </div>
                    <div class="feed-right">
                        <span class="feed-status-badge ${statusClass}">${p.Status || 'Present'}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Update punch screen status banner & button availability
    updatePunchScreenState() {
        const alertBox = document.getElementById("punch-today-alert");
        const btnIn = document.getElementById("btn-submit-punch-in");
        const btnOut = document.getElementById("btn-submit-punch-out");
        if (!alertBox) return;

        if (this.todayPunchObj) {
            const hasIn = this.todayPunchObj.PunchIn && this.todayPunchObj.PunchIn.toString().trim() !== "";
            const hasOut = this.todayPunchObj.PunchOut && this.todayPunchObj.PunchOut.toString().trim() !== "";

            if (hasIn && !hasOut) {
                alertBox.style.display = "block";
                alertBox.innerHTML = `
                    <div class="alert alert-warning py-2 mb-2 text-center fw-bold small">
                        <i class="fa-solid fa-clock"></i> Already clocked IN today at ${this.todayPunchObj.PunchIn}.<br>Please click <strong>Punch OUT</strong> when your shift ends.
                    </div>
                `;
                if (btnIn) {
                    btnIn.classList.add("disabled");
                    btnIn.style.opacity = "0.4";
                }
                if (btnOut) {
                    btnOut.classList.remove("disabled");
                    btnOut.style.opacity = "1";
                }
            } else if (hasIn && hasOut) {
                alertBox.style.display = "block";
                alertBox.innerHTML = `
                    <div class="alert alert-success py-2 mb-2 text-center fw-bold small">
                        <i class="fa-solid fa-circle-check"></i> Shift Completed Today (In: ${this.todayPunchObj.PunchIn} | Out: ${this.todayPunchObj.PunchOut}).
                    </div>
                `;
                if (btnIn) {
                    btnIn.classList.add("disabled");
                    btnIn.style.opacity = "0.4";
                }
                if (btnOut) {
                    btnOut.classList.add("disabled");
                    btnOut.style.opacity = "0.4";
                }
            }
        } else {
            alertBox.style.display = "block";
            alertBox.innerHTML = `
                <div class="alert alert-info py-2 mb-2 text-center fw-bold small">
                    <i class="fa-solid fa-fingerprint"></i> Ready for Clock In. Snap front selfie and click Punch IN.
                </div>
            `;
            if (btnIn) {
                btnIn.classList.remove("disabled");
                btnIn.style.opacity = "1";
            }
            if (btnOut) {
                btnOut.classList.add("disabled");
                btnOut.style.opacity = "0.4";
            }
        }
    },

    // Start WebRTC Camera stream & GPS location monitoring
    async startCameraAndGPS() {
        this.capturedImage = null;
        document.getElementById("selfie-preview").style.display = "none";
        document.getElementById("camera-stream").style.display = "block";
        document.getElementById("btn-retake-selfie").style.display = "none";
        document.getElementById("btn-capture-selfie").style.display = "block";
        this.updatePunchScreenState();
        this.setupSelfiePoseForVisit();
        
        // Start Camera stream
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("navigator.mediaDevices.getUserMedia is not supported on this connection context (requires HTTPS or localhost).");
            }
            this.activeStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: false
            });
            const video = document.getElementById("camera-stream");
            if (video) video.srcObject = this.activeStream;
        } catch (err) {
            console.error("Camera access failed:", err);
            Swal.fire("Camera Error", "Please allow front camera access to perform Selfie Attendance verification. Note: Camera requires a secure connection (HTTPS or localhost).", "error");
        }

        // Start GPS tracking
        this.gpsLocked = false;
        
        // 1. Instant Cache Lock: Use fresh cached position if available (< 90 seconds)
        if (this.cachedPosition && (Date.now() - (this.cachedPositionTime || 0) < 90000)) {
            this.handleGPSLock(this.cachedPosition);
        } else {
            document.getElementById("gps-status-badge").className = "geo-status-indicator pending";
            document.getElementById("gps-status-badge").innerText = "Acquiring Coordinates...";
            document.getElementById("gps-latitude").innerText = "--";
            document.getElementById("gps-longitude").innerText = "--";
            document.getElementById("gps-distance").innerText = "--";
        }
        
        if (navigator.geolocation) {
            // Fast attempt: High Accuracy with quick 5s timeout & 45s cache
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this.handleGPSLock(pos);
                },
                (err) => {
                    if (err.code === 1) {
                        Swal.fire("Permission Denied", "Please allow location access to punch attendance.", "error");
                        return;
                    }
                    console.warn("High-accuracy GPS delayed, falling back immediately to network/fused location...", err);
                    // Fast fallback: Standard Fused/Network Accuracy (Immediate response indoors)
                    navigator.geolocation.getCurrentPosition(
                        (fallbackPos) => {
                            this.handleGPSLock(fallbackPos);
                        },
                        (fallbackErr) => {
                            if (!this.gpsLocked) {
                                document.getElementById("gps-status-badge").className = "geo-status-indicator outside";
                                document.getElementById("gps-status-badge").innerText = "GPS Error";
                                Swal.fire("GPS Error", "Failed to retrieve location. Please check location permissions and ensure GPS is turned on.", "error");
                            }
                        },
                        { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 }
                    );
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 45000 }
            );
        } else {
            Swal.fire("GPS Unsupported", "Your browser does not support location services.", "error");
        }
    },

    // Stop camera stream
    stopCamera() {
        if (this.activeStream) {
            this.activeStream.getTracks().forEach(track => track.stop());
            this.activeStream = null;
        }
    },

    // GPS location handler
    handleGPSLock(position) {
        this.gpsLocked = true;
        this.cachedPosition = position;
        this.cachedPositionTime = Date.now();
        this.currentCoords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
        };

        document.getElementById("gps-latitude").innerText = this.currentCoords.lat.toFixed(6);
        document.getElementById("gps-longitude").innerText = this.currentCoords.lng.toFixed(6);
        
        // Render GPS Accuracy bar
        const accuracyFill = document.getElementById("gps-accuracy-fill");
        const accuracyText = document.getElementById("gps-accuracy-text");
        if (accuracyFill && accuracyText) {
            accuracyText.innerText = `Accuracy: ${this.currentCoords.accuracy.toFixed(1)}m`;
            
            // Set styles based on accuracy
            if (this.currentCoords.accuracy <= 25) {
                accuracyFill.className = "accuracy-bar-fill good";
                accuracyFill.style.width = "100%";
            } else if (this.currentCoords.accuracy <= 80) {
                accuracyFill.className = "accuracy-bar-fill medium";
                accuracyFill.style.width = "60%";
            } else {
                accuracyFill.className = "accuracy-bar-fill poor";
                accuracyFill.style.width = "25%";
            }
        }

        // Calculate distance from assigned branch
        if (this.assignedBranch) {
            const bLat = parseFloat(this.assignedBranch.Latitude);
            const bLng = parseFloat(this.assignedBranch.Longitude);
            const radius = parseFloat(this.assignedBranch.Radius) || 100;
            
            const distance = Utils.calculateDistance(
                this.currentCoords.lat, 
                this.currentCoords.lng,
                bLat,
                bLng
            );
            
            document.getElementById("gps-distance").innerText = `${distance.toFixed(1)} meters`;
            
            const badge = document.getElementById("gps-status-badge");
            if (distance <= radius) {
                badge.className = "geo-status-indicator inside";
                badge.innerText = "Inside Branch Geofence";
                this.isOutsideGeofence = false;
            } else {
                badge.className = "geo-status-indicator outside";
                badge.innerText = "Outside Geofence";
                this.isOutsideGeofence = true;
            }
        }
    },

    // Capture Image from video stream
    captureSelfie() {
        const video = document.getElementById("camera-stream");
        if (!this.activeStream || !video.srcObject) {
            Swal.fire("Camera Not Ready", "Please wait for the front camera stream to initialize.", "warning");
            return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        const ctx = canvas.getContext("2d");
        
        // Mirror the drawing to match the natural flipped display
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Reset transform to draw normal text watermark
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Draw Watermark Overlay
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // Semi-transparent black bar
        ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
        
        ctx.font = "14px Arial";
        ctx.fillStyle = "#ffffff"; // White text
        
        const now = new Date();
        const timeStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        const gpsStr = this.currentCoords ? `Lat: ${this.currentCoords.lat.toFixed(6)}, Lng: ${this.currentCoords.lng.toFixed(6)}` : "GPS: Pending";
        
        ctx.fillText(`Time: ${timeStr} | ${gpsStr}`, 10, canvas.height - 15);
        
        const rawBase64 = canvas.toDataURL("image/jpeg");
        
        // Compress photo to save Google Drive storage and optimize speed
        Utils.compressSelfie(rawBase64, 320, 0.7).then(compressed => {
            this.capturedImage = compressed;
            
            // Show preview
            const preview = document.getElementById("selfie-preview");
            preview.src = compressed;
            preview.style.display = "block";
            
            video.style.display = "none";
            document.getElementById("btn-capture-selfie").style.display = "none";
            document.getElementById("btn-retake-selfie").style.display = "block";

            // Camera Shutter Flash Effect
            const flash = document.getElementById("camera-flash-overlay");
            if (flash) {
                flash.classList.add("flashing");
                setTimeout(() => flash.classList.remove("flashing"), 80);
            }

            // Angela Standing in Corner Celebrates Snap!
            const mascotAngela = document.getElementById("camera-side-angela");
            const speechAngela = document.getElementById("camera-angela-speech");

            if (mascotAngela) {
                mascotAngela.classList.remove("snap-celebrate");
                void mascotAngela.offsetWidth; // Reflow
                mascotAngela.classList.add("snap-celebrate");
                this.spawnReactionParticle(mascotAngela, '💖');
            }
            if (speechAngela) speechAngela.innerHTML = "Awesome pose! 🎀📸 Gorgeous!";
        }).catch(err => {
            console.error("Selfie compression failed:", err);
            Swal.fire("Compression Error", "Failed to process photo preview.", "error");
        });
    },

    // Reset camera preview
    retakeSelfie() {
        this.capturedImage = null;
        document.getElementById("selfie-preview").style.display = "none";
        document.getElementById("camera-stream").style.display = "block";
        document.getElementById("btn-retake-selfie").style.display = "none";
        document.getElementById("btn-capture-selfie").style.display = "block";

        const speechAngela = document.getElementById("camera-angela-speech");
        if (speechAngela) {
            speechAngela.innerHTML = (this.currentSelfiePose === 'makeup')
                ? "Touching up my makeup! 💄✨"
                : "Strike a pose with me! 🎀✌️";
        }
    },

    // Setup Angela's pose for this visit: Alternates cleanly between Makeup & Standing Pose
    // Visit 1: Makeup (default first!) -> Visit 2: Standing -> Visit 3: Makeup -> ...
    setupSelfiePoseForVisit() {
        const lastPose = localStorage.getItem('EAMS_last_selfie_pose') || 'standing';
        // Alternates to the other pose for the new visit (defaults to makeup first!)
        const currentPose = (lastPose === 'makeup') ? 'standing' : 'makeup';
        localStorage.setItem('EAMS_last_selfie_pose', currentPose);
        this.applySelfiePose(currentPose);
    },

    // Apply the active pose: toggles visibility between preloaded makeup and standing images
    applySelfiePose(pose) {
        this.currentSelfiePose = pose;
        const imgMakeup = document.getElementById("camera-angela-makeup");
        const imgStanding = document.getElementById("camera-angela-standing");
        const speech = document.getElementById("camera-angela-speech");
        const indicator = document.getElementById("camera-pose-indicator");

        if (pose === 'makeup') {
            if (imgMakeup) imgMakeup.style.display = 'block';
            if (imgStanding) imgStanding.style.display = 'none';
            if (speech) speech.innerHTML = 'Touching up my makeup! 💄✨';
            if (indicator) indicator.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Makeup Pose (Tap)';
        } else {
            if (imgMakeup) imgMakeup.style.display = 'none';
            if (imgStanding) imgStanding.style.display = 'block';
            if (speech) speech.innerHTML = 'Strike a pose with me! 🎀✌️';
            if (indicator) indicator.innerHTML = '<i class="fa-solid fa-camera"></i> Standing Pose (Tap)';
        }
    },

    // User taps Angela or badge to switch pose anytime!
    toggleSelfieMascotPose() {
        const nextPose = (this.currentSelfiePose === 'makeup') ? 'standing' : 'makeup';
        localStorage.setItem('EAMS_last_selfie_pose', nextPose);
        this.applySelfiePose(nextPose);

        const el = document.getElementById("camera-side-angela");
        if (el) {
            el.classList.remove("snap-celebrate");
            void el.offsetWidth;
            el.classList.add("snap-celebrate");
            this.spawnReactionParticle(el, '💖');
        }
    },

    interactWithCameraMascot(char) {
        this.toggleSelfieMascotPose();
    },

    // Punch IN / OUT Submission handler
    async submitPunch(punchType) {
        if (!this.capturedImage) {
            Swal.fire("Selfie Required", "Please capture a front selfie before punching.", "warning");
            return;
        }
        if (!this.gpsLocked) {
            Swal.fire("GPS Coordinate Locked", "Please wait for GPS satellite telemetry verification.", "warning");
            return;
        }

        const remarks = document.getElementById("punch-remarks").value.trim();

        if (this.isOutsideGeofence && remarks === "") {
            Swal.fire({
                icon: "warning",
                title: "Reason Required",
                text: "You are currently clocking from outside the branch geofence boundary. Please enter a mandatory remark/reason for this mismatch.",
                confirmButtonColor: "#E4002B"
            });
            return;
        }

        // Client-side duplicate & prerequisite verification with immediate alert
        if (punchType === "In" && this.todayPunchObj && this.todayPunchObj.PunchIn) {
            Swal.fire({
                icon: "warning",
                title: "Already Clocked In",
                text: `Duplicate transaction skipped: already clocked In today at ${this.todayPunchObj.PunchIn}.`,
                confirmButtonColor: "#E4002B"
            });
            return;
        }

        if (punchType === "Out" && (!this.todayPunchObj || !this.todayPunchObj.PunchIn)) {
            Swal.fire({
                icon: "warning",
                title: "Clock In Required",
                text: "Cannot Clock Out without clocking In first.",
                confirmButtonColor: "#E4002B"
            });
            return;
        }

        if (punchType === "Out" && this.todayPunchObj && this.todayPunchObj.PunchOut) {
            Swal.fire({
                icon: "warning",
                title: "Already Clocked Out",
                text: `Duplicate transaction skipped: already clocked Out today at ${this.todayPunchObj.PunchOut}.`,
                confirmButtonColor: "#E4002B"
            });
            return;
        }

        try {
            const exitedCount = localStorage.getItem("EAMS_geofence_exited_count") || "0";
            let activeTimeStr = "";

            if (punchType === "Out") {
                let activeMins = 0;
                let elapsedMins = 0;
                
                // Fallback to strict time from backend first to avoid local cache issues
                if (this.todayPunchObj && this.todayPunchObj.PunchIn) {
                    const t = this.todayPunchObj.PunchIn.toString();
                    let inMins = 0;
                    
                    if (t.includes("T") && (t.endsWith("Z") || t.includes("+"))) {
                        const d = new Date(t);
                        if (!isNaN(d.getTime())) {
                            inMins = d.getHours() * 60 + d.getMinutes();
                        }
                    }
                    
                    if (inMins === 0) {
                        const m = t.match(/(\d{1,2}):(\d{2})/);
                        if (m) {
                            let hrs = parseInt(m[1], 10);
                            const mns = parseInt(m[2], 10);
                            if (t.toLowerCase().includes("pm") && hrs < 12) hrs += 12;
                            if (t.toLowerCase().includes("am") && hrs === 12) hrs = 0;
                            inMins = hrs * 60 + mns;
                        }
                    }
                    
                    if (inMins > 0) {
                        const now = new Date();
                        const currentMins = now.getHours() * 60 + now.getMinutes();
                        elapsedMins = currentMins - inMins;
                        if (elapsedMins < 0) elapsedMins += 24 * 60;
                    }
                } 
                
                if (elapsedMins <= 0) {
                    const punchInTime = parseInt(localStorage.getItem("EAMS_punch_in_time") || "0");
                    if (punchInTime > 0) {
                        const totalTimeMs = Date.now() - punchInTime;
                        elapsedMins = Math.floor(totalTimeMs / 60000);
                        
                        // Failsafe: if cache is extremely stale (over 18 hours), limit it
                        if (elapsedMins > 1080) elapsedMins = 0; 
                    }
                }

                // Calculate time outside geofence
                let timeOutsideMs = parseInt(localStorage.getItem("EAMS_time_outside_ms") || "0");
                const lastExitTime = parseInt(localStorage.getItem("EAMS_last_exit_time") || "0");
                if (lastExitTime > 0 && localStorage.getItem("EAMS_inside_geofence") === "false") {
                    timeOutsideMs += (Date.now() - lastExitTime);
                }
                const timeOutsideMins = Math.floor(timeOutsideMs / 60000);

                // Web App geofence tracking is unreliable in the background (when phone sleeps).
                // Subtracting timeOutsideMins heavily penalizes users who simply close their browser.
                // We will rely on elapsedMins (Punch Out - Punch In) for duty hours calculation.
                activeMins = elapsedMins;
                if (activeMins < 0) activeMins = 0;

                const activeHrs = Math.floor(activeMins / 60);
                const remainMins = activeMins % 60;
                activeTimeStr = `${activeHrs}h ${remainMins}m`;

                let reqMins = 540; // Default 9 hours
                if (this.assignedBranch && this.assignedBranch.OfficeStart && this.assignedBranch.OfficeEnd) {
                    const parseTime = (t) => {
                        let str = t.toString().trim();
                        // Handle ISO dates
                        if (str.includes("T") && (str.endsWith("Z") || str.includes("+"))) {
                            const d = new Date(str);
                            if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
                        }
                        // Handle standard AM/PM strings
                        const m = str.match(/(\d{1,2}):(\d{2})/);
                        if (m) {
                            let hrs = parseInt(m[1], 10);
                            const mins = parseInt(m[2], 10);
                            if (str.toLowerCase().includes("pm") && hrs < 12) hrs += 12;
                            if (str.toLowerCase().includes("am") && hrs === 12) hrs = 0;
                            return hrs * 60 + mins;
                        }
                        return 0;
                    };
                    const bStart = parseTime(this.assignedBranch.OfficeStart);
                    const bEnd = parseTime(this.assignedBranch.OfficeEnd);
                    let branchReq = bEnd - bStart;
                    if (branchReq > 0) reqMins = branchReq;
                }
                
                const fullDayThreshold = reqMins * 0.95;
                const halfDayThreshold = reqMins * 0.45;
                
                if (activeMins < fullDayThreshold) {
                    const formatTime = (mins) => {
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        return (h > 0 ? `${h} hour${h > 1 ? 's' : ''} and ` : '') + `${m} minute${m !== 1 ? 's' : ''}`;
                    };
                    
                    let warningHtml = '';
                    if (activeMins < halfDayThreshold) {
                        const remainHalf = Math.ceil(halfDayThreshold - activeMins);
                        const remainFull = Math.ceil(fullDayThreshold - activeMins);
                        warningHtml = `Please wait <strong>${formatTime(remainHalf)}</strong> for a Half Day, or <strong>${formatTime(remainFull)}</strong> for a Full Day.<br><br>Punching out now will mark your day as <span style="background-color: #DC3545; color: white; font-weight: bold; padding: 2px 6px; border-radius: 4px;">Absent</span>.<br><br>Are you sure you want to punch out early?`;
                    } else {
                        const remainFull = Math.ceil(fullDayThreshold - activeMins);
                        warningHtml = `Please wait <strong>${formatTime(remainFull)}</strong> to complete your full duty hours.<br><br>Punching out now will mark your day as a <span style="background-color: #FFC107; color: black; font-weight: bold; padding: 2px 6px; border-radius: 4px;">Half Day</span>.<br><br>Are you sure you want to punch out early?`;
                    }
                    
                    const confirm = await Swal.fire({
                        title: 'Shift Incomplete!',
                        html: warningHtml,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#E4002B',
                        cancelButtonColor: '#6c757d',
                        confirmButtonText: 'Yes, Punch Out',
                        cancelButtonText: 'Wait'
                    });
                    if (!confirm.isConfirmed) {
                        return;
                    }
                }
            }

            const res = await API.call({
                action: "executePunchTransaction",
                employeeId: Auth.getUserId(),
                punchType: punchType,
                lat: this.currentCoords.lat,
                lng: this.currentCoords.lng,
                accuracy: this.currentCoords.accuracy,
                imageBlob: this.capturedImage, // Compressed Base64 upload
                remarks: remarks,
                exitedCount: exitedCount,
                activeTimeStr: activeTimeStr
            });

            if (res.status === "Success") {
                this.stopCamera();
                if (punchType === "Out") {
                    localStorage.removeItem("EAMS_geofence_exited_count");
                    localStorage.removeItem("EAMS_inside_geofence");
                    this.stopGeofenceTracking();
                } else if (punchType === "In") {
                    localStorage.setItem("EAMS_geofence_exited_count", "0");
                    localStorage.setItem("EAMS_inside_geofence", "true");
                    localStorage.setItem("EAMS_punch_in_time", Date.now().toString());
                    localStorage.setItem("EAMS_time_outside_ms", "0");
                    localStorage.setItem("EAMS_last_exit_time", "0");
                    this.startGeofenceTracking();
                }
                Swal.fire({
                    icon: "success",
                    title: "Attendance Logged",
                    text: res.message,
                    confirmButtonColor: "#E4002B"
                }).then(() => {
                    document.getElementById("punch-remarks").value = "";
                    this.switchView("dashboard");
                    this.loadDashboardData();
                });
            } else {
                Swal.fire({
                    icon: "warning",
                    title: "Transaction Alert",
                    text: res.message || "Attendance transaction could not be processed.",
                    confirmButtonColor: "#E4002B"
                });
            }
        } catch (err) {
            console.error("Punch transaction failed", err);
        }
    },

    // Load personal history view
    async loadHistoryView(force = false) {
        if (!force && this.personalHistoryLogs && this.personalHistoryLogs.length > 0) {
            this.renderHistoryTable(this.personalHistoryLogs);
            this.renderHistoryCalendar(this.personalHistoryLogs, this.personalApprovedLeaves);
            return;
        }
        
        const container = document.getElementById("history-table-body");
        if (!container) return;
        
        container.innerHTML = `<tr><td colspan="5" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;

        try {
            const res = await API.call({
                action: "fetchHistory",
                employeeId: Auth.getUserId()
            }, false);

            if (res.status === "Success" && res.data && res.data.length > 0) {
                // Merge rows with duplicate dates
                const mergedMap = {};
                res.data.forEach(h => {
                    const dateKey = this.cleanDateFormat(h.Date);
                    if (!mergedMap[dateKey]) {
                        mergedMap[dateKey] = { ...h };
                    } else {
                        const existing = mergedMap[dateKey];
                        if (!existing.PunchIn || existing.PunchIn === "--" || existing.PunchIn === "") {
                            existing.PunchIn = h.PunchIn;
                        }
                        if (!existing.PunchOut || existing.PunchOut === "--" || existing.PunchOut === "") {
                            existing.PunchOut = h.PunchOut;
                        }
                        if (!existing.LatitudeIn && h.LatitudeIn) {
                            existing.LatitudeIn = h.LatitudeIn;
                            existing.LongitudeIn = h.LongitudeIn;
                        }
                        if (!existing.LatitudeOut && h.LatitudeOut) {
                            existing.LatitudeOut = h.LatitudeOut;
                            existing.LongitudeOut = h.LongitudeOut;
                        }
                        if (h.Status && (h.Status.includes("Present") || h.Status.includes("Manual") || h.Status.includes("Half") || h.Status.includes("Late") || h.Status.includes("Leave") || h.Status.includes("Off"))) {
                            existing.Status = h.Status;
                        } else if (existing.Status === "Absent" || !existing.Status) {
                            existing.Status = h.Status;
                        }
                        if (!existing.WorkingHours || existing.WorkingHours === "" || existing.WorkingHours === "--") {
                            existing.WorkingHours = h.WorkingHours;
                        }
                        // Calculate working hours dynamically as fallback if both punches are present but not stored
                        if ((!existing.WorkingHours || existing.WorkingHours === "" || existing.WorkingHours === "--") && existing.PunchIn && existing.PunchIn !== "--" && existing.PunchOut && existing.PunchOut !== "--") {
                            const inMin = this.timeStringToMinutes(existing.PunchIn);
                            const outMin = this.timeStringToMinutes(existing.PunchOut);
                            let diff = outMin - inMin;
                            if (diff < 0) diff = 0;
                            const hrs = Math.floor(diff / 60);
                            const mins = diff % 60;
                            existing.WorkingHours = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
                        }
                    }
                });
                const mergedData = Object.values(mergedMap);

                this.personalHistoryLogs = mergedData;
                this.personalApprovedLeaves = (res.leaves && res.leaves.length > 0) 
                    ? res.leaves 
                    : (this.personalLeaves ? this.personalLeaves.filter(l => l.Status === 'Approved') : []);

                // Render both table ledger and calendar for the selected month/year
                this.renderHistoryTable(this.personalHistoryLogs);
                this.renderHistoryCalendar(this.personalHistoryLogs, this.personalApprovedLeaves);
            } else {
                container.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No attendance logs matched.</td></tr>`;
                document.getElementById("history-calendar-grid").innerHTML = `<div class="text-center text-muted w-100">Add clock inputs to stream calendar grids.</div>`;
            }
        } catch (err) {
            console.error("Failed to load attendance history view:", err);
            container.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">Failed to stream history.</td></tr>`;
        }
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

    // Custom calendar rendering
    renderHistoryCalendar(records, approvedLeaves = []) {
        if (!approvedLeaves || approvedLeaves.length === 0) {
            if (this.personalApprovedLeaves && this.personalApprovedLeaves.length > 0) {
                approvedLeaves = this.personalApprovedLeaves;
            } else if (this.personalLeaves && this.personalLeaves.length > 0) {
                approvedLeaves = this.personalLeaves.filter(l => l.Status === 'Approved');
            }
        }

        const calGrid = document.getElementById("history-calendar-grid");
        if (!calGrid) return;

        // Set Month/Year label
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const label = document.getElementById("calendar-month-year-label");
        if (label) {
            label.innerText = `${monthNames[this.currentCalendarMonth]} ${this.currentCalendarYear}`;
        }

        const dateMap = {};
        records.forEach(r => {
            const parsed = this.normalizeSheetDate(r.Date);
            if (parsed) {
                const dateKey = `${parsed.getFullYear()}-${parsed.getMonth() + 1}-${parsed.getDate()}`;
                dateMap[dateKey] = r;
            }
        });

        // Map approved leaves dates
        const leaveMap = {};
        approvedLeaves.forEach(l => {
            let curr = this.normalizeSheetDate(l.StartDate);
            const end = this.normalizeSheetDate(l.EndDate);
            if (!curr || !end) return;

            curr.setHours(0,0,0,0);
            end.setHours(0,0,0,0);

            while (curr <= end) {
                const dateKey = `${curr.getFullYear()}-${curr.getMonth() + 1}-${curr.getDate()}`;
                leaveMap[dateKey] = l.Type;
                curr.setDate(curr.getDate() + 1);
            }
        });

        const today = new Date();
        const year = this.currentCalendarYear;
        const month = this.currentCalendarMonth;

        const firstDayIndex = new Date(year, month, 1).getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();

        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        
        // Inject headers directly into the grid so they never misalign
        let calHtml = `
            <div class="calendar-header-day">Su</div>
            <div class="calendar-header-day">Mo</div>
            <div class="calendar-header-day">Tu</div>
            <div class="calendar-header-day">We</div>
            <div class="calendar-header-day">Th</div>
            <div class="calendar-header-day">Fr</div>
            <div class="calendar-header-day">Sa</div>
        `;
        
        // Blank placeholders for day offsets
        for (let i = 0; i < firstDayIndex; i++) {
            calHtml += `<div class="calendar-day empty"></div>`;
        }

        // Days loop
        for (let day = 1; day <= lastDay; day++) {
            const checkDate = new Date(year, month, day);
            const dayName = days[checkDate.getDay()];
            const dateStr = `${year}-${month + 1}-${day}`;
            const isToday = (day === today.getDate() && month === today.getMonth() && year === today.getFullYear());
            
            let statusClass = "";
            let statusLetter = "";
            let statusTooltip = "No Record";

            const log = dateMap[dateStr];
            const leaveType = leaveMap[dateStr];
            
            const hasPunchIn = !!(log && log.PunchIn && log.PunchIn.toString().trim() !== "" && log.PunchIn !== "--");
            const hasPunchOut = !!(log && log.PunchOut && log.PunchOut.toString().trim() !== "" && log.PunchOut !== "--");
            const status = log ? (log.Status || "") : "";

            // Calculate worked minutes if both punches exist
            let workedMin = -1;
            if (hasPunchIn && hasPunchOut) {
                const parseTimeToMin = (tStr) => {
                    if (!tStr) return -1;
                    const m = tStr.toString().match(/(\d{1,2}):(\d{2})/);
                    if (!m) return -1;
                    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
                };
                const inM = parseTimeToMin(log.PunchIn);
                const outM = parseTimeToMin(log.PunchOut);
                if (inM >= 0 && outM >= 0) workedMin = outM - inM;
            }

            // 1. Priority: Approved Weekly Off or Leave takes precedence unless actively worked Present
            if (leaveType && !(hasPunchIn && hasPunchOut && status.includes("Present"))) {
                if (leaveType === "Weekly Off" || leaveType === "WO") {
                    statusClass = "weekly-off";
                    statusLetter = "WO";
                    statusTooltip = "Weekly Off (Approved)";
                } else {
                    statusClass = "absent";
                    statusLetter = "LV";
                    statusTooltip = `${leaveType} Leave (Approved)`;
                }
            } else if (log) {
                if (!hasPunchIn && !hasPunchOut) {
                    if (isToday) {
                        statusClass = "absent";
                        statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                        statusTooltip = "Pending Punch In Today";
                    } else {
                        statusClass = "absent";
                        statusLetter = "A";
                        statusTooltip = `Absent (${status || 'No Punches'})`;
                    }
                } else if (!hasPunchIn && hasPunchOut) {
                    statusClass = "absent";
                    statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                    statusTooltip = "Missed Punch In";
                } else if (hasPunchIn && !hasPunchOut) {
                    if (isToday) {
                        if (status.includes("Late")) {
                            statusClass = "short";
                            statusLetter = `<span class="badge bg-warning text-dark rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.6rem; padding: 0; margin-top:2px; font-weight: bold;">IN</span>`;
                            statusTooltip = "Late Arrival (Working)";
                        } else {
                            statusClass = "present";
                            statusLetter = `<span class="badge bg-success rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.6rem; padding: 0; margin-top:2px; font-weight: bold;">IN</span>`;
                            statusTooltip = "Present (Working)";
                        }
                    } else {
                        statusClass = "absent";
                        statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">OUT</span>`;
                        statusTooltip = "Missed Punch Out";
                    }
                } else {
                    // Both Punch In and Punch Out exist
                    const punchedNearDeparture = (workedMin >= 0 && workedMin < 45) || 
                                                 (status.indexOf("Absent") === 0 && (workedMin < 120 || workedMin < 0)) || 
                                                 status.includes("Missing");
                    if (punchedNearDeparture) {
                        statusClass = "absent";
                        statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                        statusTooltip = "Missed Morning Punch In";
                    } else if (status.includes("Late")) {
                        statusClass = "short";
                        statusLetter = `<span class="text-warning fw-bold">L</span>`;
                        statusTooltip = `Late Arrival (${status})`;
                    } else if (status.includes("Short")) {
                        statusClass = "short";
                        statusLetter = `<span class="badge bg-warning text-dark rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.65rem; padding: 0; margin-top:2px; font-weight: bold;">P</span>`;
                        statusTooltip = `Short Day (${status})`;
                    } else if (status.includes("Half")) {
                        statusClass = "half";
                        statusLetter = `<span class="badge bg-info text-dark rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.65rem; padding: 0; margin-top:2px; font-weight: bold;">H</span>`;
                        statusTooltip = `Half Day (${status})`;
                    } else if (status.includes("Absent")) {
                        statusClass = "absent";
                        statusLetter = "A";
                        statusTooltip = `Absent (${status})`;
                    } else if (status.includes("Weekly Off")) {
                        statusClass = "weekly-off";
                        statusLetter = "WO";
                        statusTooltip = "Weekly Off";
                    } else if (status.includes("Leave")) {
                        statusClass = "absent";
                        statusLetter = "LV";
                        statusTooltip = "Leave";
                    } else {
                        statusClass = "present";
                        statusLetter = "P";
                        statusTooltip = `Present (${status})`;
                    }
                }
            } else {
                // No log and no leave
                const checkDateOnly = new Date(year, month, day);
                const todayOnly = new Date();
                todayOnly.setHours(0,0,0,0);
                
                if (checkDateOnly > todayOnly) {
                    statusClass = "empty";
                    statusLetter = "";
                    statusTooltip = "Future Date";
                } else if (isToday) {
                    statusClass = "absent";
                    statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                    statusTooltip = "Pending Punch In Today";
                } else {
                    statusClass = "absent";
                    statusLetter = "A";
                    statusTooltip = "Absent";
                }
            }

            calHtml += `
                <div class="calendar-day ${statusClass}" title="${day} - ${statusTooltip}" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <span class="day-number" style="font-size: 0.72rem; opacity: 0.6; margin-bottom: 2px;">${day}</span>
                    <span class="day-status-letter fw-bold">${statusLetter}</span>
                </div>
            `;
        }

        calGrid.innerHTML = calHtml;
    },

    renderHistoryTable(records) {
        const container = document.getElementById("history-table-body");
        if (!container) return;
        
        // Filter records by current calendar month and year
        const filtered = records.filter(r => {
            const d = this.normalizeSheetDate(r.Date);
            return d && d.getMonth() === this.currentCalendarMonth && d.getFullYear() === this.currentCalendarYear;
        });

        if (filtered.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No punches logged for this month.</td></tr>`;
            return;
        }

        // Merge duplicate split records for the same day (e.g. manual corrections)
        const mergedMap = {};
        filtered.forEach(log => {
            const dKey = this.normalizeSheetDate(log.Date).getTime().toString();
            if (!mergedMap[dKey]) {
                mergedMap[dKey] = { ...log };
            } else {
                const existing = mergedMap[dKey];
                if (!existing.PunchIn || existing.PunchIn === "--" || existing.PunchIn === "") existing.PunchIn = log.PunchIn;
                if (!existing.PunchOut || existing.PunchOut === "--" || existing.PunchOut === "") existing.PunchOut = log.PunchOut;
                if (!existing.WorkingHours || existing.WorkingHours === "--" || existing.WorkingHours === "") existing.WorkingHours = log.WorkingHours;
                if (!existing.LatitudeIn && log.LatitudeIn) { existing.LatitudeIn = log.LatitudeIn; existing.LongitudeIn = log.LongitudeIn; }
                if (!existing.LatitudeOut && log.LatitudeOut) { existing.LatitudeOut = log.LatitudeOut; existing.LongitudeOut = log.LongitudeOut; }
            }
        });
        
        const mergedList = Object.values(mergedMap);
        
        // Sort newest first
        mergedList.sort((a, b) => new Date(b.Date) - new Date(a.Date));

        container.innerHTML = mergedList.map(h => {
            let mapLink = "--";
            if (h.LatitudeIn && h.LongitudeIn) {
                mapLink = `<a href="https://www.google.com/maps?q=${h.LatitudeIn},${h.LongitudeIn}" target="_blank" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-map-location-dot"></i> In</a>`;
            }
            if (h.LatitudeOut && h.LongitudeOut) {
                mapLink += ` <a href="https://www.google.com/maps?q=${h.LatitudeOut},${h.LongitudeOut}" target="_blank" class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-map-location-dot"></i> Out</a>`;
            }

            return `
                <tr>
                    <td><strong>${this.cleanDateFormat(h.Date)}</strong></td>
                    <td><span class="text-success"><i class="fa-solid fa-right-to-bracket"></i> ${this.cleanTimeFormat(h.PunchIn)}</span></td>
                    <td><span class="text-danger"><i class="fa-solid fa-right-from-bracket"></i> ${this.cleanTimeFormat(h.PunchOut)}</span></td>
                    <td><span class="badge bg-secondary">${h.WorkingHours || '--'}</span></td>
                    <td>${mapLink}</td>
                </tr>
            `;
        }).join('');
    },

    changeCalendarMonth(offset) {
        this.currentCalendarMonth += offset;
        if (this.currentCalendarMonth < 0) {
            this.currentCalendarMonth = 11;
            this.currentCalendarYear -= 1;
        } else if (this.currentCalendarMonth > 11) {
            this.currentCalendarMonth = 0;
            this.currentCalendarYear += 1;
        }
        
        // Re-render calendar and table
        this.renderHistoryCalendar(this.personalHistoryLogs, this.personalApprovedLeaves);
        this.renderHistoryTable(this.personalHistoryLogs);
    },

    // Load Leave Application history
    async loadLeaveView(force = false) {
        // Instant memory-first rendering for zero lag
        if (this.personalLeaves && this.personalLeaves.length > 0) {
            this.renderLeaveHistoryCache();
            if (!force) return;
        }
        
        const container = document.getElementById("leave-history-list");
        if (!container) return;

        if (!this.personalLeaves || this.personalLeaves.length === 0) {
            container.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-danger"></div></div>`;
        }

        try {
            const res = await API.call({
                action: "fetchLeaves",
                employeeId: Auth.getUserId()
            }, false);

            if (res.status === "Success" && res.data) {
                // Save leaves to local state for validator checks
                this.personalLeaves = res.data;
                this.personalLeaveBalances = res.balances;
                this.renderLeaveHistoryCache();
            }
        } catch (err) {
            console.error("Failed to load leaves logs", err);
            if (!this.personalLeaves || this.personalLeaves.length === 0) {
                container.innerHTML = `<div class="text-center text-danger">Failed to stream leaves logs.</div>`;
            }
        }
    },

    renderLeaveHistoryCache() {
        const today = new Date();
        const curMonth = today.getMonth();
        const curYear = today.getFullYear();

        // 1. Calculate WO taken in current month and check if 4th WO is auto-skipped
        let woVal = 0;
        let hasThreeDayBlock = false;
        const uniqueWODates = {};

        (this.personalLeaves || []).forEach(l => {
            if (l.Status === "Approved" && (l.Type === "Weekly Off" || l.Type === "WO")) {
                let cur = new Date(l.StartDate);
                const end = new Date(l.EndDate);
                if (!isNaN(cur.getTime()) && !isNaN(end.getTime())) {
                    cur.setHours(0, 0, 0, 0);
                    end.setHours(0, 0, 0, 0);
                    const dur = Math.round((end - cur) / (1000 * 60 * 60 * 24)) + 1;
                    if (dur >= 3 && (cur.getMonth() === curMonth && cur.getFullYear() === curYear)) {
                        hasThreeDayBlock = true;
                    }
                    while (cur <= end) {
                        if (cur.getMonth() === curMonth && cur.getFullYear() === curYear) {
                            uniqueWODates[`${cur.getFullYear()}-${cur.getMonth() + 1}-${cur.getDate()}`] = true;
                        }
                        cur.setDate(cur.getDate() + 1);
                    }
                }
            }
        });
        woVal = Object.keys(uniqueWODates).length;

        const woBalEl = document.getElementById("leave-balance-wo");
        if (woBalEl) woBalEl.innerText = woVal;

        // Auto-skip 4th WO if a 3-day block exists or 3 WOs taken under 15-day duty policy
        const isQuotaThree = hasThreeDayBlock || woVal >= 3;
        const quotaEl = document.getElementById("leave-balance-quota");
        if (quotaEl) quotaEl.innerText = isQuotaThree ? "3" : "4";

        const noteEl = document.getElementById("leave-balance-note");
        if (noteEl) {
            if (isQuotaThree) {
                noteEl.style.display = "block";
                noteEl.innerText = "(4th Weekly Off auto-skipped for this month)";
            } else {
                noteEl.style.display = "none";
            }
        }

        // 2. Strict Filter: ONLY CURRENT MONTH data visible to employee (wo pending approve history)
        const container = document.getElementById("leave-history-list");
        if (!container) return;

        const currentMonthLeaves = (this.personalLeaves || []).filter(l => {
            const s = new Date(l.StartDate);
            const e = new Date(l.EndDate);
            const inCurMonth = (!isNaN(s.getTime()) && s.getMonth() === curMonth && s.getFullYear() === curYear) ||
                              (!isNaN(e.getTime()) && e.getMonth() === curMonth && e.getFullYear() === curYear);
            if (!inCurMonth) return false;
            // Only show approved applications (or active pending application in current month)
            return l.Status === "Approved" || l.Status === "Pending";
        });

        // Show newest first
        currentMonthLeaves.sort((a, b) => new Date(b.StartDate) - new Date(a.StartDate));

        if (currentMonthLeaves.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">No approved Weekly Off records for ${today.toLocaleString('default', { month: 'long', year: 'numeric' })}.</div>`;
            return;
        }

        container.innerHTML = currentMonthLeaves.map(l => {
            let statusBadge = `<span class="badge bg-warning text-dark">Pending</span>`;
            if (l.Status === "Approved") statusBadge = `<span class="badge bg-success">Approved</span>`;
            else if (l.Status === "Rejected") statusBadge = `<span class="badge bg-danger">Rejected</span>`;

            return `
                <div class="card p-3 mb-2 themed-badge-box border-0 rounded">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-bold text-brand">${l.Type}</span>
                        ${statusBadge}
                    </div>
                    <div class="small text-muted">
                        <div>Duration: <strong>${this.cleanDateFormat(l.StartDate)}</strong> to <strong>${this.cleanDateFormat(l.EndDate)}</strong> (${l.Duration} days)</div>
                        <div>Reason: ${l.Reason}</div>
                        ${l.Attachment ? `<div class="mt-1"><a href="${l.Attachment}" target="_blank" class="btn btn-sm btn-outline-secondary py-0"><i class="fa-solid fa-paperclip"></i> View Proof Document</a></div>` : ""}
                        ${l.Comments ? `<div class="mt-1 opacity-75"><em>Remarks: ${l.Comments}</em></div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    // Calculates contiguous off-day block including proposed date ranges
    checkConsecutiveOffDays(startDateStr, endDateStr, existingLeaves) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

        // Generate proposed date strings
        const proposedDates = [];
        let curr = new Date(start);
        while (curr <= end) {
            proposedDates.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        // Collect existing approved or pending leave dates
        const existingDates = [];
        (existingLeaves || []).forEach(l => {
            if (l.Status !== "Rejected") {
                let lCurr = this.normalizeSheetDate(l.StartDate);
                const lEnd = this.normalizeSheetDate(l.EndDate);
                if (!lCurr || !lEnd) return;
                
                lCurr.setHours(0,0,0,0);
                lEnd.setHours(0,0,0,0);
                
                while (lCurr <= lEnd) {
                    existingDates.push(new Date(lCurr));
                    lCurr.setDate(lCurr.getDate() + 1);
                }
            }
        });

        // Deduplicate and group dates
        const allDatesMap = {};
        proposedDates.forEach(d => {
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
            allDatesMap[key] = true;
        });
        existingDates.forEach(d => {
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
            allDatesMap[key] = true;
        });

        const sortedDateStrings = Object.keys(allDatesMap).sort();
        if (sortedDateStrings.length === 0) return 0;

        // Calculate max contiguous off days sequence
        let maxConsecutive = 0;
        let currentConsecutive = 1;

        for (let i = 1; i < sortedDateStrings.length; i++) {
            const prev = new Date(sortedDateStrings[i - 1]);
            const curr = new Date(sortedDateStrings[i]);
            const diffTime = Math.abs(curr - prev);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                currentConsecutive++;
            } else {
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
                currentConsecutive = 1;
            }
        }
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        return maxConsecutive;
    },

    // Toggles visibility of warning banner and proof upload inputs conditionally
    toggleLeaveAttachmentCheck() {
        const type = document.getElementById("leave-type").value;
        const start = document.getElementById("leave-start-date").value;
        const end = document.getElementById("leave-end-date").value;

        const warningDiv = document.getElementById("consecutive-warning");
        const warningMsg = document.getElementById("warning-message");
        const attachmentContainer = document.getElementById("leave-attachment-container");
        const fileInput = document.getElementById("leave-proof");

        if (!warningDiv || !attachmentContainer || !fileInput) return;

        if (type !== "Weekly Off") {
            warningDiv.style.display = "none";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        if (!start || !end) {
            warningDiv.style.display = "none";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        const startDt = new Date(start);
        const endDt = new Date(end);
        if (endDt < startDt) {
            warningMsg.innerText = "Notice: End date cannot be earlier than start date.";
            warningDiv.style.display = "block";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        const diffTime = Math.abs(endDt - startDt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const targetMonth = startDt.getMonth();
        const targetYear = startDt.getFullYear();

        // Count employee's worked days (Present + Half Days) in the current month
        let workedDays = this.attendanceStats ? ((this.attendanceStats.present || 0) + (this.attendanceStats.half || 0)) : 0;
        if (workedDays === 0 && Array.isArray(this.personalHistoryLogs)) {
            this.personalHistoryLogs.forEach(h => {
                const d = this.normalizeSheetDate(h.Date);
                if (d && d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
                    const st = h.Status || "";
                    if (st.includes("Present") || st.includes("Completed") || st.includes("Manual") || st.includes("Late")) {
                        workedDays += 1;
                    } else if (st.includes("Half")) {
                        workedDays += 0.5;
                    }
                }
            });
        }
        const halfMonthDutyCompleted = workedDays >= 15;

        // Check if a 3-day WO already exists this month
        const hasThreeDayWOInMonth = (this.personalLeaves || []).some(l => {
            if (l.Status !== "Rejected" && (l.Type === "Weekly Off" || l.Type === "WO")) {
                const s = new Date(l.StartDate);
                const e = new Date(l.EndDate);
                if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s.getMonth() === targetMonth && s.getFullYear() === targetYear) {
                    return (Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1) >= 3;
                }
            }
            return false;
        });

        if (diffDays >= 4) {
            warningMsg.innerText = "Notice: You cannot request 4 Weekly Offs in a single application. Maximum allowed is up to 3 days (after 15 days duty).";
            warningDiv.style.display = "block";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        if (diffDays === 3) {
            if (!halfMonthDutyCompleted) {
                warningMsg.innerText = `Notice: 15 days duty required to apply for a 3-day Weekly Off (Current duty: ${Math.floor(workedDays)}/15 days).`;
                warningDiv.style.display = "block";
                attachmentContainer.style.display = "none";
                fileInput.required = false;
                return;
            } else {
                warningMsg.innerText = "Notice: 15 days duty completed. 3-day Weekly Off permitted. Note: The 4th Weekly Off will be auto-skipped for this month.";
                warningDiv.style.display = "block";
                attachmentContainer.style.display = "none";
                fileInput.required = false;
                return;
            }
        }

        if (hasThreeDayWOInMonth) {
            warningMsg.innerText = "Notice: Under the 15-day duty policy, a 3-day Weekly Off was already used. The 4th Weekly Off is auto-skipped for this month.";
            warningDiv.style.display = "block";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        const maxConsecutive = this.checkConsecutiveOffDays(start, end, this.personalLeaves || []);

        // Rule 1: 4 continuous days of WO is strictly prohibited
        if (diffDays >= 4 || maxConsecutive >= 4) {
            warningMsg.innerText = "Notice: 4 continuous Weekly Off days are prohibited. (2 days WO, then present, then 2 days WO is allowed, but not 4 continuous days).";
            warningDiv.style.display = "block";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        // Rule 2: If duty < 15 days, maximum 2 continuous days at a time
        if (!halfMonthDutyCompleted && diffDays > 2) {
            warningMsg.innerText = `Notice: Duty is under 15 days (current: ${Math.floor(workedDays)}/15 days). You can only apply for maximum 2 continuous Weekly Off days at a time.`;
            warningDiv.style.display = "block";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        // Rule 3: 3 continuous days converts absent to WO (requires 15 days duty), but auto-skips 4th WO
        if (diffDays === 3 || maxConsecutive === 3) {
            if (!halfMonthDutyCompleted) {
                warningMsg.innerText = `Notice: 15 days duty required to apply for 3 continuous Weekly Off days (Current duty: ${Math.floor(workedDays)}/15 days).`;
                warningDiv.style.display = "block";
                attachmentContainer.style.display = "none";
                fileInput.required = false;
                return;
            } else {
                warningMsg.innerText = "Notice: 15 days duty completed. 3 continuous Weekly Off days eligible. Note: The 4th Weekly Off will be auto-skipped for this month.";
                warningDiv.style.display = "block";
                attachmentContainer.style.display = "none";
                fileInput.required = false;
                return;
            }
        }

        // Rule 4: If a 3-day continuous block already exists, 4th is auto-skipped
        if (hasThreeDayWOInMonth) {
            warningMsg.innerText = "Notice: Under dealership policy, taking a 3-day continuous Weekly Off auto-skips the 4th Weekly Off for this month.";
            warningDiv.style.display = "block";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
            return;
        }

        warningDiv.style.display = "none";
        attachmentContainer.style.display = "none";
        fileInput.required = false;
    },

    // Rebuild Leave / WO request submit flow
    async submitLeaveApplication(event) {
        if (event) event.preventDefault();

        if (this.submittingLeave) return;
        this.submittingLeave = true;

        const submitBtn = document.querySelector("#form-apply-leave button[type='submit']");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Processing...`;
        }

        const type = document.getElementById("leave-type").value;
        const start = document.getElementById("leave-start-date").value;
        const end = document.getElementById("leave-end-date").value;
        const reason = document.getElementById("leave-reason").value;
        const fileInput = document.getElementById("leave-proof");

        if (!start || !end || !reason) {
            Swal.fire("Details Missing", "Please complete all Weekly Off parameters.", "warning");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        const startDt = new Date(start);
        const endDt = new Date(end);
        if (endDt < startDt) {
            Swal.fire("Invalid Date Range", "End date cannot be earlier than start date.", "warning");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        const diffTime = Math.abs(endDt - startDt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        const targetMonth = startDt.getMonth();
        const targetYear = startDt.getFullYear();

        // Count duty days worked in the month
        let workedDays = this.attendanceStats ? ((this.attendanceStats.present || 0) + (this.attendanceStats.half || 0)) : 0;
        if (workedDays === 0 && Array.isArray(this.personalHistoryLogs)) {
            this.personalHistoryLogs.forEach(h => {
                const d = this.normalizeSheetDate(h.Date);
                if (d && d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
                    const st = h.Status || "";
                    if (st.includes("Present") || st.includes("Completed") || st.includes("Manual") || st.includes("Late")) {
                        workedDays += 1;
                    } else if (st.includes("Half")) {
                        workedDays += 0.5;
                    }
                }
            });
        }
        const halfMonthDutyCompleted = workedDays >= 15;

        // Collect existing WOs for target month
        const uniqueWODates = {};
        let hasThreeDayWOInMonth = false;
        (this.personalLeaves || []).forEach(l => {
            if (l.Status !== "Rejected" && (l.Type === "Weekly Off" || l.Type === "WO")) {
                let cur = new Date(l.StartDate);
                const e = new Date(l.EndDate);
                if (!isNaN(cur.getTime()) && !isNaN(e.getTime())) {
                    cur.setHours(0, 0, 0, 0);
                    e.setHours(0, 0, 0, 0);
                    const dur = Math.round((e - cur) / (1000 * 60 * 60 * 24)) + 1;
                    if (dur >= 3 && (cur.getMonth() === targetMonth && cur.getFullYear() === targetYear)) {
                        hasThreeDayWOInMonth = true;
                    }
                    while (cur <= e) {
                        if (cur.getMonth() === targetMonth && cur.getFullYear() === targetYear) {
                            uniqueWODates[`${cur.getFullYear()}-${cur.getMonth() + 1}-${cur.getDate()}`] = true;
                        }
                        cur.setDate(cur.getDate() + 1);
                    }
                }
            }
        });
        const usedWoInMonth = Object.keys(uniqueWODates).length;
        const maxConsecutive = this.checkConsecutiveOffDays(start, end, this.personalLeaves || []);

        // Rule 1: 4 continuous days of WO is strictly prohibited
        if (diffDays >= 4 || maxConsecutive >= 4) {
            Swal.fire("Continuous Off Limit Exceeded", "4 continuous Weekly Off days cannot be taken. (2 days WO, then present, then 2 days WO is allowed, but not 4 continuous days).", "error");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        // Rule 2: If duty < 15 days, maximum 2 continuous days at a time
        if (!halfMonthDutyCompleted && diffDays > 2) {
            Swal.fire("Duty Under 15 Days", `When duty is under 15 days (current: ${Math.floor(workedDays)}/15 days), you can only apply for maximum 2 continuous Weekly Off days at a time.`, "warning");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        // Rule 3: 3 continuous days converts absent to WO (requires 15 days duty), but auto-skips 4th WO
        if (diffDays === 3 || maxConsecutive === 3) {
            if (!halfMonthDutyCompleted) {
                Swal.fire("Duty Requirement Not Met", `You must complete at least 15 days of duty before applying for 3 continuous Weekly Off days (Current duty: ${Math.floor(workedDays)}/15 days).`, "warning");
                this.submittingLeave = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
                }
                return;
            }
            // If taking 3 continuous days, 4th is auto-skipped, so total for month cannot exceed 3 days!
            if (usedWoInMonth > 0) {
                Swal.fire("Monthly Limit Exceeded", `Taking 3 continuous Weekly Offs auto-skips the 4th Weekly Off for the month (maximum 3 days allowed). You already have ${usedWoInMonth} day(s) utilized/filed this month.`, "error");
                this.submittingLeave = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
                }
                return;
            }
        }

        // Rule 4: If employee already took a 3-day continuous block in this month, 4th is auto-skipped
        if (hasThreeDayWOInMonth) {
            Swal.fire("4th Weekly Off Auto-Skipped", "Since a 3-day continuous Weekly Off was utilized for this month, the 4th Weekly Off is auto-skipped. No further Weekly Off can be applied this month.", "info");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        // Rule 5: Normal monthly quota is 4 days (e.g. 2 days earlier + 2 days later)
        if (usedWoInMonth + diffDays > 4) {
            Swal.fire("Monthly Quota Exceeded", `Monthly Weekly Off quota is 4 days per month. You have already utilized/filed ${usedWoInMonth} day(s) this month. You cannot request ${diffDays} more day(s).`, "error");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        // Evaluate status: auto-approve standard WO (<=2 days or 3 days with 15-day duty) else require admin review
        let status = "Pending";
        if (type === "Weekly Off") {
            const maxConsecutive = this.checkConsecutiveOffDays(start, end, this.personalLeaves || []);
            
            let isJoiningMonth = false;
            const joinDateStr = localStorage.getItem("EAMS_joining_date");
            if (joinDateStr) {
                try {
                    const parsedJoin = new Date(joinDateStr);
                    const today = new Date();
                    if (parsedJoin.getMonth() === today.getMonth() && parsedJoin.getFullYear() === today.getFullYear()) {
                        if (parsedJoin.getDate() > 1) {
                            isJoiningMonth = true;
                        }
                    }
                } catch(e) {}
            }

            const blockCondition = (maxConsecutive === 3 && !halfMonthDutyCompleted && !isJoiningMonth) || (maxConsecutive >= 4);
            if (!blockCondition) {
                status = "Approved"; // Auto-approve if 15-day duty completed for 3 days or regular <= 2 days!
            }
        }

        if (fileInput && fileInput.required && (!fileInput.files || fileInput.files.length === 0)) {
            Swal.fire("Attachment Required", "A supervisor recommendation document is required for consecutive off-days.", "warning");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        Swal.fire({
            title: "Validating Application...",
            text: "Checking attendance records...",
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        // Smart Attendance Conflict Pre-Validation
        try {
            const historyRes = await API.call({ action: "fetchHistory", employeeId: Auth.getUserId() }, false);
            if (historyRes.status === "Success" && historyRes.data) {
                let conflictPresent = false;
                let conflictHalfDay = false;
                let conflictDate = "";
                
                let checkCurr = new Date(start);
                const checkEnd = new Date(end);
                while (checkCurr <= checkEnd) {
                    const checkDateStr = this.cleanDateFormat(checkCurr);
                    const log = historyRes.data.find(h => this.cleanDateFormat(h.Date) === checkDateStr);
                    if (log) {
                        if (log.Status && (log.Status.includes("Present") || log.Status.includes("Manual"))) {
                            conflictPresent = true;
                            conflictDate = checkDateStr;
                            break;
                        } else if (log.Status && log.Status.includes("Half")) {
                            conflictHalfDay = true;
                            conflictDate = checkDateStr;
                        }
                    }
                    checkCurr.setDate(checkCurr.getDate() + 1);
                }

                if (conflictPresent) {
                    Swal.fire("Application Blocked", `You are marked as "Present" on ${conflictDate}. You cannot apply for a Weekly Off / Leave on a day you have actively worked full-time.`, "error");
                    this.submittingLeave = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
                    }
                    return;
                }

                if (conflictHalfDay) {
                    const confirm = await Swal.fire({
                        title: "Half Day Detected",
                        text: `You are marked as "Half Day" on ${conflictDate}. Are you sure you want to use a Weekly Off / Leave to cover this?`,
                        icon: "warning",
                        showCancelButton: true,
                        confirmButtonText: "Yes, use my WO",
                        cancelButtonText: "Cancel",
                        confirmButtonColor: "#E4002B"
                    });
                    
                    if (!confirm.isConfirmed) {
                        this.submittingLeave = false;
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
                        }
                        return;
                    }
                }
            }
        } catch(err) {
            console.warn("Could not pre-validate attendance overlap. Proceeding with application submission.");
        }

        Swal.fire({
            title: "Filing WO / Leave Application...",
            text: "Uploading documents and saving request details...",
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const payload = {
            action: "submitLeave",
            employeeId: Auth.getUserId(),
            employeeName: Auth.getUserName(),
            type: type,
            startDate: start,
            endDate: end,
            reason: reason,
            status: status,
            attachmentBase64: null,
            attachmentFilename: null
        };

        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        const self = this;

        const sendRequest = async () => {
            try {
                const res = await API.call(payload);
                Swal.close();
                if (res.status === "Success") {
                    Swal.fire("Complete", res.message, "success").then(() => {
                        document.getElementById("form-apply-leave").reset();
                        self.toggleLeaveAttachmentCheck(); // hide files input
                        self.submittingLeave = false;
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
                        }
                        self.loadLeaveView(true);
                    });
                } else {
                    Swal.fire("Submission Failed", res.message, "error");
                    self.submittingLeave = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
                    }
                }
            } catch (err) {
                Swal.close();
                console.error("Filing failed", err);
                Swal.fire("Error", "Server communications failed.", "error");
                self.submittingLeave = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
                }
            }
        };

        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                payload.attachmentBase64 = e.target.result;
                payload.attachmentFilename = file.name;
                sendRequest();
            };
            reader.readAsDataURL(file);
        } else {
            sendRequest();
        }
    },

    // Load upcoming holidays
    async loadHolidaysView(force = false) {
        if (!force && this.holidaysData && this.holidaysData.length > 0) {
            this.renderHolidaysCache();
            return;
        }
        
        const container = document.getElementById("holiday-list-container");
        if (!container) return;

        container.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-danger"></div></div>`;

        try {
            const res = await API.call({
                action: "fetchHolidays"
            }, false);

            if (res.status === "Success" && res.data) {
                this.holidaysData = res.data;
                this.renderHolidaysCache();
            }
        } catch (err) {
            container.innerHTML = `<div class="text-center text-danger">Failed to stream holiday events.</div>`;
        }
    },

    renderHolidaysCache() {
        const container = document.getElementById("holiday-list-container");
        if (!container) return;
        if (!this.holidaysData || this.holidaysData.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">No holidays mapped.</div>`;
            return;
        }
        container.innerHTML = this.holidaysData.map(h => `
            <div class="card p-3 mb-2 bg-light border-0 rounded d-flex flex-row justify-content-between align-items-center">
                <div>
                    <h6 class="fw-bold mb-1">${h.Name}</h6>
                    <small class="text-muted"><i class="fa-solid fa-tag"></i> ${h.Type} Holiday</small>
                </div>
                <div class="text-brand fw-bold">${h.Date}</div>
            </div>
        `).join('');
    },

    // Load profile parameters
    loadProfileView() {
        document.getElementById("prof-id").innerText = Auth.getUserId();
        document.getElementById("prof-name").innerText = Auth.getUserName();
        document.getElementById("prof-branch").innerText = localStorage.getItem("EAMS_branch") || "Unassigned";
        document.getElementById("prof-department").innerText = localStorage.getItem("EAMS_department") || "Unassigned";
        document.getElementById("prof-designation").innerText = localStorage.getItem("EAMS_designation") || "Unassigned";
        
        document.getElementById("prof-bank-name").innerText = localStorage.getItem("EAMS_bank_name") || "Not Provided";
        document.getElementById("prof-bank-acc").innerText = localStorage.getItem("EAMS_bank_acc") || "Not Provided";
        document.getElementById("prof-bank-ifsc").innerText = localStorage.getItem("EAMS_bank_ifsc") || "Not Provided";
        document.getElementById("prof-bank-branch").innerText = localStorage.getItem("EAMS_bank_branch") || "Not Provided";
    },

    // Profile Photo Upload and Compression
    async uploadProfilePhoto(file) {
        if (!file.type.startsWith("image/")) {
            Swal.fire("Error", "Please select a valid image file.", "error");
            return;
        }

        Swal.fire({
            title: 'Compressing & Uploading...',
            text: 'Please wait while your profile picture is updated.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            // Compress image using Canvas
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = objectUrl;
            });
            URL.revokeObjectURL(objectUrl);

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            
            // Resize logic: max 400x400
            let width = img.width;
            let height = img.height;
            const maxSize = 400;
            
            if (width > height) {
                if (width > maxSize) {
                    height = Math.round((height *= maxSize / width));
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = Math.round((width *= maxSize / height));
                    height = maxSize;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Compress as JPEG (0.7 quality)
            const base64Image = canvas.toDataURL("image/jpeg", 0.7);

            // Send to backend API
            const res = await API.call({
                action: "updateProfilePhoto",
                employeeId: Auth.getUserId(),
                imageBlob: base64Image
            });

            if (res.status === "Success" && res.photoUrl) {
                // Update local storage data cache
                localStorage.setItem("EAMS_profile_photo", res.photoUrl);
                
                // Update UI instantly
                this.updateProfilePhotoUI(res.photoUrl);
                
                Swal.fire("Success", "Profile photo updated successfully!", "success");
            } else {
                throw new Error(res.message || "Upload failed");
            }

        } catch (err) {
            Swal.fire("Error", err.message || "Failed to upload photo. Please try again.", "error");
            console.error("Photo upload error:", err);
        }
    },

    updateProfilePhotoUI(url) {
        if (!url || url.trim() === "") return;
        
        // Update Nav Bar Icon
        const navImg = document.getElementById("nav-profile-img");
        const navSvg = document.getElementById("nav-profile-svg");
        if (navImg && navSvg) {
            navImg.src = url;
            navImg.classList.remove("d-none");
            navSvg.classList.add("d-none");
        }

        // Update Profile Tab Icon
        const profImg = document.getElementById("profile-photo-img");
        const profIcon = document.getElementById("profile-default-icon");
        if (profImg && profIcon) {
            profImg.src = url;
            profImg.classList.remove("d-none");
            profIcon.classList.add("d-none");
        }
    },

    // Change profile password
    async changePassword() {
        const currentPass = document.getElementById("prof-curr-pass").value;
        const newPass = document.getElementById("prof-new-pass").value;
        const confirmPass = document.getElementById("prof-conf-pass").value;

        if (newPass !== confirmPass) {
            Swal.fire("Password Mismatch", "New passwords do not match.", "warning");
            return;
        }

        try {
            const currentHash = await Utils.sha256(currentPass);
            const newHash = await Utils.sha256(newPass);

            const res = await API.call({
                action: "changePassword",
                employeeId: Auth.getUserId(),
                currentHash: currentHash,
                newHash: newHash
            });

            if (res.status === "Success") {
                Swal.fire("Success", "Password updated successfully.", "success").then(() => {
                    document.getElementById("form-change-password").reset();
                });
            }
        } catch (err) {
            console.error("Password update error", err);
        }
    },

    geofenceWatchId: null,

    startGeofenceTracking() {
        if (this.geofenceWatchId) return;
        
        console.log("Starting background geofence monitor watch...");
        if (navigator.geolocation) {
            if (localStorage.getItem("EAMS_inside_geofence") === null) {
                localStorage.setItem("EAMS_inside_geofence", "true");
            }
            if (localStorage.getItem("EAMS_geofence_exited_count") === null) {
                localStorage.setItem("EAMS_geofence_exited_count", "0");
            }
            if (localStorage.getItem("EAMS_punch_in_time") === null) {
                localStorage.setItem("EAMS_punch_in_time", Date.now().toString());
                localStorage.setItem("EAMS_time_outside_ms", "0");
                localStorage.setItem("EAMS_last_exit_time", "0");
            }
            
            this.geofenceWatchId = navigator.geolocation.watchPosition(
                (pos) => {
                    if (this.assignedBranch) {
                        const bLat = parseFloat(this.assignedBranch.Latitude);
                        const bLng = parseFloat(this.assignedBranch.Longitude);
                        const radius = parseFloat(this.assignedBranch.Radius) || 100;
                        
                        const distance = Utils.calculateDistance(
                            pos.coords.latitude,
                            pos.coords.longitude,
                            bLat,
                            bLng
                        );
                        
                        const currentlyInside = (distance <= radius);
                        const wasInside = localStorage.getItem("EAMS_inside_geofence") !== "false";
                        
                        if (wasInside && !currentlyInside) {
                            let count = parseInt(localStorage.getItem("EAMS_geofence_exited_count") || "0");
                            count++;
                            localStorage.setItem("EAMS_geofence_exited_count", count.toString());
                            localStorage.setItem("EAMS_inside_geofence", "false");
                            localStorage.setItem("EAMS_last_exit_time", Date.now().toString());
                            console.warn(`Geofence boundary crossed! Total exits: ${count}. Distance: ${distance.toFixed(1)}m`);
                        } else if (!wasInside && currentlyInside) {
                            localStorage.setItem("EAMS_inside_geofence", "true");
                            let lastExit = parseInt(localStorage.getItem("EAMS_last_exit_time") || "0");
                            if (lastExit > 0) {
                                let timeOutside = parseInt(localStorage.getItem("EAMS_time_outside_ms") || "0");
                                timeOutside += (Date.now() - lastExit);
                                localStorage.setItem("EAMS_time_outside_ms", timeOutside.toString());
                                localStorage.setItem("EAMS_last_exit_time", "0");
                            }
                            console.log(`Geofence re-entered. Distance: ${distance.toFixed(1)}m`);
                        }
                    }
                },
                (err) => {
                    console.error("Geofence watch failed (Location turned off or signal lost):", err);
                    const wasInside = localStorage.getItem("EAMS_inside_geofence") !== "false";
                    if (wasInside) {
                        let count = parseInt(localStorage.getItem("EAMS_geofence_exited_count") || "0");
                        count++;
                        localStorage.setItem("EAMS_geofence_exited_count", count.toString());
                        localStorage.setItem("EAMS_inside_geofence", "false");
                        localStorage.setItem("EAMS_last_exit_time", Date.now().toString());
                        console.warn(`Geofence boundary crossed (GPS Disabled)! Total exits: ${count}.`);
                    }
                },
                { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
            );
        }
    },

    stopGeofenceTracking() {
        if (this.geofenceWatchId) {
            navigator.geolocation.clearWatch(this.geofenceWatchId);
            this.geofenceWatchId = null;
            console.log("Stopped background geofence watch.");
        }
    },

    // Helpers & Missed Punch Correction Request Methods
    timeStringToMinutes(timeStr) {
        const clean = this.cleanTimeFormat(timeStr);
        if (!clean || clean === "--" || clean === "") return 0;
        const parts = clean.split(":");
        const hrs = parseInt(parts[0]) || 0;
        const mins = parseInt(parts[1]) || 0;
        return hrs * 60 + mins;
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

    openCorrectionModal() {
        document.getElementById("form-punch-correction").reset();
        
        // Default today's date in yyyy-mm-dd
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = (today.getMonth() + 1).toString().padStart(2, '0');
        const dd = today.getDate().toString().padStart(2, '0');
        document.getElementById("corr-date").value = `${yyyy}-${mm}-${dd}`;
        
        // Show correct fields
        this.toggleCorrectionInputs();
        
        const modalEl = document.getElementById("modal-punch-correction");
        let bootstrapModal = bootstrap.Modal.getInstance(modalEl);
        if (!bootstrapModal) {
            bootstrapModal = new bootstrap.Modal(modalEl);
        }
        bootstrapModal.show();
    },

    toggleCorrectionInputs() {
        const type = document.getElementById("corr-type").value;
        const inWrapper = document.getElementById("corr-in-wrapper");
        const outWrapper = document.getElementById("corr-out-wrapper");
        const inInput = document.getElementById("corr-time-in");
        const outInput = document.getElementById("corr-time-out");
        
        if (type === "In Only") {
            inWrapper.style.display = "block";
            inInput.required = true;
            outWrapper.style.display = "none";
            outInput.required = false;
            outInput.value = "";
        } else if (type === "Out Only") {
            inWrapper.style.display = "none";
            inInput.required = false;
            inInput.value = "";
            outWrapper.style.display = "block";
            outInput.required = true;
        } else {
            inWrapper.style.display = "block";
            inInput.required = true;
            outWrapper.style.display = "block";
            outInput.required = true;
        }
    },
    async checkExistingPunchForCorrection() {
        const dateInput = document.getElementById("corr-date").value;
        const infoDiv = document.getElementById("corr-existing-info");
        const submitBtn = document.getElementById("btn-submit-corr");
        
        if (!dateInput) {
            infoDiv.style.display = "none";
            submitBtn.disabled = false;
            return;
        }
        
        const parsedDate = new Date(dateInput);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const formattedDate = `${parsedDate.getDate().toString().padStart(2, '0')}-${months[parsedDate.getMonth()]}-${parsedDate.getFullYear()}`;
        
        try {
            infoDiv.style.display = "block";
            infoDiv.className = "text-muted small mt-1";
            infoDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking existing record...';
            
            const res = await API.call({
                action: "getEmployeeHistory",
                employeeId: Auth.getUserId(),
                month: parsedDate.getMonth() + 1,
                year: parsedDate.getFullYear()
            }, false);
            
            if (res.status === "Success" && res.data) {
                const record = res.data.find(d => d.Date === formattedDate);
                if (record) {
                    let msg = `<strong>Found Record:</strong>`;
                    if (record.PunchIn) msg += `<br>Punched In: ${record.PunchIn}`;
                    if (record.PunchOut) msg += `<br>Punched Out: ${record.PunchOut}`;
                    
                    if (record.PunchIn && record.PunchOut) {
                        infoDiv.className = "text-danger small mt-1";
                        msg += `<br><em>You have already completed your punch out for this day.</em>`;
                    } else {
                        infoDiv.className = "text-warning small mt-1";
                    }
                    infoDiv.innerHTML = msg;
                } else {
                    infoDiv.className = "text-success small mt-1";
                    infoDiv.innerHTML = "No existing punch record found for this date.";
                }
            } else {
                infoDiv.style.display = "none";
            }
        } catch (e) {
            infoDiv.style.display = "none";
        }
    },

    async submitCorrectionRequest(event) {
        event.preventDefault();
        
        const dateInput = document.getElementById("corr-date").value;
        const type = document.getElementById("corr-type").value;
        const timeIn = document.getElementById("corr-time-in").value;
        const timeOut = document.getElementById("corr-time-out").value;
        const reason = document.getElementById("corr-reason").value;
        const fileInput = document.getElementById("corr-attachment");
        
        // Format date to dd-MMM-yyyy
        const parsedDate = new Date(dateInput);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const formattedDate = `${parsedDate.getDate().toString().padStart(2, '0')}-${months[parsedDate.getMonth()]}-${parsedDate.getFullYear()}`;
        
        if (type === "Both" && timeIn && timeOut) {
            if (timeIn >= timeOut) {
                Swal.fire({ icon: 'error', title: 'Invalid Times', text: 'Punch Out time must be later than Punch In time.' });
                return;
            }
        }
        
        const payload = {
            action: "submitPunchCorrection",
            employeeId: Auth.getUserId(),
            date: formattedDate,
            requestType: type,
            requestedInTime: timeIn,
            requestedOutTime: timeOut,
            reason: reason
        };

        const file = fileInput.files[0];
        const self = this;
        
        const sendRequest = async () => {
            try {
                const res = await API.call(payload);
                if (res.status === "Success") {
                    const modalEl = document.getElementById("modal-punch-correction");
                    const instance = bootstrap.Modal.getInstance(modalEl);
                    if (instance) {
                        instance.hide();
                    }
                    
                    // Force backdrop cleanup
                    document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
                    document.body.classList.remove("modal-open");
                    document.body.style.overflow = "";
                    document.body.style.paddingRight = "";

                    Swal.fire({
                        icon: "success",
                        title: "Request Submitted",
                        text: res.message,
                        confirmButtonColor: "#E4002B"
                    }).then(() => {
                        self.loadDashboardData();
                    });
                }
            } catch (err) {
                console.error("Failed to submit punch correction", err);
            }
        };

        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                Swal.fire("File Too Large", "Attachment size must be less than 2MB.", "error");
                return;
            }
            
            const reader = new FileReader();
            reader.onload = async function(e) {
                payload.attachmentBase64 = e.target.result;
                payload.attachmentFilename = file.name;
                await sendRequest();
            };
            reader.readAsDataURL(file);
        } else {
            await sendRequest();
        }
    },

    // Load pending leave requests in Manager queue (Client Side)
    async loadManagerApprovalsQueue(force = false) {
        if (!force && this.managerApprovalsData) {
            this.renderManagerApprovalsCache();
            return;
        }
        
        const container = document.getElementById("manager-approvals-table-body");
        if (!container) return;
        container.innerHTML = `<tr><td colspan="5" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>`;
        
        try {
            // Load employees roster (to check who has this manager assigned)
            const empRes = await API.call({ action: "fetchLedger", targetTable: "Employees" }, false);
            if (empRes.status !== "Success" || !empRes.data) {
                container.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Failed to load roster.</td></tr>`;
                return;
            }
            
            const leaveRes = await API.call({ action: "fetchLedger", targetTable: "Leave" }, false);
            if (leaveRes.status !== "Success" || !leaveRes.data) {
                container.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Failed to load leaves.</td></tr>`;
                return;
            }

            const currentUserId = Auth.getUserId().toLowerCase();
            this.leaveRequestsData = leaveRes.data; // Cache for restrictions evaluation
            const pending = leaveRes.data.filter(l => l.Status === "Pending");
            
            // Filter to show ONLY employees reporting to this manager
            const subordinatePending = pending.filter(l => {
                const emp = empRes.data.find(e => e.EmployeeID.toString().toLowerCase() === l.EmployeeID.toString().toLowerCase());
                if (!emp || !emp.ReportingManager) return false;
                const managers = emp.ReportingManager.split(',').map(m => m.trim().toLowerCase());
                return managers.includes(currentUserId);
            });

            if (subordinatePending.length === 0) {
                this.managerApprovalsData = [];
            } else {
                this.managerApprovalsData = subordinatePending;
            }
            this.renderManagerApprovalsCache();
            
        } catch (err) {
            container.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Communications error.</td></tr>`;
        }
    },

    renderManagerApprovalsCache() {
        const container = document.getElementById("manager-approvals-table-body");
        if (!container) return;
        if (!this.managerApprovalsData || this.managerApprovalsData.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No pending approvals in your queue.</td></tr>`;
            return;
        }
        container.innerHTML = this.managerApprovalsData.map(l => `
            <tr>
                <td><strong>${l.EmployeeName}</strong><br><small class="text-muted">${l.EmployeeID}</small></td>
                <td>${l.StartDate} to ${l.EndDate}</td>
                <td>${l.Duration} days</td>
                <td>${l.Reason}</td>
                <td>
                    <button class="btn btn-sm btn-success py-1 px-2 mb-1" onclick="EmployeeApp.managerReviewLeave('${l.LeaveID}', 'Approved')"><i class="fa-solid fa-check"></i> Approve</button>
                    <button class="btn btn-sm btn-danger py-1 px-2" onclick="EmployeeApp.managerReviewLeave('${l.LeaveID}', 'Rejected')"><i class="fa-solid fa-times"></i> Reject</button>
                </td>
            </tr>
        `).join('');
    },

    // Review leaves inside Employee Portal (Managers queue)
    managerReviewLeave(leaveId, status) {
        // Enforce Manager consecutive days & 15-day WO limits
        if (status === "Approved" && this.leaveRequestsData) {
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
                    this.loadManagerApprovalsQueue();
                } else {
                    Swal.fire("Error", res.message || "Action failed.", "error");
                }
            }
        });
    },

    // -----------------------------------------
    // OVERDUE PUNCH AUDIO ALARM SYSTEM (Foreground)
    // -----------------------------------------
    alarmIntervalId: null,

    startOverdueAlarmTracker() {
        if (this.alarmIntervalId) clearInterval(this.alarmIntervalId);
        
        this.alarmIntervalId = setInterval(() => {
            if (!this.assignedBranch || !this.assignedBranch.OfficeStart || !this.assignedBranch.OfficeEnd) return;
            
            const todayStr = new Date().toDateString();
            const lastAlarmIn = localStorage.getItem("EAMS_alarm_in_triggered");
            const lastAlarmOut = localStorage.getItem("EAMS_alarm_out_triggered");
            
            const now = new Date();
            const currentMins = now.getHours() * 60 + now.getMinutes();
            
            const parseTime = (t) => {
                let str = t.toString().trim();
                const m = str.match(/(\d{1,2}):(\d{2})/);
                if (m) {
                    let hrs = parseInt(m[1], 10);
                    const mins = parseInt(m[2], 10);
                    if (str.toLowerCase().includes("pm") && hrs < 12) hrs += 12;
                    if (str.toLowerCase().includes("am") && hrs === 12) hrs = 0;
                    return hrs * 60 + mins;
                }
                return null;
            };
            
            const startMins = parseTime(this.assignedBranch.OfficeStart);
            const endMins = parseTime(this.assignedBranch.OfficeEnd);
            
            // Check for missed Punch In
            if (startMins !== null && currentMins >= startMins) {
                if ((!this.todayPunchObj || !this.todayPunchObj.PunchIn) && lastAlarmIn !== todayStr) {
                    localStorage.setItem("EAMS_alarm_in_triggered", todayStr);
                    this.playAlarm("ALARM! Your shift has started, but you haven't clocked in yet. Please Punch IN immediately.");
                }
            }
            
            // Check for missed Punch Out
            if (endMins !== null && currentMins >= endMins) {
                if (this.todayPunchObj && this.todayPunchObj.PunchIn && !this.todayPunchObj.PunchOut && lastAlarmOut !== todayStr) {
                    localStorage.setItem("EAMS_alarm_out_triggered", todayStr);
                    this.playAlarm("ALARM! Your shift has ended! Please Punch OUT before you leave for the day.");
                }
            }
        }, 30000); // Check every 30 seconds
    },
    
    playAlarm(message) {
        try {
            // Standard royalty-free digital watch alarm tone via Data URI to work entirely offline
            // Using a simple short beep pattern string if possible, or standard Google sound
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
            audio.loop = true;
            
            // Note: Autoplay may be blocked by browser if user hasn't interacted with the page yet,
            // but since they opened the app to view the dashboard, interaction usually exists.
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => console.warn("Audio autoplay blocked by browser policy."));
            }
            
            Swal.fire({
                icon: "warning",
                title: "<span style='color: #E4002B; font-weight: 800; font-size: 1.5rem;'><i class='fa-solid fa-bell fa-shake'></i> ATTENTION!</span>",
                html: `<p style="font-size: 1.1rem; font-weight: 600;">${message}</p>`,
                confirmButtonColor: "#E4002B",
                confirmButtonText: "I Understand",
                allowOutsideClick: false,
                backdrop: `
                  rgba(228,0,43,0.4)
                `
            }).then(() => {
                audio.pause();
                audio.currentTime = 0;
            });
        } catch (e) {
            console.error("Failed to play alarm", e);
        }
    },

    // --- MANAGER RELAXATION REQUEST ---
    async submitRelaxationRequest() {
        const rawDate = document.getElementById('mgr-relax-date').value;
        const endTime = document.getElementById('mgr-relax-time').value;
        const reason = document.getElementById('mgr-relax-reason').value.trim();

        if (!rawDate || !endTime) {
            Swal.fire('Error', 'Please fill in both Date and End Time', 'warning');
            return;
        }

        // Format date to dd-MMM-yyyy
        const parsedDate = new Date(rawDate);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const formattedDate = `${parsedDate.getDate().toString().padStart(2, '0')}-${months[parsedDate.getMonth()]}-${parsedDate.getFullYear()}`;

        // The branch of the manager is tracked in assignedBranch
        if (!this.assignedBranch || !this.assignedBranch.BranchName) {
            Swal.fire('Error', 'Could not determine your assigned branch.', 'error');
            return;
        }

        const managerBranch = this.assignedBranch.BranchName;

        const confirm = await Swal.fire({
            title: 'Submit Request?',
            text: `Request relaxation for ${managerBranch} on ${formattedDate} until ${endTime}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Submit to Admin'
        });

        if (confirm.isConfirmed) {
            try {
                Swal.fire({ title: 'Submitting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                const ruleId = 'RLX' + Math.floor(1000 + Math.random() * 9000);
                const res = await API.call({
                    action: 'saveRelaxation',
                    data: {
                        RuleID: ruleId,
                        BranchName: managerBranch,
                        RuleType: 'SpecificDate',
                        RuleValue: formattedDate,
                        NewOfficeEnd: endTime,
                        Status: 'Pending',
                        RequestedBy: Auth.getUserId(),
                        Reason: reason
                    }
                });

                if (res.status === 'Success') {
                    Swal.fire('Success', 'Relaxation request sent to Admin.', 'success');
                    document.getElementById('form-request-relaxation').reset();
                } else {
                    Swal.fire('Error', res.message, 'error');
                }
            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Server communication failed.', 'error');
            }
        }
    },

    // --- TALKING ANGELA & TOM "ACT LIKE REAL" INTERACTIVE ENGINE ---
    setCompanionView(mode) {
        const angelaWrap = document.getElementById('alive-angela-wrap');
        const tomWrap = document.getElementById('alive-tom-wrap');
        const btnBoth = document.getElementById('btn-mode-both');
        const btnAngela = document.getElementById('btn-mode-angela');
        const btnTom = document.getElementById('btn-mode-tom');

        if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');
        if (btnAngela) btnAngela.classList.toggle('active', mode === 'angela');
        if (btnTom) btnTom.classList.toggle('active', mode === 'tom');

        if (angelaWrap) {
            angelaWrap.style.display = (mode === 'both' || mode === 'angela') ? 'flex' : 'none';
        }
        if (tomWrap) {
            tomWrap.style.display = (mode === 'both' || mode === 'tom') ? 'flex' : 'none';
        }

        localStorage.setItem('EAMS_mascot_companion', mode);

        // Play mini cheerful reaction
        if (mode === 'angela') this.interactWithMascot('angela');
        else if (mode === 'tom') this.interactWithMascot('tom');
    },

    interactWithMascot(char) {
        if (char === 'angela') {
            const wrap = document.getElementById('alive-angela-wrap');
            const badge = document.getElementById('angela-alive-badge');
            const speech = document.getElementById('mascot-speech-text');

            if (wrap) {
                wrap.classList.remove('react-jump');
                void wrap.offsetWidth; // Reflow
                wrap.classList.add('react-jump');

                // Spawn floating love heart particle
                this.spawnReactionParticle(wrap, '💖');
            }

            const quotes = [
                'Hi! Let\'s do great today! 🎀',
                'You\'ve got this! ✨',
                'Smile! You\'re amazing! 💖',
                'Ready to punch in? 👇'
            ];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            if (badge) badge.innerText = 'Giggle! 🎀💖';
            if (speech) speech.innerHTML = `<strong>Angela:</strong> "${randomQuote}"`;

            setTimeout(() => {
                if (badge) badge.innerText = 'Hi there! 🎀';
            }, 2500);
        } else {
            const wrap = document.getElementById('alive-tom-wrap');
            const badge = document.getElementById('tom-alive-badge');
            const speech = document.getElementById('mascot-speech-text');

            if (wrap) {
                wrap.classList.remove('react-jump');
                void wrap.offsetWidth; // Reflow
                wrap.classList.add('react-jump');

                // Spawn action star particle
                this.spawnReactionParticle(wrap, '⭐');
            }

            const quotes = [
                'Yeah! Ready to rock today! 👊',
                'Let\'s get this shift started! 😼',
                'Punch button is right down here! 👇',
                'High five! 🐾⭐'
            ];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            if (badge) badge.innerText = 'Yeah! 😼⭐';
            if (speech) speech.innerHTML = `<strong>Tom:</strong> "${randomQuote}"`;

            setTimeout(() => {
                if (badge) badge.innerText = 'Hey! 😼';
            }, 2500);
        }
    },

    playMascotChase() {
        const podium = document.getElementById('mascot-characters-podium');
        const angelaImg = document.getElementById('angela-alive-img');
        const angelaBadge = document.getElementById('angela-alive-badge');
        const tomBadge = document.getElementById('tom-alive-badge');
        const speech = document.getElementById('mascot-speech-text');
        const btnChase = document.getElementById('btn-mascot-chase');
        if (!podium) return;

        // Ensure both companions are shown
        this.setCompanionView('both');

        // Toggle off if already running
        if (podium.classList.contains('is-chasing')) {
            podium.classList.remove('is-chasing');
            if (angelaImg) angelaImg.src = 'img/angela_animated.webp';
            if (angelaBadge) angelaBadge.innerText = 'Hi there! 🎀';
            if (tomBadge) tomBadge.innerText = 'Hey! 😼';
            if (btnChase) btnChase.innerHTML = '<i class="fa-solid fa-person-running text-warning me-1"></i> Chase & Play 🏃🐾';
            return;
        }

        // Start running chase!
        podium.classList.add('is-chasing');
        if (angelaImg) angelaImg.src = 'img/angela_run.webp';
        if (angelaBadge) angelaBadge.innerText = 'Catch me! 🎀🏃';
        if (tomBadge) tomBadge.innerText = 'Wait for me! 😼💨';
        if (speech) speech.innerHTML = `<strong>Angela & Tom:</strong> "Wheeee! Running around the office! 🏃🐾 Tap Punch 👇 when ready to clock in!"`;
        if (btnChase) btnChase.innerHTML = '<i class="fa-solid fa-pause text-danger me-1"></i> Stop Chase ⏸️';

        const angelaWrap = document.getElementById('alive-angela-wrap');
        const tomWrap = document.getElementById('alive-tom-wrap');
        this.spawnReactionParticle(angelaWrap, '💖');
        this.spawnReactionParticle(tomWrap, '💨');

        const chaseInterval = setInterval(() => {
            if (!podium.classList.contains('is-chasing')) {
                clearInterval(chaseInterval);
                return;
            }
            this.spawnReactionParticle(angelaWrap, '✨');
            this.spawnReactionParticle(tomWrap, '💨');
        }, 1200);

        // Auto-revert after 7.6 seconds (2 sprint loops)
        setTimeout(() => {
            clearInterval(chaseInterval);
            if (podium.classList.contains('is-chasing')) {
                podium.classList.remove('is-chasing');
                if (angelaImg) angelaImg.src = 'img/angela_animated.webp';
                if (angelaBadge) angelaBadge.innerText = 'Hehe, so fun! 🎀';
                if (tomBadge) tomBadge.innerText = 'Phew, fast! 😼🐾';
                if (btnChase) btnChase.innerHTML = '<i class="fa-solid fa-person-running text-warning me-1"></i> Chase & Play 🏃🐾';
                if (speech) speech.innerHTML = `Angela & Tom are ready! Tap Punch at the bottom 👇 to record attendance.`;
                setTimeout(() => {
                    if (angelaBadge) angelaBadge.innerText = 'Hi there! 🎀';
                    if (tomBadge) tomBadge.innerText = 'Hey! 😼';
                }, 3000);
            }
        }, 7600);
    },

    mascotPointToPunch() {
        const tomWrap = document.getElementById('alive-tom-wrap');
        const badge = document.getElementById('tom-alive-badge');
        const speech = document.getElementById('mascot-speech-text');

        if (tomWrap) {
            tomWrap.classList.remove('point-down');
            void tomWrap.offsetWidth; // Reflow
            tomWrap.classList.add('point-down');

            // Spawn pointing finger particle
            this.spawnReactionParticle(tomWrap, '👇');
        }

        if (badge) badge.innerText = 'Look here! 👇';
        if (speech) {
            speech.innerHTML = `<strong>Tom:</strong> "Tap the Punch button right down here at the bottom! 👇"`;
        }

        // Trigger pulse on the bottom nav Punch button and floating guide
        this.highlightBottomPunch(true);

        setTimeout(() => {
            if (badge) badge.innerText = 'Hey! 😼';
        }, 3000);
    },

    spawnReactionParticle(container, emoji) {
        if (!container) return;
        const particle = document.createElement('div');
        particle.className = 'alive-particle';
        particle.innerText = emoji;
        particle.style.left = `${30 + Math.random() * 40}%`;
        container.appendChild(particle);
        setTimeout(() => particle.remove(), 1200);
    },

    highlightBottomPunch(showFloatingGuide = true) {
        const punchLink = document.querySelector('.bottom-nav-link[data-view="punch"]');
        const guideEl = document.getElementById('bottom-punch-visual-guide');

        if (punchLink) {
            punchLink.classList.remove('pulse-attention');
            void punchLink.offsetWidth; // Reflow
            punchLink.classList.add('pulse-attention');
        }

        if (showFloatingGuide && guideEl) {
            guideEl.style.display = 'flex';
            guideEl.classList.remove('animated-fade-out');
            guideEl.classList.add('animated-fade-in-up');

            if (this.guideTimeoutId) clearTimeout(this.guideTimeoutId);
            this.guideTimeoutId = setTimeout(() => {
                guideEl.classList.remove('animated-fade-in-up');
                guideEl.classList.add('animated-fade-out');
                setTimeout(() => {
                    guideEl.style.display = 'none';
                    guideEl.classList.remove('animated-fade-out');
                }, 400);
            }, 3800);
        }
    },

    updateMascotGreeting(name, punchObj) {
        const rawName = (name || localStorage.getItem('EAMS_username') || 'Colleague').trim();
        const firstName = rawName.split(' ')[0] || 'Friend';

        const welcomeNameEl = document.getElementById('employee-welcome-name');
        if (welcomeNameEl) welcomeNameEl.innerText = firstName;

        const speechEl = document.getElementById('mascot-speech-text');
        let statusMessage = '';

        if (!punchObj || !punchObj.PunchIn) {
            statusMessage = `Angela & Tom are waiting for you! Tap Punch at the bottom 👇 to check in. 🐾`;
        } else if (punchObj.PunchIn && !punchObj.PunchOut) {
            statusMessage = `You are on shift (In: ${punchObj.PunchIn}). Remember to Punch Out at the bottom 👇 when leaving! 🐾`;
        } else {
            statusMessage = `Shift completed (In: ${punchObj.PunchIn} | Out: ${punchObj.PunchOut}). Angela & Tom wish you a wonderful evening! 🎉`;
        }

        if (speechEl) speechEl.innerHTML = statusMessage;

        // Restore saved companion mode
        const savedMode = localStorage.getItem('EAMS_mascot_companion') || 'both';
        this.setCompanionView(savedMode);

        // Visual hint to bottom punch button after 2.5s if not yet punched out
        if (!punchObj || !punchObj.PunchIn || !punchObj.PunchOut) {
            setTimeout(() => {
                if (this.currentActiveView === 'dashboard') {
                    this.highlightBottomPunch(false);
                }
            }, 2500);
        }
    },

    // Legacy no-op fallbacks to prevent errors
    triggerMascotTurboDash() {
        this.mascotPointToPunch();
    },
    speakGreeting() {},
    toggleVoiceGreeting() {},
    switchMascotCharacter() {
        const current = localStorage.getItem('EAMS_mascot_companion') || 'both';
        const next = current === 'both' ? 'angela' : (current === 'angela' ? 'tom' : 'both');
        this.setCompanionView(next);
    }
};


