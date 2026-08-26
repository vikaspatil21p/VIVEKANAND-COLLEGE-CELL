const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ===============================
// MYSQL DATABASE CONNECTION
// ===============================

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "college_placement",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ===============================
// TEST / HEALTH API
// ===============================

app.get("/api/health", async (req, res) => {
    try {
        const connection = await pool.getConnection();
        connection.release();

        res.json({
            status: "ok",
            message: "VIVEKANAND COLLEGE PLACEMENT CELL backend is running",
            database: "connected"
        });

    } catch (error) {
        console.error("Database connection error:", error.message);

        res.status(500).json({
            status: "error",
            message: "Backend is running but database connection failed"
        });
    }
});

// ===============================
// GENERATE STUDENT ID
// ===============================

async function generateStudentId() {
    const [rows] = await pool.query(
        `SELECT studentId
         FROM students
         WHERE studentId LIKE 'STU%'
         ORDER BY id DESC
         LIMIT 1`
    );

    let nextNumber = 1;

    if (rows.length > 0 && rows[0].studentId) {
        const lastStudentId = rows[0].studentId;

        const match = lastStudentId.match(/^STU(\d+)$/);

        if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
        }
    }

    let newStudentId = `STU${String(nextNumber).padStart(3, "0")}`;

    // Extra safety check
    while (true) {
        const [existing] = await pool.query(
            "SELECT id FROM students WHERE studentId = ?",
            [newStudentId]
        );

        if (existing.length === 0) {
            break;
        }

        nextNumber++;
        newStudentId = `STU${String(nextNumber).padStart(3, "0")}`;
    }

    return newStudentId;
}

// ===============================
// STUDENT REGISTRATION API
// ===============================

