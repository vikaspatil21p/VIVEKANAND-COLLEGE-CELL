const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

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

async function ensureStudentTableSchema() {
    try {
        const [columns] = await pool.query("SHOW COLUMNS FROM students");
        const fields = new Set(columns.map((column) => column.Field));

        if (!fields.has("id") && fields.has("student_id")) {
            await pool.query(
                "ALTER TABLE students CHANGE student_id id INT NOT NULL AUTO_INCREMENT"
            );
        }

        const addColumns = [
            ["studentId", "VARCHAR(50) NOT NULL DEFAULT '' AFTER id"],
            ["gender", "VARCHAR(20) DEFAULT NULL"],
            ["dob", "DATE DEFAULT NULL"],
            ["address", "VARCHAR(255) DEFAULT NULL"],
            ["city", "VARCHAR(100) DEFAULT NULL"],
            ["state", "VARCHAR(100) DEFAULT NULL"],
            ["academicYear", "VARCHAR(20) DEFAULT NULL"],
            ["admissionYear", "VARCHAR(10) DEFAULT NULL"],
            ["graduationYear", "VARCHAR(10) DEFAULT NULL"],
            ["tenthPercentage", "DECIMAL(5,2) DEFAULT NULL"],
            ["twelfthPercentage", "DECIMAL(5,2) DEFAULT NULL"],
            ["cgpa", "DECIMAL(4,2) DEFAULT NULL"],
            ["skills", "TEXT DEFAULT NULL"],
            ["resumeUrl", "VARCHAR(500) DEFAULT NULL"],
            ["profilePhoto", "VARCHAR(500) DEFAULT NULL"],
            ["placementStatus", "VARCHAR(50) DEFAULT 'Not Placed'"],
            ["placedCompany", "VARCHAR(150) DEFAULT NULL"],
            ["packageOffered", "DECIMAL(10,2) DEFAULT NULL"],
            ["createdAt", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"],
            ["updatedAt", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"]
        ];

        for (const [columnName, definition] of addColumns) {
            if (!fields.has(columnName)) {
                await pool.query(
                    `ALTER TABLE students ADD COLUMN ${columnName} ${definition}`
                );
            }
        }

        if (!fields.has("studentId")) {
            await pool.query(
                "UPDATE students SET studentId = CONCAT('STU', LPAD(CAST(id AS CHAR), 3, '0')) WHERE studentId = '' OR studentId IS NULL"
            );
        }

        const [indexes] = await pool.query("SHOW INDEX FROM students");
        const hasStudentIdIndex = indexes.some((index) => index.Key_name === "studentId");
        if (!hasStudentIdIndex) {
            await pool.query("ALTER TABLE students ADD UNIQUE KEY studentId (studentId)");
        }

        console.log("✅ Student table schema verified for registration flow");
    } catch (error) {
        console.error("Student table schema check failed:", error.message);
    }
}

ensureStudentTableSchema();

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
// STUDENT REGISTRATION API
// ===============================

app.post("/api/auth/student-register", async (req, res) => {
    try {
        const {
            studentId,
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

        // Validate required fields
        if (!studentId || !fullName || !email || !username || !password) {
            return res.status(400).json({
                status: "error",
                message: "Student ID, full name, email, username and password are required"
            });
        }

        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({
                status: "error",
                message: "Password must be at least 6 characters long"
            });
        }

        // Validate CGPA
        if (cgpa !== undefined && cgpa !== null && cgpa !== "") {
            const cgpaNumber = Number(cgpa);

            if (isNaN(cgpaNumber) || cgpaNumber < 0 || cgpaNumber > 10) {
                return res.status(400).json({
                    status: "error",
                    message: "CGPA must be between 0 and 10"
                });
            }
        }

        // Check duplicate student ID, email or username
        const [existingStudents] = await pool.query(
            `SELECT id, studentId, email, username
             FROM students
             WHERE studentId = ? OR email = ? OR username = ?`,
            [studentId, email, username]
        );

        if (existingStudents.length > 0) {
            const existing = existingStudents[0];

            if (existing.studentId === studentId) {
                return res.status(409).json({
                    status: "error",
                    message: "Student ID already exists"
                });
            }

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

        // Hash password
        const passwordHash = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex");

        // Convert skills array to JSON string
        const skillsValue = Array.isArray(skills)
            ? JSON.stringify(skills)
            : skills || null;

        // Insert student into database
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

        // Get newly registered student
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
        console.error("Student registration error:", error.message);

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
        console.error("Error fetching students:", error.message);

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
        console.error("Error deleting student:", error.message);

        res.status(500).json({
            status: "error",
            message: "Failed to delete student",
            error: error.message
        });
    }
});

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
        console.error("Error fetching student:", error.message);

        res.status(500).json({
            status: "error",
            message: "Failed to fetch student",
            error: error.message
        });
    }
});

// ===============================
// UPDATE STUDENT
// ===============================

app.put("/api/students/:id", async (req, res) => {
    try {
        const studentId = req.params.id;

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

        // Check if student exists
        const [existingRows] = await pool.query(
            "SELECT id FROM students WHERE id = ?",
            [studentId]
        );

        if (existingRows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Student not found"
            });
        }

        // Convert skills array to JSON string
        const skillsValue = Array.isArray(skills)
            ? JSON.stringify(skills)
            : skills || null;

        // Update student
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
                newStudentId,
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
                studentId
            ]
        );

        // Get updated student
        const [updatedRows] = await pool.query(
            "SELECT * FROM students WHERE id = ?",
            [studentId]
        );

        res.json({
            status: "success",
            message: "Student updated successfully",
            student: updatedRows[0]
        });

    } catch (error) {
        console.error("Error updating student:", error.message);

        res.status(500).json({
            status: "error",
            message: "Failed to update student",
            error: error.message
        });
    }
});
// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});