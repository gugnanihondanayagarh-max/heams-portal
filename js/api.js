/**
 * EAMS - High Performance Supabase API Gateway Engine
 * Blazing fast (<50ms) replacement for Google Apps Script
 */

const API = {
    // Configured Supabase Endpoint
    config: {
        url: "https://zdjnxuxwtcogjoddweob.supabase.co",
        key: "sb_publishable_FKn5RSVxuTPJeeREZrTrjw_1u7AiKOK"
    },

    getURL() {
        return this.config.url;
    },

    // Helper: Supabase REST Request Wrapper
    async rest(endpoint, options = {}) {
        const url = `${this.config.url}/rest/v1/${endpoint}`;
        const headers = {
            "apikey": this.config.key,
            "Authorization": `Bearer ${this.config.key}`,
            "Content-Type": "application/json",
            "Prefer": options.prefer || "return=representation",
            ...(options.headers || {})
        };

        const res = await fetch(url, {
            method: options.method || "GET",
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Supabase Error (${res.status}): ${errText}`);
        }

        const text = await res.text();
        return text ? JSON.parse(text) : null;
    },

    // Helper: Upload photo to Supabase Storage (attendance-photos bucket)
    async uploadPhoto(folder, filename, base64Data) {
        if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:')) {
            return base64Data || "";
        }

        try {
            const parts = base64Data.split(';base64,');
            const contentType = parts[0].split(':')[1] || 'image/jpeg';
            const raw = window.atob(parts[1]);
            const rawLength = raw.length;
            const uInt8Array = new Uint8Array(rawLength);
            for (let i = 0; i < rawLength; ++i) {
                uInt8Array[i] = raw.charCodeAt(i);
            }
            const blob = new Blob([uInt8Array], { type: contentType });

            const safeFilename = `${folder}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const uploadUrl = `${this.config.url}/storage/v1/object/attendance-photos/${safeFilename}`;

            const res = await fetch(uploadUrl, {
                method: "POST",
                headers: {
                    "apikey": this.config.key,
                    "Authorization": `Bearer ${this.config.key}`,
                    "Content-Type": contentType
                },
                body: blob
            });

            if (!res.ok) {
                console.warn("Storage upload warning, falling back to data URL:", await res.text());
                return base64Data;
            }

            return `${this.config.url}/storage/v1/object/public/attendance-photos/${safeFilename}`;
        } catch (e) {
            console.error("Failed to upload image to Supabase Storage", e);
            return base64Data;
        }
    },

    // Helper: Format Date dd-MMM-yyyy
    formatDateStr(date = new Date()) {
        const d = new Date(date);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const day = d.getDate().toString().padStart(2, '0');
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    },

    // Helper: Format Time HH:mm:ss
    formatTimeStr(date = new Date()) {
        const d = new Date(date);
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        const ss = d.getSeconds().toString().padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    },

    // Helper: Compute leave & WO balances according to company policy
    computeLeaveBalances(leavesList) {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const uniqueWoDates = {};
        let casualUsed = 0, medicalUsed = 0, emergencyUsed = 0;
        let approvedCount = 0;

        (leavesList || []).forEach(l => {
            if (l.Status === "Approved") {
                approvedCount++;
                const dur = parseInt(l.Duration) || 0;
                const type = (l.Type || "").toLowerCase();
                if (type.includes("weekly off") || type.includes("wo")) {
                    let curr = new Date(l.StartDate);
                    const end = new Date(l.EndDate);
                    if (!isNaN(curr.getTime()) && !isNaN(end.getTime())) {
                        curr.setHours(0, 0, 0, 0);
                        end.setHours(0, 0, 0, 0);
                        while (curr <= end) {
                            if (curr.getMonth() === currentMonth && curr.getFullYear() === currentYear) {
                                const dateKey = `${curr.getFullYear()}-${curr.getMonth() + 1}-${curr.getDate()}`;
                                uniqueWoDates[dateKey] = true;
                            }
                            curr.setDate(curr.getDate() + 1);
                        }
                    }
                } else if (type.includes("casual")) casualUsed += dur;
                else if (type.includes("medical")) medicalUsed += dur;
                else if (type.includes("emergency")) emergencyUsed += dur;
            }
        });

        return {
            weeklyOff: Object.keys(uniqueWoDates).length,
            casual: Math.max(0, 15 - casualUsed),
            medical: Math.max(0, 10 - medicalUsed),
            emergency: Math.max(0, 5 - emergencyUsed),
            approvedCount: approvedCount
        };
    },

    // Helper: Calculate distance between two GPS coordinates (meters)
    calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
        const R = 6371e3; // Earth radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c);
    },

    // UNIFIED CALL DISPATCHER
    async call(payload, showLoader = true) {
        if (showLoader && typeof Swal !== 'undefined') {
            Swal.fire({
                title: "Processing...",
                html: "Syncing with Supabase Cloud Engine",
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });
        }

        try {
            const result = await this.handleAction(payload);
            if (showLoader && typeof Swal !== 'undefined') Swal.close();
            return result;
        } catch (err) {
            console.error("API Call Exception:", err);
            if (showLoader && typeof Swal !== 'undefined') Swal.close();
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: "error",
                    title: "Transaction Failure",
                    text: err.message || "An unexpected error occurred.",
                    confirmButtonColor: "#E4002B"
                });
            }
            return { status: "Error", message: err.message || "Execution failed." };
        }
    },

    // ACTION ROUTER
    async handleAction(payload) {
        const action = payload.action;

        // ----------------------------------------------------
        // 1. AUTHENTICATION
        // ----------------------------------------------------
        if (action === "employeeLogin" || action === "adminLogin") {
            const uid = (payload.username || "").trim();
            const passHash = (payload.password || "").trim().toLowerCase();

            const creds = await this.rest(`credentials?EmployeeID=ilike.${encodeURIComponent(uid)}&select=*`);
            if (!creds || creds.length === 0) {
                return { status: "Error", message: "Invalid credentials." };
            }

            const cred = creds[0];
            if (cred.PasswordHash.toLowerCase() !== passHash) {
                return { status: "Error", message: "Invalid credentials." };
            }

            if (action === "adminLogin" && cred.Role !== "Admin") {
                return { status: "Error", message: "Access restricted: User is not authorized as an Administrator." };
            }

            // Generate token & update session
            const token = "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
            const nowIso = new Date().toISOString();
            await this.rest(`credentials?EmployeeID=eq.${encodeURIComponent(cred.EmployeeID)}`, {
                method: "PATCH",
                body: { Token: token, LastLogin: nowIso }
            });

            // Fetch profile
            let name = cred.EmployeeID;
            let branch = "--";
            let photo = "";
            let role = cred.Role;

            const emps = await this.rest(`employees?EmployeeID=ilike.${encodeURIComponent(cred.EmployeeID)}&select=*`);
            const emp = (emps && emps.length > 0) ? emps[0] : {};

            if (emp.Name) name = emp.Name;
            if (emp.Branch) branch = emp.Branch;
            if (emp.ProfilePhoto) photo = emp.ProfilePhoto;

            if (action === "employeeLogin" && emp.Status && emp.Status !== "Active") {
                return { status: "Error", message: "Your registration profile is currently inactive." };
            }

            return {
                status: "Success",
                token: token,
                role: role,
                username: cred.EmployeeID,
                employeeId: cred.EmployeeID,
                userId: cred.EmployeeID,
                employeeName: name,
                name: name,
                isManager: emp.IsManager === "Yes" ? "Yes" : "No",
                branch: branch,
                department: emp.Department || "",
                designation: emp.Designation || "",
                photo: photo,
                bankName: emp.BankName || "",
                bankAccount: emp.AccountNumber || "",
                bankIfsc: emp.IFSCCode || "",
                bankBranch: emp.BankBranch || "",
                joiningDate: emp.JoiningDate || "",
                message: "Authentication successful."
            };
        }

        // ----------------------------------------------------
        // 2. EMPLOYEE DASHBOARD
        // ----------------------------------------------------
        if (action === "getEmployeeDashboard") {
            let empId = (payload.employeeId || Auth.getUserId() || "").trim();
            const todayStr = this.formatDateStr();
            const d = new Date();
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const currentMonthYear = `-${months[d.getMonth()]}-${d.getFullYear()}`;

            // Fire all dashboard queries in parallel (Sub-150ms response)
            const [emps, todayPunches, monthLogs, leaves, recentPunches, branches] = await Promise.all([
                this.rest(`employees?EmployeeID=ilike.${encodeURIComponent(empId)}&select=*`),
                this.rest(`attendance?EmployeeID=ilike.${encodeURIComponent(empId)}&Date=eq.${encodeURIComponent(todayStr)}&select=*`),
                this.rest(`attendance?EmployeeID=ilike.${encodeURIComponent(empId)}&Date=like.*${encodeURIComponent(currentMonthYear)}&select=Status`),
                this.rest(`leaves?EmployeeID=ilike.${encodeURIComponent(empId)}&order=AppliedDate.desc&select=*`),
                this.rest(`attendance?EmployeeID=ilike.${encodeURIComponent(empId)}&order=Created_At.desc&limit=5&select=*`),
                this.cachedBranches ? Promise.resolve(this.cachedBranches) : this.rest(`branches?select=*`)
            ]);

            if (branches && !this.cachedBranches) {
                this.cachedBranches = branches;
            }

            const emp = (emps && emps.length > 0) ? emps[0] : {};
            if (emp.EmployeeID) empId = emp.EmployeeID;

            let branchDetails = null;
            if (emp.Branch && branches) {
                branchDetails = branches.find(b => (b.BranchName || "").toLowerCase() === emp.Branch.trim().toLowerCase());
            }
            if (!branchDetails && branches && branches.length > 0) {
                branchDetails = branches[0];
            }

            const todayPunch = (todayPunches && todayPunches.length > 0) ? todayPunches[0] : null;

            let present = 0;
            let late = 0;
            let half = 0;
            let absent = 0;

            (monthLogs || []).forEach(log => {
                const st = log.Status || "";
                if (st.includes("Present")) present++;
                if (st.includes("Late")) late++;
                if (st.includes("Half")) half++;
                if (st.includes("Absent")) absent++;
            });

            const leaveBalances = this.computeLeaveBalances(leaves);

            return {
                status: "Success",
                empInfo: emp,
                employeeData: emp,
                employeeName: emp.Name || "",
                branchDetails: branchDetails,
                stats: {
                    present: present,
                    absent: absent,
                    late: late,
                    leaves: leaveBalances.approvedCount,
                    half: half
                },
                leaves: leaves || [],
                leaveBalances: leaveBalances,
                todayPunch: todayPunch,
                recentPunches: recentPunches || []
            };
        }

        // ----------------------------------------------------
        // ----------------------------------------------------
        // 3. EXECUTE PUNCH TRANSACTION
        // ----------------------------------------------------
        if (action === "executePunchTransaction") {
            let empId = (payload.employeeId || Auth.getUserId() || "").trim();
            const punchType = payload.punchType; // "In" or "Out"
            const clientLat = parseFloat(payload.lat);
            const clientLng = parseFloat(payload.lng);
            const remarks = payload.remarks || "";
            const todayStr = this.formatDateStr();
            const timeStr = this.formatTimeStr();

            // Fetch employee with case-insensitive search
            const emps = await this.rest(`employees?EmployeeID=ilike.${encodeURIComponent(empId)}&select=*`);
            const emp = (emps && emps.length > 0) ? emps[0] : {};
            if (emp.EmployeeID) {
                empId = emp.EmployeeID; // Canonical uppercase ID
            }
            const attendanceId = `${empId}_${todayStr}`;

            // Fetch employee branch
            let branch = null;
            if (emp.Branch) {
                const branches = await this.rest(`branches?BranchName=ilike.${encodeURIComponent(emp.Branch.trim())}&select=*`);
                if (branches && branches.length > 0) branch = branches[0];
            }
            if (!branch) {
                const fallbackBranches = await this.rest(`branches?select=*&limit=1`);
                branch = (fallbackBranches && fallbackBranches.length > 0) ? fallbackBranches[0] : { Latitude: clientLat, Longitude: clientLng, Radius: 100, OfficeStart: "09:30:00", OfficeEnd: "19:30:00", GraceTime: 30 };
            }

            // Distance calculation
            const dist = this.calculateDistance(clientLat, clientLng, branch.Latitude, branch.Longitude);
            const radius = branch.Radius || 100;
            const isMismatch = dist > radius;

            if (isMismatch && remarks.trim() === "") {
                return { status: "Error", message: "Outside geofence clock-in requires a mandatory reason remark." };
            }

            // Upload selfie to Supabase Storage
            let selfieUrl = "";
            if (payload.imageBlob) {
                try {
                    selfieUrl = await this.uploadPhoto("selfies", `${empId}_${punchType}_${Date.now()}.jpg`, payload.imageBlob);
                } catch (imgErr) {
                    console.warn("Selfie upload warning, continuing punch:", imgErr);
                }
            }

            // Check existing attendance for today
            const existingRecords = await this.rest(`attendance?AttendanceID=eq.${encodeURIComponent(attendanceId)}&select=*`);
            const exists = (existingRecords && existingRecords.length > 0);
            const existingRec = exists ? existingRecords[0] : null;
            const prevIn = (existingRec && existingRec.PunchIn) ? existingRec.PunchIn.toString().trim() : "";
            const prevOut = (existingRec && existingRec.PunchOut) ? existingRec.PunchOut.toString().trim() : "";

            // Strict Verification: Prevent Duplicate Punches & Require Clock In before Clock Out
            if (punchType === "In") {
                if (prevIn !== "") {
                    return {
                        status: "Error",
                        message: `Duplicate transaction skipped: already clocked In today at ${prevIn}.`
                    };
                }
            } else if (punchType === "Out") {
                if (!exists || prevIn === "") {
                    return {
                        status: "Error",
                        message: "Cannot Clock Out without clocking In first."
                    };
                }
                if (prevOut !== "") {
                    return {
                        status: "Error",
                        message: `Duplicate transaction skipped: already clocked Out today at ${prevOut}.`
                    };
                }
            }

            // Determine Status for In Punch
            let currentStatus = "Present";
            if (isMismatch) {
                currentStatus = "Location Mismatch";
            } else if (punchType === "In") {
                const startStr = (branch.OfficeStart || "09:30").toString().trim();
                const startParts = startStr.split(":");
                const officeInMinutes = parseInt(startParts[0] || "9", 10) * 60 + parseInt(startParts[1] || "30", 10);
                const graceMin = parseInt(branch.GraceTime || 30, 10);
                const punchParts = timeStr.split(":");
                const punchInMinutes = parseInt(punchParts[0], 10) * 60 + parseInt(punchParts[1], 10);
                if (punchInMinutes > (officeInMinutes + graceMin)) {
                    currentStatus = "Late Arrival";
                }
            }

            if (punchType === "In") {
                const recordData = {
                    AttendanceID: attendanceId,
                    EmployeeID: empId,
                    Date: todayStr,
                    PunchIn: timeStr,
                    PunchOut: "",
                    WorkingHours: "",
                    LatitudeIn: clientLat,
                    LongitudeIn: clientLng,
                    DistanceIn: dist,
                    Status: currentStatus,
                    ImageIn: selfieUrl,
                    Remarks: remarks
                };

                if (exists) {
                    await this.rest(`attendance?AttendanceID=eq.${encodeURIComponent(attendanceId)}`, {
                        method: "PATCH",
                        body: recordData
                    });
                } else {
                    await this.rest(`attendance`, {
                        method: "POST",
                        body: recordData
                    });
                }

                // Audit log
                try {
                    await this.rest(`logs`, {
                        method: "POST",
                        body: {
                            Timestamp: new Date().toISOString(),
                            User: empId,
                            Action: "PUNCH_IN",
                            Details: `Clock in verified at branch ${branch.BranchName || "Office"}. Distance: ${dist}m. Status: ${currentStatus}`
                        }
                    });
                } catch (logErr) {}

                return {
                    status: "Success",
                    punchType: "In",
                    time: timeStr,
                    message: `Punched IN successfully at ${timeStr}. Status: ${currentStatus}`
                };

            } else {
                // Punch Out: Calculate Working Hours & Shift Status
                const parseTimeMin = (tStr) => {
                    if (!tStr) return 0;
                    const m = tStr.toString().match(/(\d{1,2}):(\d{2})/);
                    if (m) {
                        let h = parseInt(m[1], 10);
                        const min = parseInt(m[2], 10);
                        if (tStr.toString().toLowerCase().includes("pm") && h < 12) h += 12;
                        if (tStr.toString().toLowerCase().includes("am") && h === 12) h = 0;
                        return h * 60 + min;
                    }
                    return 0;
                };

                const inMin = parseTimeMin(prevIn);
                const outMin = parseTimeMin(timeStr);
                let workedMin = outMin - inMin;
                if (workedMin < 0) workedMin += 24 * 60;

                const hrs = Math.floor(workedMin / 60);
                const mins = workedMin % 60;
                const workingHours = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;

                // Calculate required hours
                const reqStart = parseTimeMin(branch.OfficeStart || "09:30");
                const reqEnd = parseTimeMin(branch.OfficeEnd || "19:30");
                let reqMinutes = reqEnd - reqStart;
                if (reqMinutes <= 0) reqMinutes = 600; // default 10 hrs

                let updatedStatus = "Present";
                if (workedMin >= 0.95 * reqMinutes) {
                    updatedStatus = "Present";
                } else if (workedMin >= 0.90 * reqMinutes) {
                    updatedStatus = "Short Present";
                } else if (workedMin >= 0.45 * reqMinutes) {
                    updatedStatus = "Half Day";
                } else {
                    updatedStatus = "Absent";
                }

                if (isMismatch) {
                    updatedStatus += " (Location Mismatch)";
                }

                // Remarks formatting
                let finalRemarks = remarks;
                const exitedCount = parseInt(payload.exitedCount || "0", 10);
                if (exitedCount > 0) {
                    const exitRemark = `Left geofence: ${exitedCount} time(s)`;
                    finalRemarks = finalRemarks !== "" ? finalRemarks + " | " + exitRemark : exitRemark;
                }
                if (payload.activeTimeStr && payload.activeTimeStr !== "") {
                    const activeRemark = `Active: ${payload.activeTimeStr}`;
                    finalRemarks = finalRemarks !== "" ? finalRemarks + " | " + activeRemark : activeRemark;
                }
                const existingRem = existingRec?.Remarks ? existingRec.Remarks.trim() : "";
                const combinedRemarks = existingRem ? (finalRemarks ? `${existingRem} | ${finalRemarks}` : existingRem) : finalRemarks;

                const outData = {
                    PunchOut: timeStr,
                    LatitudeOut: clientLat,
                    LongitudeOut: clientLng,
                    DistanceOut: dist,
                    ImageOut: selfieUrl,
                    WorkingHours: workingHours,
                    Status: updatedStatus,
                    Remarks: combinedRemarks
                };

                await this.rest(`attendance?AttendanceID=eq.${encodeURIComponent(attendanceId)}`, {
                    method: "PATCH",
                    body: outData
                });

                // Audit log
                try {
                    await this.rest(`logs`, {
                        method: "POST",
                        body: {
                            Timestamp: new Date().toISOString(),
                            User: empId,
                            Action: "PUNCH_OUT",
                            Details: `Clock out verified at branch ${branch.BranchName || "Office"}. Distance: ${dist}m`
                        }
                    });
                } catch (logErr) {}

                return {
                    status: "Success",
                    punchType: "Out",
                    time: timeStr,
                    message: `Punched OUT successfully at ${timeStr}. Status: ${updatedStatus}`
                };
            }
        }

        // ----------------------------------------------------
        // 4. FETCH HISTORY & LEAVES
        // ----------------------------------------------------
        if (action === "fetchHistory" || action === "getEmployeeHistory") {
            const empId = (payload.employeeId || Auth.getUserId() || "").trim();
            const [data, leaves] = await Promise.all([
                this.rest(`attendance?EmployeeID=ilike.${encodeURIComponent(empId)}&order=Created_At.desc&limit=100&select=*`),
                this.rest(`leaves?EmployeeID=ilike.${encodeURIComponent(empId)}&Status=eq.Approved&select=*`)
            ]);
            return { status: "Success", data: data || [], leaves: leaves || [] };
        }

        if (action === "fetchLeaves") {
            const empId = (payload.employeeId || Auth.getUserId() || "").trim();
            const data = await this.rest(`leaves?EmployeeID=ilike.${encodeURIComponent(empId)}&order=AppliedDate.desc&select=*`);
            const leavesList = data || [];
            const balances = this.computeLeaveBalances(leavesList);
            return {
                status: "Success",
                data: leavesList,
                balances: balances
            };
        }

        if (action === "submitLeave") {
            const leaveId = `LV-${Date.now().toString().slice(-6)}`;
            let attachmentUrl = "";
            if (payload.attachmentBase64) {
                attachmentUrl = await this.uploadPhoto("attachments", `${payload.employeeId}_${payload.attachmentFilename || 'proof.jpg'}`, payload.attachmentBase64);
            }

            const startDateObj = new Date(payload.startDate);
            const endDateObj = new Date(payload.endDate);
            const diffTime = Math.abs(endDateObj - startDateObj);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const leaveData = {
                LeaveID: leaveId,
                EmployeeID: payload.employeeId || Auth.getUserId(),
                EmployeeName: payload.employeeName || Auth.getUserName(),
                Type: payload.type,
                StartDate: payload.startDate,
                EndDate: payload.endDate,
                Duration: diffDays.toString(),
                Reason: payload.reason || "",
                Status: payload.status || "Pending",
                AppliedDate: this.formatDateStr(),
                Attachment: attachmentUrl,
                ApprovedBy: "",
                Comments: ""
            };

            await this.rest(`leaves`, {
                method: "POST",
                body: leaveData
            });

            return { status: "Success", message: "Leave application submitted successfully." };
        }

        if (action === "fetchHolidays") {
            const data = await this.rest(`holidays?order=Date.asc&select=*`);
            return { status: "Success", data: data || [] };
        }

        if (action === "changePassword") {
            const empId = payload.employeeId || Auth.getUserId();
            const currentHash = (payload.currentHash || "").toLowerCase();
            const newHash = (payload.newHash || "").toLowerCase();

            const creds = await this.rest(`credentials?EmployeeID=eq.${encodeURIComponent(empId)}&select=*`);
            if (!creds || creds.length === 0 || creds[0].PasswordHash.toLowerCase() !== currentHash) {
                return { status: "Error", message: "Current password is incorrect." };
            }

            await this.rest(`credentials?EmployeeID=eq.${encodeURIComponent(empId)}`, {
                method: "PATCH",
                body: { PasswordHash: newHash }
            });

            return { status: "Success", message: "Password updated successfully." };
        }

        if (action === "updateProfilePhoto") {
            const empId = payload.employeeId || Auth.getUserId();
            let photoUrl = "";
            if (payload.photoBase64) {
                photoUrl = await this.uploadPhoto("profiles", `${empId}_avatar.jpg`, payload.photoBase64);
            }

            await this.rest(`employees?EmployeeID=eq.${encodeURIComponent(empId)}`, {
                method: "PATCH",
                body: { ProfilePhoto: photoUrl }
            });

            return { status: "Success", message: "Profile photo updated.", photoUrl: photoUrl };
        }

        // ----------------------------------------------------
        // 5. ADMIN METRICS & LEDGERS
        // ----------------------------------------------------
        if (action === "getAdminMetrics") {
            const todayStr = this.formatDateStr();

            // Run in parallel for sub-100ms response
            const [emps, branches, punches] = await Promise.all([
                this.rest(`employees?Status=eq.Active&select=EmployeeID`),
                this.cachedBranches ? Promise.resolve(this.cachedBranches) : this.rest(`branches?select=BranchID,BranchName`),
                this.rest(`attendance?Date=eq.${encodeURIComponent(todayStr)}&select=AttendanceID,Status`)
            ]);

            if (branches && !this.cachedBranches) {
                this.cachedBranches = branches;
            }

            const totalEmployees = emps ? emps.length : 0;
            const totalBranches = branches ? branches.length : 0;
            const presentToday = punches ? punches.length : 0;
            let locationMismatches = 0;
            (punches || []).forEach(p => {
                if (p.Status && p.Status.includes("Mismatch")) locationMismatches++;
            });

            return {
                status: "Success",
                totalEmployees: totalEmployees,
                totalBranches: totalBranches,
                presentToday: presentToday,
                locationMismatches: locationMismatches,
                trends: [],
                branchBreakdown: []
            };
        }

        if (action === "fetchLedger") {
            const tableMap = {
                "Employees": "employees?select=*&order=EmployeeID.asc",
                "Branches": "branches?select=*&order=BranchID.asc",
                "Attendance": "attendance?select=*&order=Created_At.desc&limit=500",
                "Leave": "leaves?select=*&order=AppliedDate.desc",
                "Holiday": "holidays?select=*&order=Date.asc",
                "Corrections": "corrections?select=*&order=SubmittedAt.desc",
                "Relaxations": "relaxations?select=*&order=RuleID.asc",
                "Logs": "logs?select=*&order=Timestamp.desc&limit=200"
            };

            const endpoint = tableMap[payload.targetTable] || `${payload.targetTable.toLowerCase()}?select=*`;
            const data = await this.rest(endpoint);
            return { status: "Success", data: data || [] };
        }

        // ----------------------------------------------------
        // 6. ADMIN CRUD OPERATIONS
        // ----------------------------------------------------
        if (action === "saveEmployee") {
            const empData = payload.data;
            const mode = payload.mode || "create";

            // If credentials password provided
            if (empData.Password && empData.Password.trim() !== "") {
                const credData = {
                    EmployeeID: empData.EmployeeID,
                    PasswordHash: Utils.sha256 ? await Utils.sha256(empData.Password) : empData.Password,
                    Role: empData.Role || "Employee"
                };
                await this.rest(`credentials`, {
                    method: "POST",
                    headers: { "Prefer": "resolution=merge-duplicates" },
                    body: credData
                });
            }

            // Save Profile
            const profile = { ...empData };
            delete profile.Password;
            delete profile.Role;

            await this.rest(`employees`, {
                method: "POST",
                headers: { "Prefer": "resolution=merge-duplicates" },
                body: profile
            });

            return { status: "Success", message: "Employee profile saved successfully." };
        }

        if (action === "resetPassword") {
            const empId = payload.employeeId;
            const newHash = payload.newHash;
            await this.rest(`credentials?EmployeeID=eq.${encodeURIComponent(empId)}`, {
                method: "PATCH",
                body: { PasswordHash: newHash }
            });
            return { status: "Success", message: `Password reset successfully for ${empId}.` };
        }

        if (action === "deleteEmployee") {
            const empId = payload.employeeId;
            await this.rest(`employees?EmployeeID=eq.${encodeURIComponent(empId)}`, {
                method: "PATCH",
                body: { Status: "Inactive" }
            });
            return { status: "Success", message: "Employee marked as Inactive." };
        }

        if (action === "saveBranch") {
            await this.rest(`branches`, {
                method: "POST",
                headers: { "Prefer": "resolution=merge-duplicates" },
                body: payload.data
            });
            return { status: "Success", message: "Branch coordinates and policies saved." };
        }

        if (action === "deleteBranch") {
            await this.rest(`branches?BranchID=eq.${encodeURIComponent(payload.branchId)}`, {
                method: "DELETE"
            });
            return { status: "Success", message: "Branch deleted successfully." };
        }

        if (action === "reviewLeave") {
            await this.rest(`leaves?LeaveID=eq.${encodeURIComponent(payload.leaveId)}`, {
                method: "PATCH",
                body: {
                    Status: payload.status,
                    Comments: payload.comments || "",
                    ApprovedBy: payload.approvedBy || Auth.getUserId()
                }
            });
            return { status: "Success", message: `Leave application marked as ${payload.status}.` };
        }

        if (action === "saveHoliday") {
            await this.rest(`holidays`, {
                method: "POST",
                headers: { "Prefer": "resolution=merge-duplicates" },
                body: payload.data
            });
            return { status: "Success", message: "Holiday added successfully." };
        }

        if (action === "submitPunchCorrection") {
            const reqId = `CORR-${Date.now().toString().slice(-6)}`;
            let docUrl = "";
            if (payload.proofDoc) {
                docUrl = await this.uploadPhoto("corrections", `${payload.employeeId || Auth.getUserId()}_proof.jpg`, payload.proofDoc);
            }

            const corrData = {
                RequestID: reqId,
                EmployeeID: payload.employeeId || Auth.getUserId(),
                EmployeeName: payload.employeeName || Auth.getUserName(),
                Date: payload.date,
                RequestType: payload.requestType || payload.punchType || "Both",
                RequestedInTime: payload.requestedInTime || payload.correctedInTime || "",
                RequestedOutTime: payload.requestedOutTime || payload.correctedOutTime || "",
                Reason: payload.reason || "",
                Attachment: docUrl,
                Status: "Pending",
                SubmittedAt: new Date().toISOString()
            };

            await this.rest(`corrections`, {
                method: "POST",
                body: corrData
            });

            return { status: "Success", message: "Correction request submitted successfully." };
        }

        if (action === "fetchCorrections") {
            const data = await this.rest(`corrections?order=SubmittedAt.desc&select=*`);
            return { status: "Success", data: data || [] };
        }

        if (action === "processCorrection") {
            await this.rest(`corrections?RequestID=eq.${encodeURIComponent(payload.requestId)}`, {
                method: "PATCH",
                body: {
                    Status: payload.status
                }
            });
            return { status: "Success", message: `Punch correction marked as ${payload.status}.` };
        }

        if (action === "fetchRelaxations") {
            const data = await this.rest(`relaxations?order=RuleID.asc&select=*`);
            return { status: "Success", data: data || [] };
        }

        if (action === "saveRelaxation") {
            await this.rest(`relaxations`, {
                method: "POST",
                headers: { "Prefer": "resolution=merge-duplicates" },
                body: payload.data
            });
            return { status: "Success", message: "Relaxation rule applied." };
        }

        if (action === "deleteRelaxation") {
            await this.rest(`relaxations?RuleID=eq.${encodeURIComponent(payload.ruleId)}`, {
                method: "DELETE"
            });
            return { status: "Success", message: "Relaxation rule deleted." };
        }

        if (action === "updateAttendance") {
            const attId = payload.attendanceId;
            const updateFields = { ...payload };
            delete updateFields.action;
            delete updateFields.attendanceId;
            delete updateFields.token;
            delete updateFields.authUserId;

            await this.rest(`attendance?AttendanceID=eq.${encodeURIComponent(attId)}`, {
                method: "PATCH",
                body: updateFields
            });
            return { status: "Success", message: "Attendance record updated." };
        }

        if (action === "generateReport") {
            const reportType = payload.reportType || "Daily";
            const targetDate = payload.date ? new Date(payload.date) : new Date();
            const targetMonth = targetDate.getMonth();
            const targetYear = targetDate.getFullYear();
            const targetDateStr = this.formatDateStr(targetDate);
            const includeInactive = payload.includeInactive || false;

            if (reportType === "Matrix") {
                const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
                const headers = ["EmployeeID", "Name", "Branch"];
                for (let d = 1; d <= lastDay; d++) {
                    headers.push(d.toString());
                }

                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const monthSuffix = `-${months[targetMonth]}-${targetYear}`;
                
                // Fetch matrix prerequisites in parallel
                const [emps, punches, holList, leaveList] = await Promise.all([
                    this.rest(`employees?select=*&order=EmployeeID.asc`),
                    this.rest(`attendance?Date=like.*${encodeURIComponent(monthSuffix)}&select=AttendanceID,EmployeeID,Date,PunchIn,PunchOut,Status,Remarks`),
                    this.rest(`holidays?select=Date`),
                    this.rest(`leaves?Status=eq.Approved&select=EmployeeID,StartDate,EndDate,Type`)
                ]);

                const empList = (emps || []).filter(e => e.Status === "Active" || includeInactive);
                const holidayDates = (holList || []).map(h => h.Date);

                const today = new Date();
                today.setHours(23, 59, 59, 999);

                const data = empList.map(emp => {
                    const empId = (emp.EmployeeID || "").toLowerCase();
                    const personalLogs = (punches || []).filter(a => (a.EmployeeID || "").toLowerCase() === empId);
                    
                    const logMap = {};
                    personalLogs.forEach(log => {
                        if (log.Date) logMap[log.Date] = log;
                    });

                    const approvedLeaves = (leaveList || []).filter(l => 
                        (l.EmployeeID || "").toLowerCase() === empId
                    );

                    const rowObj = {
                        EmployeeID: emp.EmployeeID,
                        Name: emp.Name,
                        Branch: emp.Branch
                    };

                    for (let d = 1; d <= lastDay; d++) {
                        const checkDate = new Date(targetYear, targetMonth, d);
                        const dateStr = `${d.toString().padStart(2, '0')}-${months[targetMonth]}-${targetYear}`;

                        if (checkDate > today) {
                            rowObj[d.toString()] = "--";
                            continue;
                        }

                        const isToday = checkDate.toDateString() === new Date().toDateString();

                        // 1. Priority: Check if an approved Leave or Weekly Off covers this date
                        let onLeave = false;
                        let leaveCode = "LV";
                        for (let l = 0; l < approvedLeaves.length; l++) {
                            const start = new Date(approvedLeaves[l].StartDate);
                            const end = new Date(approvedLeaves[l].EndDate);
                            start.setHours(0, 0, 0, 0);
                            end.setHours(23, 59, 59, 999);
                            if (checkDate >= start && checkDate <= end) {
                                onLeave = true;
                                if (approvedLeaves[l].Type === "Weekly Off" || approvedLeaves[l].Type === "WO") {
                                    leaveCode = "WO";
                                } else {
                                    leaveCode = "LV";
                                }
                                break;
                            }
                        }

                        const log = logMap[dateStr];
                        const dbStatus = log ? (log.Status || "") : "";
                        const hasPunchIn = !!(log && log.PunchIn && log.PunchIn.toString().trim() !== "" && log.PunchIn !== "--");
                        const hasPunchOut = !!(log && log.PunchOut && log.PunchOut.toString().trim() !== "" && log.PunchOut !== "--");
                        const remarks = log ? (log.Remarks || "") : "";

                        // If approved leave / WO exists:
                        // Unless employee actively worked a full present shift, honor approved leave / WO
                        if (onLeave) {
                            if (hasPunchIn && hasPunchOut && dbStatus.indexOf("Present") === 0) {
                                rowObj[d.toString()] = "P";
                            } else {
                                rowObj[d.toString()] = leaveCode;
                            }
                            continue;
                        }

                        // 2. Dealership Holiday check (if no active punch)
                        if (holidayDates.indexOf(dateStr) !== -1 && !hasPunchIn && !hasPunchOut) {
                            rowObj[d.toString()] = "HL";
                            continue;
                        }

                        // Check manual admin overrides
                        const isManualOverride = dbStatus.indexOf("Manual") === 0 || 
                                                 remarks.includes("[Admin") || 
                                                 remarks.includes("Correction approved");

                        // Calculate working minutes if both in and out exist
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
                            if (inM >= 0 && outM >= 0) {
                                workedMin = outM - inM;
                            }
                        }

                        // 3. Status Evaluation
                        if (!hasPunchIn && !hasPunchOut) {
                            // Full day with NO in and NO out
                            if (isToday) {
                                rowObj[d.toString()] = "MISS_IN"; // Today pending punch in
                            } else {
                                rowObj[d.toString()] = "A"; // Past absent day is 'A' (NOT red IN badge)
                            }
                        } else if (!hasPunchIn && hasPunchOut) {
                            // Missed morning punch in
                            rowObj[d.toString()] = isManualOverride ? "P" : "MISS_IN";
                        } else if (hasPunchIn && !hasPunchOut) {
                            if (isToday) {
                                if (dbStatus.indexOf("Late") === 0) {
                                    rowObj[d.toString()] = "LATE_IN"; // Active late today
                                } else {
                                    rowObj[d.toString()] = "ACT_IN"; // Active on-time today
                                }
                            } else {
                                rowObj[d.toString()] = isManualOverride ? "P" : "MISS_OUT"; // Past day missing punch out
                            }
                        } else {
                            // Both punch in and punch out exist
                            // If punched near departure time (<45 mins or absent with punch), this was a missed morning punch in
                            const punchedNearDeparture = (workedMin >= 0 && workedMin < 45) || 
                                                         (dbStatus.indexOf("Absent") === 0 && (workedMin < 120 || workedMin < 0)) || 
                                                         dbStatus.includes("Missing");
                            if (!isManualOverride && punchedNearDeparture) {
                                rowObj[d.toString()] = "MISS_IN";
                            } else if (dbStatus.indexOf("Late") === 0) {
                                rowObj[d.toString()] = "L"; // Completed day late arrival -> yellow text 'L'
                            } else if (dbStatus.indexOf("Short") === 0) {
                                rowObj[d.toString()] = "EARLY_P"; // Short Present -> yellow badge 'P'
                            } else if (dbStatus.indexOf("Half") === 0) {
                                rowObj[d.toString()] = "H"; // Half Day -> blue badge 'H'
                            } else if (dbStatus.indexOf("Absent") === 0) {
                                rowObj[d.toString()] = "A"; // Absent -> red text 'A'
                            } else if (dbStatus.indexOf("Weekly Off") === 0) {
                                rowObj[d.toString()] = "WO"; // Weekly Off -> blue text 'WO'
                            } else if (dbStatus.indexOf("Leave") === 0) {
                                rowObj[d.toString()] = "LV"; // Leave -> purple text 'LV'
                            } else {
                                rowObj[d.toString()] = "P"; // Full present -> green text 'P'
                            }
                        }
                    }

                    return rowObj;
                });

                return { status: "Success", headers: headers, data: data };
            }

            if (reportType === "Daily") {
                const [emps, punches] = await Promise.all([
                    this.rest(`employees?select=*&order=EmployeeID.asc`),
                    this.rest(`attendance?Date=eq.${encodeURIComponent(targetDateStr)}&select=*`)
                ]);
                const empMap = {};
                (emps || []).forEach(e => { empMap[e.EmployeeID] = e; });

                const headers = ["EmployeeID", "Name", "Branch", "PunchIn", "PunchOut", "WorkingHours", "Status", "Remarks"];
                const data = (punches || []).map(p => {
                    const emp = empMap[p.EmployeeID] || {};
                    return {
                        EmployeeID: p.EmployeeID,
                        Name: emp.Name || "Unknown",
                        Branch: emp.Branch || "--",
                        PunchIn: p.PunchIn || "--",
                        PunchOut: p.PunchOut || "--",
                        WorkingHours: p.WorkingHours || "--",
                        Status: p.Status || "Present",
                        Remarks: p.Remarks || ""
                    };
                });
                return { status: "Success", headers: headers, data: data };
            }

            if (reportType === "Monthly") {
                const headers = ["EmployeeID", "Name", "Branch", "PresentDays", "AbsentDays", "LateDays", "LeaveDays"];
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const monthSuffix = `-${months[targetMonth]}-${targetYear}`;
                
                const [emps, punches, leaves] = await Promise.all([
                    this.rest(`employees?select=*&order=EmployeeID.asc`),
                    this.rest(`attendance?Date=like.*${encodeURIComponent(monthSuffix)}&select=EmployeeID,Status`),
                    this.rest(`leaves?Status=eq.Approved&select=EmployeeID`)
                ]);

                const empList = (emps || []).filter(e => e.Status === "Active" || includeInactive);
                const today = new Date();
                const currentDay = (targetMonth === today.getMonth() && targetYear === today.getFullYear()) ? today.getDate() : new Date(targetYear, targetMonth + 1, 0).getDate();

                const data = empList.map(emp => {
                    const empId = (emp.EmployeeID || "").toLowerCase();
                    const personalLogs = (punches || []).filter(a => (a.EmployeeID || "").toLowerCase() === empId);
                    const personalLeaves = (leaves || []).filter(l => (l.EmployeeID || "").toLowerCase() === empId);

                    let present = 0;
                    let late = 0;
                    let half = 0;

                    personalLogs.forEach(p => {
                        const st = p.Status || "Present";
                        if (st.includes("Present") || st.includes("Completed")) present++;
                        if (st.includes("Late")) { late++; present++; }
                        if (st.includes("Half")) { half++; present += 0.5; }
                    });

                    const leaveCount = personalLeaves.length;
                    const absent = Math.max(0, currentDay - Math.floor(present) - leaveCount);

                    return {
                        EmployeeID: emp.EmployeeID,
                        Name: emp.Name || "Unknown",
                        Branch: emp.Branch || "--",
                        PresentDays: present,
                        AbsentDays: absent,
                        LateDays: late,
                        LeaveDays: leaveCount
                    };
                });

                return { status: "Success", headers: headers, data: data };
            }

            if (reportType === "Late") {
                const headers = ["EmployeeID", "Name", "Date", "PunchIn", "OfficeStart", "Status"];
                const punches = await this.rest(`attendance?Date=eq.${encodeURIComponent(targetDateStr)}&Status=like.*Late*&select=*`);
                const branches = await this.rest(`branches?select=*`);
                const branchMap = {};
                (branches || []).forEach(b => { branchMap[b.BranchName] = b; });

                const data = (punches || []).map(p => {
                    const emp = empMap[p.EmployeeID] || {};
                    const br = branchMap[emp.Branch] || {};
                    return {
                        EmployeeID: p.EmployeeID,
                        Name: emp.Name || "Unknown",
                        Date: p.Date,
                        PunchIn: p.PunchIn || "--",
                        OfficeStart: br.OfficeStart || "--",
                        Status: p.Status || "Late Arrival"
                    };
                });

                return { status: "Success", headers: headers, data: data };
            }

            if (reportType === "GPSMismatch") {
                const headers = ["EmployeeID", "Name", "Date", "PunchIn", "PunchOut", "DistanceIn", "DistanceOut", "Status"];
                const punches = await this.rest(`attendance?Date=eq.${encodeURIComponent(targetDateStr)}&Status=like.*Mismatch*&select=*`);

                const data = (punches || []).map(p => {
                    const emp = empMap[p.EmployeeID] || {};
                    return {
                        EmployeeID: p.EmployeeID,
                        Name: emp.Name || "Unknown",
                        Date: p.Date,
                        PunchIn: p.PunchIn || "--",
                        PunchOut: p.PunchOut || "--",
                        DistanceIn: p.DistanceIn ? `${p.DistanceIn}m` : "--",
                        DistanceOut: p.DistanceOut ? `${p.DistanceOut}m` : "--",
                        Status: p.Status || "Location Mismatch"
                    };
                });

                return { status: "Success", headers: headers, data: data };
            }

            if (reportType === "Comprehensive") {
                const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                
                let headers = ["Employee Name", "Employee Code/ID", "Department/Branch", "Punch Type"];
                const dateHeaders = [];
                for (let d = 1; d <= lastDay; d++) {
                    dateHeaders.push(`${d.toString().padStart(2, '0')}-${monthNames[targetMonth]}-${targetYear}`);
                }
                headers = headers.concat(dateHeaders);
                headers = headers.concat(["P", "A", "L", "Half", "WO", "Leaves", "Total Hrs"]);

                const monthSuffix = `-${monthNames[targetMonth]}-${targetYear}`;
                const punches = await this.rest(`attendance?Date=like.*${encodeURIComponent(monthSuffix)}&select=*`);
                const holList = await this.rest(`holidays?select=*`);
                const holidayDates = (holList || []).map(h => h.Date);
                const leaveList = await this.rest(`leaves?Status=eq.Approved&select=*`);

                const data = [];
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                empList.forEach(emp => {
                    const empId = (emp.EmployeeID || "").toLowerCase();
                    const personalLogs = (punches || []).filter(a => (a.EmployeeID || "").toLowerCase() === empId);
                    const logMap = {};
                    personalLogs.forEach(l => { if (l.Date) logMap[l.Date] = l; });

                    const approvedLeaves = (leaveList || []).filter(l => (l.EmployeeID || "").toLowerCase() === empId);

                    const rowStatus = { "Employee Name": emp.Name, "Employee Code/ID": emp.EmployeeID, "Department/Branch": `${emp.Department || '--'} / ${emp.Branch || '--'}`, "Punch Type": "Status", "P": 0, "A": 0, "L": 0, "Half": 0, "WO": 0, "Leaves": 0, "Total Hrs": "00:00" };
                    const rowIn = { "Employee Name": "", "Employee Code/ID": "", "Department/Branch": "", "Punch Type": "In" };
                    const rowOut = { "Employee Name": "", "Employee Code/ID": "", "Department/Branch": "", "Punch Type": "Out" };

                    let totalWorkMins = 0;

                    for (let d = 1; d <= lastDay; d++) {
                        const checkDate = new Date(targetYear, targetMonth, d);
                        const dCol = `${d.toString().padStart(2, '0')}-${monthNames[targetMonth]}-${targetYear}`;

                        if (checkDate > today) {
                            rowStatus[dCol] = "--";
                            rowIn[dCol] = "--";
                            rowOut[dCol] = "--";
                            continue;
                        }

                        const log = logMap[dCol];
                        if (log) {
                            const dbStatus = log.Status || "Present";
                            if (dbStatus.includes("Present")) { rowStatus[dCol] = "P"; rowStatus["P"]++; }
                            else if (dbStatus.includes("Late")) { rowStatus[dCol] = "L"; rowStatus["L"]++; rowStatus["P"]++; }
                            else if (dbStatus.includes("Half")) { rowStatus[dCol] = "H"; rowStatus["Half"]++; rowStatus["P"] += 0.5; }
                            else if (dbStatus.includes("Weekly Off")) { rowStatus[dCol] = "WO"; rowStatus["WO"]++; }
                            else { rowStatus[dCol] = "P"; rowStatus["P"]++; }

                            rowIn[dCol] = log.PunchIn || "";
                            rowOut[dCol] = log.PunchOut || "";

                            if (log.WorkingHours && log.WorkingHours.includes(":")) {
                                const pts = log.WorkingHours.split(':');
                                totalWorkMins += (parseInt(pts[0]) || 0) * 60 + (parseInt(pts[1]) || 0);
                            }
                        } else {
                            if (holidayDates.includes(dCol)) {
                                rowStatus[dCol] = "HL";
                            } else {
                                rowStatus[dCol] = "A";
                                rowStatus["A"]++;
                            }
                            rowIn[dCol] = "";
                            rowOut[dCol] = "";
                        }
                    }

                    rowStatus["Total Hrs"] = `${Math.floor(totalWorkMins / 60).toString().padStart(2, '0')}:${(totalWorkMins % 60).toString().padStart(2, '0')}`;

                    data.push(rowStatus);
                    data.push(rowIn);
                    data.push(rowOut);
                });

                return { status: "Success", headers: headers, data: data };
            }

            // Fallback
            return { status: "Success", headers: ["Info"], data: [{ "Info": "No data found for requested query." }] };
        }

        // Fallback
        return { status: "Error", message: `Unhandled action identifier: ${action}` };
    }
};