app.post("/api/auth/student-register", async (req, res) => {
    try {
        const {
            fullName,
            email,
            username,
            password,
            mobile,
            gender,
            dob,
            address,
            city,
            state,
            department,
            course,
            academicYear,
            admissionYear,
            graduationYear,
            tenthPercentage,
            twelfthPercentage,
            cgpa,
            skills,
            resumeUrl,
            profilePhoto
        } = req.body;

        // ===============================
        // VALIDATE REQUIRED FIELDS
        // ===============================

        if (!fullName || !email || !username || !password) {
            return res.status(400).json({
                status: "error",
                message: "Full name, email, username and password are required"
            });
        }

        // ===============================
        // VALIDATE PASSWORD
        // ===============================

        if (password.length < 6) {
            return res.status(400).json({
                status: "error",
                message: "Password must be at least 6 characters long"
            });
        }

        // ===============================
        // VALIDATE MOBILE
        // ===============================

        if (mobile && !/^[0-9]{10}$/.test(String(mobile))) {
            return res.status(400).json({
                status: "error",
                message: "Please enter a valid 10-digit mobile number"
            });
        }

        // ===============================
        // VALIDATE CGPA
        // ===============================

        if (cgpa !== undefined && cgpa !== null && cgpa !== "") {
            const cgpaNumber = Number(cgpa);

            if (
                isNaN(cgpaNumber) ||
                cgpaNumber < 0 ||
                cgpaNumber > 10
            ) {
                return res.status(400).json({
                    status: "error",
                    message: "CGPA must be between 0 and 10"
                });
            }
        }

        // ===============================
        // CHECK DUPLICATE EMAIL / USERNAME
        // ===============================

        const [existingStudents] = await pool.query(
            `SELECT id, studentId, email, username
             FROM students
             WHERE email = ? OR username = ?`,
            [email, username]
        );

        if (existingStudents.length > 0) {
            const existing = existingStudents[0];

            if (existing.email === email) {
                return res.status(409).json({
                    status: "error",
                    message: "Email already exists"
                });
            }

            if (existing.username === username) {
                return res.status(409).json({
                    status: "error",
                    message: "Username already exists"
                });
            }
        }

        // ===============================
        // GENERATE STUDENT ID AUTOMATICALLY
        // ===============================

        const studentId = await generateStudentId();

        // ===============================
        // HASH PASSWORD
        // ===============================

        const passwordHash = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex");

        // ===============================
        // CONVERT SKILLS TO JSON
        // ===============================

        const skillsValue = Array.isArray(skills)
            ? JSON.stringify(skills)
            : skills || null;

        // ===============================
        // INSERT STUDENT
        // ===============================

        const [result] = await pool.query(
            `INSERT INTO students (
                studentId,
                fullName,
                email,
                username,
                passwordHash,
                mobile,
                gender,
                dob,
                address,
                city,
                state,
                department,
                course,
                academicYear,
                admissionYear,
                graduationYear,
                tenthPercentage,
                twelfthPercentage,
                cgpa,
                skills,
                resumeUrl,
                profilePhoto
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                studentId,
                fullName,
                email,
                username,
                passwordHash,
                mobile || null,
                gender || null,
                dob || null,
                address || null,
                city || null,
                state || null,
                department || null,
                course || null,
                academicYear || null,
                admissionYear || null,
                graduationYear || null,
                tenthPercentage || null,
                twelfthPercentage || null,
                cgpa || null,
                skillsValue,
                resumeUrl || null,
                profilePhoto || null
            ]
        );

        // ===============================
        // GET NEW STUDENT
        // ===============================

        const [newStudentRows] = await pool.query(
            `SELECT
                id,
                studentId,
                fullName,
                email,
                username,
                mobile,
                gender,
                dob,
                address,
                city,
                state,
                department,
                course,
                academicYear,
                admissionYear,
                graduationYear,
                tenthPercentage,
                twelfthPercentage,
                cgpa,
                skills,
                resumeUrl,
                profilePhoto,
                placementStatus,
                placedCompany,
                packageOffered,
                createdAt,
                updatedAt
             FROM students
             WHERE id = ?`,
            [result.insertId]
        );

        // ===============================
        // SUCCESS RESPONSE
        // ===============================

        res.status(201).json({
            status: "success",
            message: "Student registered successfully",
            user: {
                id: result.insertId,
                studentId,
                fullName,
                email,
                username
            },
            student: newStudentRows[0]
        });

    } catch (error) {
        console.error(
            "Student registration error:",
            error.message
        );

        res.status(500).json({
            status: "error",
            message: "Student registration failed",
            error: error.message
        });
    }
});

// ===============================
// GET ALL STUDENTS
// ===============================

app.get("/api/students", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM students ORDER BY id DESC"
        );

        res.json(rows);

    } catch (error) {
        console.error(
            "Error fetching students:",
            error.message
        );

        res.status(500).json({
            status: "error",
            message: "Failed to fetch students",
            error: error.message
        });
    }
});

// ===============================
// GET STUDENT BY ID
// ===============================

app.get("/api/students/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM students WHERE id = ?",
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Student not found"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error(
            "Error fetching student:",
            error.message
        );

        res.status(500).json({
            status: "error",
            message: "Failed to fetch student",
            error: error.message
        });
    }
});

// ===============================
// DELETE STUDENT
// ===============================

app.delete("/api/students/:id", async (req, res) => {
    try {
        const [result] = await pool.query(
            "DELETE FROM students WHERE id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "Student not found"
            });
        }

        res.json({
            status: "success",
            message: "Student deleted successfully"
        });

    } catch (error) {
        console.error(
            "Error deleting student:",
            error.message
        );

        res.status(500).json({
            status: "error",
            message: "Failed to delete student",
            error: error.message
        });
    }
});

// ===============================
// UPDATE STUDENT
// ===============================

app.put("/api/students/:id", async (req, res) => {
    try {
        const id = req.params.id;

        const {
            studentId: newStudentId,
            fullName,
            email,
            username,
            mobile,
            gender,
            dob,
            address,
            city,
            state,
            department,
            course,
            academicYear,
            admissionYear,
            graduationYear,
            tenthPercentage,
            twelfthPercentage,
            cgpa,
            skills,
            resumeUrl,
            profilePhoto,
            placementStatus,
            placedCompany,
            packageOffered
        } = req.body;

        // ===============================
        // CHECK STUDENT EXISTS
        // ===============================

        const [existingRows] = await pool.query(
            "SELECT id, studentId FROM students WHERE id = ?",
            [id]
        );

        if (existingRows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Student not found"
            });
        }

        // ===============================
        // KEEP EXISTING STUDENT ID
        // ===============================

        const finalStudentId =
            newStudentId ||
            existingRows[0].studentId;

        // ===============================
        // CONVERT SKILLS
        // ===============================

        const skillsValue = Array.isArray(skills)
            ? JSON.stringify(skills)
            : skills || null;

        // ===============================
        // UPDATE STUDENT
        // ===============================

        await pool.query(
            `UPDATE students SET
                studentId = ?,
                fullName = ?,
                email = ?,
                username = ?,
                mobile = ?,
                gender = ?,
                dob = ?,
                address = ?,
                city = ?,
                state = ?,
                department = ?,
                course = ?,
                academicYear = ?,
                admissionYear = ?,
                graduationYear = ?,
                tenthPercentage = ?,
                twelfthPercentage = ?,
                cgpa = ?,
                skills = ?,
                resumeUrl = ?,
                profilePhoto = ?,
                placementStatus = ?,
                placedCompany = ?,
                packageOffered = ?
             WHERE id = ?`,
            [
                finalStudentId,
                fullName,
                email,
                username,
                mobile || null,
                gender || null,
                dob || null,
                address || null,
                city || null,
                state || null,
                department || null,
                course || null,
                academicYear || null,
                admissionYear || null,
                graduationYear || null,
                tenthPercentage || null,
                twelfthPercentage || null,
                cgpa || null,
                skillsValue,
                resumeUrl || null,
                profilePhoto || null,
                placementStatus || "Not Placed",
                placedCompany || null,
                packageOffered || null,
                id
            ]
        );

        // ===============================
        // GET UPDATED STUDENT
        // ===============================

        const [updatedRows] = await pool.query(
            "SELECT * FROM students WHERE id = ?",
            [id]
        );

        res.json({
            status: "success",
            message: "Student updated successfully",
            student: updatedRows[0]
        });

    } catch (error) {
        console.error(
            "Error updating student:",
            error.message
        );

        res.status(500).json({
            status: "error",
            message: "Failed to update student",
            error: error.message
        });
    }
});

// ===============================
// STUDENT / ADMIN LOGIN API
// ===============================

app.post("/api/auth/login", async (req, res) => {
    try {
        const {
            username,
            password,
            role
        } = req.body;

        // Basic validation
        if (!username || !password || !role) {
            return res.status(400).json({
                status: "error",
                message: "Username, password and role are required"
            });
        }

        // Hash entered password using same SHA-256
        // method used during registration
        const passwordHash = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex");

        // ===============================
        // STUDENT LOGIN
        // ===============================

        if (role === "student") {

            const [students] = await pool.query(
                `SELECT *
                 FROM students
                 WHERE username = ?
                 LIMIT 1`,
                [username]
            );

            if (students.length === 0) {
                return res.status(401).json({
                    status: "error",
                    message: "Invalid username or password"
                });
            }

            const student = students[0];

            // Compare password hash
            if (student.passwordHash !== passwordHash) {
                return res.status(401).json({
                    status: "error",
                    message: "Invalid username or password"
                });
            }

            // Do not send passwordHash to frontend
            delete student.passwordHash;

            return res.json({
                status: "success",
                message: "Student login successful",
                user: {
                    id: student.id,
                    studentId: student.studentId,
                    fullName: student.fullName,
                    email: student.email,
                    username: student.username,
                    role: "student"
                },
                student: student
            });
        }

        // ===============================
        // ADMIN LOGIN
        // ===============================

        if (role === "admin") {

            return res.status(401).json({
                status: "error",
                message: "Admin login is not available yet"
            });
        }

        // Invalid role
        return res.status(400).json({
            status: "error",
            message: "Invalid role"
        });

    } catch (error) {

        console.error(
            "Login error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message: "Login failed",
            error: error.message
        });
    }
});
// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
    console.log(
        `Backend server running on http://localhost:${PORT}`
    );
});