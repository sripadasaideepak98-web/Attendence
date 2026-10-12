/* =========================================
   AttendAI - Attendance Management System
   JavaScript + Firebase Firestore
========================================= */

import { initializeApp } from
    "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    setDoc,
    getDoc
} from
    "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";


/* =========================================
   1. FIREBASE CONFIGURATION
========================================= */

// Replace these placeholder values with your Firebase project settings.
// If you leave them unchanged, the app will use browser storage.

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let db = null;
let firebaseEnabled = false;

try {
    const configIsValid =
        firebaseConfig.apiKey !== "YOUR_API_KEY" &&
        firebaseConfig.projectId !== "YOUR_PROJECT_ID" &&
        firebaseConfig.appId !== "YOUR_APP_ID";

    if (configIsValid) {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        firebaseEnabled = true;
        console.log("Firebase initialized.");
    } else {
        console.log("Firebase not configured. Using browser storage.");
    }
} catch (error) {
    console.error("Firebase initialization failed:", error);
}


/* =========================================
   2. APPLICATION STATE
========================================= */

let students = [];
let attendanceRecords = {};

const STUDENTS_STORAGE_KEY = "attendai_students";
const ATTENDANCE_STORAGE_KEY = "attendai_attendance";

const $ = (id) => document.getElementById(id);


/* =========================================
   3. DATE HELPERS
========================================= */

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/* =========================================
   4. SAFE HTML HELPERS
========================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
}


/* =========================================
   5. BROWSER STORAGE
========================================= */

function readBrowserData(key, fallback) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
        console.error("Could not read browser storage:", error);
        return fallback;
    }
}

function writeBrowserData(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error("Could not save browser data:", error);
        alert("Unable to save data in this browser.");
    }
}


/* =========================================
   6. FIREBASE / LOCAL DATA ACCESS
========================================= */

async function loadStudents() {
    if (!firebaseEnabled) {
        students = readBrowserData(STUDENTS_STORAGE_KEY, []);
        return;
    }

    const snapshot = await getDocs(collection(db, "students"));

    students = snapshot.docs.map((document) => ({
        ...document.data(),
        id: document.id
    }));
}

async function saveStudent(student) {
    if (!firebaseEnabled) {
        students.push(student);
        writeBrowserData(STUDENTS_STORAGE_KEY, students);
        return student;
    }

    const studentData = {
        studentId: student.studentId,
        name: student.name,
        department: student.department,
        year: student.year,
        createdAt: new Date().toISOString()
    };

    const documentRef = await addDoc(
        collection(db, "students"),
        studentData
    );

    const savedStudent = {
        ...studentData,
        id: documentRef.id
    };

    students.push(savedStudent);

    return savedStudent;
}

async function removeStudent(studentDocumentId) {
    if (firebaseEnabled) {
        await deleteDoc(doc(db, "students", studentDocumentId));
        students = students.filter(
            (student) => student.id !== studentDocumentId
        );
    } else {
        students = students.filter(
            (student) => student.id !== studentDocumentId
        );

        writeBrowserData(STUDENTS_STORAGE_KEY, students);
    }

    // Remove the student's attendance records.
    for (const date of Object.keys(attendanceRecords)) {
        delete attendanceRecords[date][studentDocumentId];

        if (firebaseEnabled) {
            // Persist the updated date record.
            await setDoc(
                doc(db, "attendance", date),
                attendanceRecords[date]
            );
        }
    }

    if (!firebaseEnabled) {
        writeBrowserData(ATTENDANCE_STORAGE_KEY, attendanceRecords);
    }
}

async function loadAttendanceRecords() {
    if (!firebaseEnabled) {
        attendanceRecords = readBrowserData(
            ATTENDANCE_STORAGE_KEY,
            {}
        );

        return;
    }

    const snapshot = await getDocs(collection(db, "attendance"));

    attendanceRecords = {};

    snapshot.docs.forEach((document) => {
        attendanceRecords[document.id] = document.data();
    });
}

async function saveAttendanceForDate(date, records) {
    if (firebaseEnabled) {
        await setDoc(doc(db, "attendance", date), records);
    } else {
        attendanceRecords[date] = records;

        writeBrowserData(
            ATTENDANCE_STORAGE_KEY,
            attendanceRecords
        );
    }

    attendanceRecords[date] = records;
}


/* =========================================
   7. SIDEBAR NAVIGATION
========================================= */

function showPage(pageId) {
    const requestedPage = $(pageId);

    if (!requestedPage || !requestedPage.classList.contains("page-section")) {
        return;
    }

    document.querySelectorAll(".page-section").forEach((section) => {
        section.classList.toggle("active", section.id === pageId);
    });

    document.querySelectorAll(".nav-link").forEach((button) => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageId
        );
    });

    const pageTitles = {
        dashboard: "Dashboard",
        students: "Students",
        attendance: "Attendance",
        reports: "Reports"
    };

    $("pageTitle").textContent = pageTitles[pageId] || "AttendAI";

    if (pageId === "attendance") {
        renderAttendanceList();
    }

    if (pageId === "reports") {
        renderReports();
    }
}

