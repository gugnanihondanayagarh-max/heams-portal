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
        await this.loadDashboardData();
    },

    // Event Bindings
    bindEvents() {
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
            document.getElementById("employee-welcome-name").innerText = Auth.getUserName();
            
            const res = await API.call({
                action: "getEmployeeDashboard",
                employeeId: Auth.getUserId()
            }, false);

            if (res.status === "Success") {
                this.assignedBranch = res.branchDetails;
                
                if (res.employeeData && res.employeeData.ProfilePhoto) {
                    this.updateProfilePhotoUI(res.employeeData.ProfilePhoto);
                }
                this.attendanceStats = res.stats;
                
                // Set stats cards text
                document.getElementById("stat-present").innerText = res.stats.present;
                document.getElementById("stat-absent").innerText = res.stats.absent;
                document.getElementById("stat-late").innerText = res.stats.late;
                document.getElementById("stat-leaves").innerText = res.stats.leaves;
                document.getElementById("stat-half").innerText = res.stats.half;

                // Render circular attendance percentage
                const totalWorking = res.stats.present + res.stats.absent;
                const percentage = totalWorking > 0 ? Math.round((res.stats.present / totalWorking) * 100) : 100;
                this.updateCircularProgress(percentage);

                // Render Branch info cards
                if (this.assignedBranch) {
                    document.getElementById("dash-branch-name").innerText = this.assignedBranch.BranchName;
                    document.getElementById("dash-office-timing").innerText = `${this.assignedBranch.OfficeStart} - ${this.assignedBranch.OfficeEnd}`;
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

                // Render Recent activities
                this.renderRecentActivities(res.recentPunches);
            }
        } catch (err) {
            console.error("Failed to load dashboard metrics", err);
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

    // Start WebRTC Camera stream & GPS location monitoring
    async startCameraAndGPS() {
        this.capturedImage = null;
        document.getElementById("selfie-preview").style.display = "none";
        document.getElementById("camera-stream").style.display = "block";
        document.getElementById("btn-retake-selfie").style.display = "none";
        document.getElementById("btn-capture-selfie").style.display = "block";
        
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
        document.getElementById("gps-status-badge").className = "geo-status-indicator pending";
        document.getElementById("gps-status-badge").innerText = "Acquiring Coordinates...";
        document.getElementById("gps-latitude").innerText = "--";
        document.getElementById("gps-longitude").innerText = "--";
        document.getElementById("gps-distance").innerText = "--";
        
        if (navigator.geolocation) {
            // First attempt: High Accuracy
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    // Check if accuracy is terrible (cell tower fallback)
                    if (pos.coords.accuracy > 1500) {
                        Swal.fire({
                            title: 'Weak GPS Signal',
                            text: `Accuracy is low (${Math.round(pos.coords.accuracy)}m). We are using cell-tower fallback. Please step outside for a clear sky view.`,
                            icon: 'warning', toast: true, position: 'top-end', timer: 4000, showConfirmButton: false
                        });
                    }
                    this.handleGPSLock(pos);
                },
                (err) => {
                    console.warn("High-accuracy GPS failed, falling back to standard...", err);
                    if (err.code === 1) {
                        Swal.fire("Permission Denied", "Please allow location access to punch attendance.", "error");
                        return;
                    }
                    // Second attempt: Standard Accuracy Fallback
                    navigator.geolocation.getCurrentPosition(
                        (fallbackPos) => {
                            Swal.fire({
                                title: 'Weak GPS Signal',
                                text: 'High-accuracy GPS failed. Using mobile network triangulation. Please step near a window.',
                                icon: 'warning', toast: true, position: 'top-end', timer: 4000, showConfirmButton: false
                            });
                            this.handleGPSLock(fallbackPos);
                        },
                        (fallbackErr) => {
                            document.getElementById("gps-status-badge").className = "geo-status-indicator outside";
                            document.getElementById("gps-status-badge").innerText = "GPS Error";
                            Swal.fire("GPS Error", "Failed to retrieve location completely. Step outside and try again.", "error");
                        },
                        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
                    );
                },
                { enableHighAccuracy: true, timeout: 25000, maximumAge: 15000 }
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
            accuracyText.innerText = `Accuracy: ±${this.currentCoords.accuracy.toFixed(1)}m`;
            
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
                            inMins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
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

                activeMins = elapsedMins - timeOutsideMins;
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
                
                const thresholdMins = reqMins * 0.95;
                if (activeMins < thresholdMins) {
                    const remainMinsToThreshold = Math.ceil(thresholdMins - activeMins);
                    const confirm = await Swal.fire({
                        title: 'Shift Incomplete!',
                        html: `Please wait <strong>${remainMinsToThreshold} minutes</strong> to complete your duty hours.<br><br>Punching out now may mark your day as a <strong>Half Day</strong> or <strong>Absent</strong> according to company criteria.<br><br>Are you sure you want to punch out early?`,
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
                this.personalApprovedLeaves = res.leaves || [];

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
        let calHtml = "";
        
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
            
            if (log) {
                const status = log.Status || "Present";
                const hasPunchIn = log.PunchIn && log.PunchIn.toString().trim() !== "" && log.PunchIn !== "--";
                const hasPunchOut = log.PunchOut && log.PunchOut.toString().trim() !== "" && log.PunchOut !== "--";

                if (!hasPunchIn && hasPunchOut) {
                    statusClass = "absent";
                    statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                    statusTooltip = `Missed Punch In`;
                } else if (hasPunchIn && !hasPunchOut) {
                    if (isToday) {
                        if (status.includes("Late")) {
                            statusClass = "short";
                            statusLetter = `<span class="badge bg-warning text-dark rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.6rem; padding: 0; margin-top:2px; font-weight: bold;">IN</span>`;
                            statusTooltip = `Late Arrival (Working)`;
                        } else {
                            statusClass = "present";
                            statusLetter = `<span class="badge bg-success rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.6rem; padding: 0; margin-top:2px; font-weight: bold;">IN</span>`;
                            statusTooltip = `Present (Working)`;
                        }
                    } else {
                        statusClass = "absent";
                        statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">OUT</span>`;
                        statusTooltip = `Missed Punch Out`;
                    }
                } else if (status.includes("Late")) {
                    statusClass = "short";
                    statusLetter = `<span class="badge bg-warning text-dark rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.6rem; padding: 0; margin-top:2px; font-weight: bold;">IN</span>`;
                    statusTooltip = `Late Arrival`;
                } else if (status.includes("Short")) {
                    statusClass = "short";
                    statusLetter = `<span class="badge bg-warning text-dark rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.65rem; padding: 0; margin-top:2px; font-weight: bold;">P</span>`;
                    statusTooltip = `Short Day (Status: ${status})`;
                } else if (status.includes("Half")) {
                    statusClass = "half";
                    statusLetter = `<span class="badge bg-info text-dark rounded-circle shadow-sm d-flex align-items-center justify-content-center mx-auto" style="width: 22px; height: 22px; font-size:0.65rem; padding: 0; margin-top:2px; font-weight: bold;">H</span>`;
                    statusTooltip = `Half Day (Status: ${status})`;
                } else if (status.includes("Present") || status.includes("Completed") || status.includes("Manual")) {
                    statusClass = "present";
                    statusLetter = "P";
                    statusTooltip = `Present (Status: ${status})`;
                } else if (status.includes("In Progress")) {
                    statusClass = "present";
                    statusLetter = "P";
                    statusTooltip = "In Progress";
                } else {
                    statusClass = "absent";
                    statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                    statusTooltip = `Absent (Status: ${status})`;
                }
            } else {
                // Check if approved leave or WO exists for this date first (displays scheduled off-days)
                if (leaveType) {
                    if (leaveType === "Weekly Off" || leaveType === "WO") {
                        statusClass = "weekly-off";
                        statusLetter = "WO";
                        statusTooltip = "Weekly Off (Approved)";
                    } else {
                        statusClass = "absent";
                        statusLetter = "LV";
                        statusTooltip = `${leaveType} Leave (Approved)`;
                    }
                } else {
                    // Check if it's a future date
                    const checkDateOnly = new Date(year, month, day);
                    const todayOnly = new Date();
                    todayOnly.setHours(0,0,0,0);
                    
                    if (checkDateOnly > todayOnly) {
                        statusClass = "empty";
                        statusLetter = "";
                        statusTooltip = "Future Date";
                    } else {
                        if (isToday) {
                            statusClass = "absent";
                            statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                            statusTooltip = "Missed Punch In";
                        } else {
                            statusClass = "absent";
                            statusLetter = `<span class="badge bg-danger rounded-pill shadow-sm" style="font-size:0.6rem; padding: 2px 6px; margin-top:2px; font-weight: bold; color: white !important;">IN</span>`;
                            statusTooltip = "Absent";
                        }
                    }
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
        if (!force && this.personalLeaves && this.personalLeaves.length > 0) {
            this.renderLeaveHistoryCache();
            return;
        }
        
        const container = document.getElementById("leave-history-list");
        if (!container) return;

        container.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-danger"></div></div>`;

        try {
            const res = await API.call({
                action: "fetchLeaves",
                employeeId: Auth.getUserId()
            }, false);

            if (res.status === "Success" && res.data) {
                // Save leaves to local state for validator checks
                this.personalLeaves = res.data;

                // Update WO balance indicator
                const woBalEl = document.getElementById("leave-balance-wo");
                if (woBalEl) {
                    woBalEl.innerText = res.balances.weeklyOff || 0;
                }

                if (res.data.length === 0) {
                    container.innerHTML = `<div class="text-center text-muted py-3">No applications lodged.</div>`;
                    return;
                }

                container.innerHTML = res.data.map(l => {
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
            }
        } catch (err) {
            container.innerHTML = `<div class="text-center text-danger">Failed to stream leaves logs.</div>`;
        }
    },

    renderLeaveHistoryCache() {
        const container = document.getElementById("leave-history-list");
        if (!container) return;
        if (!this.personalLeaves || this.personalLeaves.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">No applications lodged.</div>`;
            return;
        }
        container.innerHTML = this.personalLeaves.map(l => {
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

        const maxConsecutive = this.checkConsecutiveOffDays(start, end, this.personalLeaves || []);

        // Count employee's worked days (Present + Half Days) in the current month
        const workedDays = this.attendanceStats ? (this.attendanceStats.present + this.attendanceStats.half) : 0;
        const halfMonthDutyCompleted = workedDays >= 15;

        // Exempt joining month starting after the 1st
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
            } catch (e) {}
        }

        const blockCondition = (maxConsecutive === 3 && !halfMonthDutyCompleted && !isJoiningMonth) || (maxConsecutive >= 4);

        if (blockCondition) {
            warningMsg.innerText = `Notice: Consecutive off-days block of ${maxConsecutive} days detected. Your direct application limit is exceeded (worked: ${workedDays}/15 days). This request requires administrator approval, and a supervisor recommendation document is required.`;
            warningDiv.style.display = "block";
            attachmentContainer.style.display = "block";
            fileInput.required = true;
        } else {
            warningDiv.style.display = "none";
            attachmentContainer.style.display = "none";
            fileInput.required = false;
        }
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
            Swal.fire("Details Missing", "Please complete all leave parameters.", "warning");
            this.submittingLeave = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> File Application`;
            }
            return;
        }

        // Evaluate status: auto-approve standard WO else require admin review
        let status = "Pending";
        if (type === "Weekly Off") {
            const maxConsecutive = this.checkConsecutiveOffDays(start, end, this.personalLeaves || []);
            const workedDays = this.attendanceStats ? (this.attendanceStats.present + this.attendanceStats.half) : 0;
            const halfMonthDutyCompleted = workedDays >= 15;
            
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
                status = "Approved"; // Apply and approve directly!
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
                        self.loadLeaveView();
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
                const uData = Auth.getUserData();
                uData.ProfilePhoto = res.photoUrl;
                localStorage.setItem("EAMS_user", JSON.stringify(uData));
                
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
                (err) => console.error("Geofence watch failed:", err),
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
    }
};


