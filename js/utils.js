/**
 * EAMS - Shared Client Utilities & Math Engine
 */

const Utils = {
    // Calculates geodesic distance between two GPS coordinates in meters (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const earthRadius = 6371e3; // meters
        const radLat1 = (lat1 * Math.PI) / 180;
        const radLat2 = (lat2 * Math.PI) / 180;
        const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(radLat1) * Math.cos(radLat2) *
                  Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    },

    // Hashes string securely with SHA-256 using standard Web Crypto API
    async sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    // Compress base64 image using canvas to minimize network size
    compressSelfie(base64Str, maxWidth = 320, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                // Scale maintaining aspect ratio
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                // Flip image horizontally on canvas to match mirror preview
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, width, height);

                // Export as compressed JPEG
                const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
                resolve(compressedBase64);
            };
            img.onerror = (err) => reject(err);
        });
    },

    // Date formatting (returns e.g., "09-Jul-2026")
    formatDate(date) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    },

    // Time formatting (returns e.g., "18:15:30")
    formatTime(date) {
        const d = new Date(date);
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        return `${hours}:${mins}:${secs}`;
    },

    // Convert CSV array to file download
    exportToCSV(headers, dataRows, filename = "Report.csv") {
        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Escape and join headers
        csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
        
        // Add data rows
        dataRows.forEach(row => {
            const line = headers.map(h => {
                const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : "";
                return `"${val.replace(/"/g, '""')}"`;
            }).join(",");
            csvContent += line + "\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // Triggers standard print screen for table elements
    printReport(title, tableId) {
        const printContent = document.getElementById(tableId).outerHTML;
        const originalContent = document.body.innerHTML;
        
        document.body.innerHTML = `
            <div style="padding: 30px; font-family: sans-serif;">
                <h2 style="text-align: center; color: #E4002B; margin-bottom: 5px;">EAMS Attendance System</h2>
                <h4 style="text-align: center; margin-top: 0; color: #555;">${title}</h4>
                <div style="margin-top: 20px;">${printContent}</div>
                <div style="margin-top: 30px; font-size: 0.8rem; text-align: center; color: #888;">
                    Report Generated On: ${this.formatDate(new Date())} at ${this.formatTime(new Date())}
                </div>
            </div>
        `;
        
        window.print();
        document.body.innerHTML = originalContent;
        // Reload location to restore JS bindings
        window.location.reload();
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
    }
};