document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
        showPage(button.dataset.go);
    });
});


/* =========================================
   8. STUDENT MANAGEMENT
========================================= */

async function handleAddStudent(event) {
    event.preventDefault();

    const studentId = $("student-id").value.trim();
    const name = $("student-name").value.trim();
    const department = $("department").value;
    const year = $("year").value;

    if (!studentId || !name || !department || !year) {
        alert("Please complete all student fields.");
        return;
    }

    const duplicate = students.some((student) => {
        return student.studentId.toLowerCase() === studentId.toLowerCase();
    });

    if (duplicate) {
        alert("A student with this Student ID already exists.");
        return;
    }

    const submitButton = $("student-form").querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;
    submitButton.textContent = "Adding...";

    try {
        await saveStudent({
            id: studentId,
            studentId,
            name,
            department,
            year
        });

        $("student-form").reset();

        renderStudents();
        renderDashboard();
        renderAttendanceList();
        renderReports();

        alert("Student added successfully!");
    } catch (error) {
        console.error("Error adding student:", error);
        alert("Could not add the student. Check your Firebase configuration and Firestore rules.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "+ Add Student";
    }
}

$("student-form").addEventListener("submit", handleAddStudent);


async function handleDeleteStudent(documentId) {
    const student = students.find((item) => item.id === documentId);

    if (!student) {
        alert("Student not found.");
        return;
    }

    const confirmed = confirm(
        `Delete ${student.name} (${student.studentId})?`
    );

    if (!confirmed) {
        return;
    }

    try {
        await removeStudent(documentId);

        renderStudents();
        renderDashboard();
        renderAttendanceList();
        renderReports();

        alert("Student deleted successfully.");
    } catch (error) {
        console.error("Error deleting student:", error);
        alert("Could not delete the student. Please check your database settings.");
    }
}


/* =========================================
   9. RENDER STUDENT TABLE
========================================= */

function renderStudents() {
    const tableBody = $("studentsTableBody");
    const recentBody = $("recentStudentsBody");

    if (students.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-message">
                    No students registered yet.
                </td>
            </tr>
        `;

        recentBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-message">
                    No students registered yet.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML = students.map((student) => `
        <tr>
            <td>${escapeHTML(student.studentId)}</td>
            <td>${escapeHTML(student.name)}</td>
            <td>${escapeHTML(student.department)}</td>
            <td>${escapeHTML(student.year)}</td>
            <td>
                <button
                    type="button"
                    class="danger-button"
                    data-delete-student="${escapeHTML(student.id)}"
                >
                    Delete
                </button>
            </td>
        </tr>
    `).join("");

    const recentStudents = [...students].slice(-5).reverse();

    recentBody.innerHTML = recentStudents.map((student) => `
        <tr>
            <td>${escapeHTML(student.studentId)}</td>
            <td>${escapeHTML(student.name)}</td>
            <td>${escapeHTML(student.department)}</td>
            <td>${escapeHTML(student.year)}</td>
        </tr>
    `).join("");
}

$("studentsTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-student]");

    if (button) {
        handleDeleteStudent(button.dataset.deleteStudent);
    }
});


/* =========================================
   10. DASHBOARD STATISTICS
========================================= */

function renderDashboard() {
    const today = getLocalDateString();
    const todaysRecords = attendanceRecords[today] || {};

    let present = 0;
    let absent = 0;

    students.forEach((student) => {
        const status = todaysRecords[student.id];

        if (status === "Present") {
            present++;
        } else if (status === "Absent") {
            absent++;
        }
    });

    const markedCount = present + absent;
    const rate = markedCount > 0
        ? Math.round((present / markedCount) * 100)
        : 0;

    $("totalStudents").textContent = students.length;
    $("presentToday").textContent = present;
    $("absentToday").textContent = absent;
    $("attendanceRate").textContent = `${rate}%`;
}


/* =========================================
   11. ATTENDANCE MANAGEMENT
========================================= */

function renderAttendanceList() {
    const tableBody = $("attendanceList");
    const selectedDate = $("attendanceDate").value || getLocalDateString();
    const todaysRecords = attendanceRecords[selectedDate] || {};

    if (students.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-message">
                    No students available. Add students first.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML = students.map((student) => {
        const status = todaysRecords[student.id] || "Unmarked";

        return `
            <tr>
                <td>${escapeHTML(student.studentId)}</td>
                <td>${escapeHTML(student.name)}</td>
                <td>${escapeHTML(student.department)}</td>
                <td>
                    <select
                        class="status-select ${status.toLowerCase()}"
                        data-attendance-student="${escapeHTML(student.id)}"
                        aria-label="Attendance status for ${escapeHTML(student.name)}"
                    >
                        <option value="Unmarked" ${status === "Unmarked" ? "selected" : ""}>
                            Unmarked
                        </option>

                        <option value="Present" ${status === "Present" ? "selected" : ""}>
                            Present
                        </option>

                        <option value="Absent" ${status === "Absent" ? "selected" : ""}>
                            Absent
                        </option>
                    </select>
                </td>
            </tr>
        `;
    }).join("");
}

$("attendanceDate").value = getLocalDateString();

$("attendanceDate").addEventListener("change", () => {
    renderAttendanceList();
});

$("loadAttendanceBtn").addEventListener("click", () => {
    renderAttendanceList();
});


$("attendanceList").addEventListener("change", (event) => {
    const select = event.target.closest("[data-attendance-student]");

    if (!select) {
        return;
    }

    select.classList.remove("present", "absent");

    if (select.value === "Present") {
        select.classList.add("present");
    }

    if (select.value === "Absent") {
        select.classList.add("absent");
    }
});


$("saveAttendanceBtn").addEventListener("click", async () => {
    const selectedDate = $("attendanceDate").value;

    if (!selectedDate) {
        showAttendanceMessage("Please select an attendance date.", "error");
        return;
    }

    if (students.length === 0) {
        showAttendanceMessage("Please add students first.", "error");
        return;
    }

    const records = {};

    const selects = document.querySelectorAll(
        "#attendanceList [data-attendance-student]"
    );

    for (const select of selects) {
        if (select.value === "Unmarked") {
            showAttendanceMessage(
                "Please mark every student Present or Absent before saving.",
                "error"
            );

            return;
        }

        records[select.dataset.attendanceStudent] = select.value;
    }

    const button = $("saveAttendanceBtn");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        await saveAttendanceForDate(selectedDate, records);

        showAttendanceMessage(
            "Attendance saved successfully!",
            "success"
        );

        renderDashboard();
        renderReports();
    } catch (error) {
        console.error("Error saving attendance:", error);

        showAttendanceMessage(
            "Could not save attendance. Check Firebase settings and Firestore rules.",
            "error"
        );
    } finally {
        button.disabled = false;
        button.textContent = "Save Attendance";
    }
});


function showAttendanceMessage(message, type) {
    const messageElement = $("attendanceMessage");

    messageElement.textContent = message;
    messageElement.className = `message ${type}`;
}


/* =========================================
   12. ATTENDANCE REPORTS
========================================= */

$("reportDate").value = getLocalDateString();

$("reportDate").addEventListener("change", () => {
    renderReports();
});

$("generateReportBtn").addEventListener("click", () => {
    renderReports();
});


function renderReports() {
    const tableBody = $("reportsTableBody");
    const selectedDate = $("reportDate").value || getLocalDateString();

    if (students.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-message">
                    No students available to report.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML = students.map((student) => {
        let presentDays = 0;
        let absentDays = 0;

        Object.values(attendanceRecords).forEach((dayRecords) => {
            if (dayRecords[student.id] === "Present") {
                presentDays++;
            } else if (dayRecords[student.id] === "Absent") {
                absentDays++;
            }
        });

        const totalMarkedDays = presentDays + absentDays;

        const rate = totalMarkedDays > 0
            ? Math.round((presentDays / totalMarkedDays) * 100)
            : 0;

        const selectedDayStatus =
            attendanceRecords[selectedDate]?.[student.id] || "Unmarked";

        return `
            <tr>
                <td>${escapeHTML(student.studentId)}</td>
                <td>${escapeHTML(student.name)}</td>
                <td>${escapeHTML(student.department)}</td>
                <td>${presentDays}</td>
                <td>${absentDays}</td>
                <td>
                    <strong>${rate}%</strong>
                    <br>
                    <small>${escapeHTML(selectedDayStatus)} on selected date</small>
                </td>
            </tr>
        `;
    }).join("");
}


/* =========================================
   13. INITIALIZE APPLICATION
========================================= */

async function initializeApplication() {
    try {
        if (!firebaseEnabled) {
            students = readBrowserData(STUDENTS_STORAGE_KEY, []);

            attendanceRecords = readBrowserData(
                ATTENDANCE_STORAGE_KEY,
                {}
            );
        } else {
            await loadStudents();
            await loadAttendanceRecords();
        }

        renderStudents();
        renderDashboard();
        renderAttendanceList();
        renderReports();

        console.log("AttendAI initialized successfully.");
    } catch (error) {
        console.error("Failed to initialize AttendAI:", error);

        alert(
            "Unable to load AttendAI data. Check your Firebase configuration and Firestore security rules."
        );
    }
}

initializeApplication();