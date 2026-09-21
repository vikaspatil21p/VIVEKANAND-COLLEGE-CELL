const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const app = express();

const PORT = 5000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "Home")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "Home", "index.html"));
});

ensureStudentTableSchema();

// =====================================================
// MYSQL DATABASE CONNECTION
// =====================================================

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

// =====================================================
// HEALTH API
// =====================================================

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

// =====================================================
// GENERATE STUDENT ID
// =====================================================

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

        const match =
            rows[0].studentId.match(/^STU(\d+)$/);

        if (match) {
            nextNumber =
                parseInt(match[1], 10) + 1;
        }
    }

    let newStudentId =
        `STU${String(nextNumber).padStart(3, "0")}`;

    while (true) {

        const [existing] = await pool.query(
            "SELECT id FROM students WHERE studentId = ?",
            [newStudentId]
        );

        if (existing.length === 0) {
            break;
        }

        nextNumber++;

        newStudentId =
            `STU${String(nextNumber).padStart(3, "0")}`;
    }

    return newStudentId;
}

// =====================================================
// STUDENT REGISTRATION
// =====================================================

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

        if (!fullName || !email || !username || !password) {

            return res.status(400).json({
                status: "error",
                message:
                    "Full name, email, username and password are required"
            });
        }

        if (password.length < 6) {

            return res.status(400).json({
                status: "error",
                message:
                    "Password must be at least 6 characters long"
            });
        }

        if (
            mobile &&
            !/^[0-9]{10}$/.test(String(mobile))
        ) {

            return res.status(400).json({
                status: "error",
                message:
                    "Please enter a valid 10-digit mobile number"
            });
        }

        if (
            cgpa !== undefined &&
            cgpa !== null &&
            cgpa !== ""
        ) {

            const cgpaNumber = Number(cgpa);

            if (
                isNaN(cgpaNumber) ||
                cgpaNumber < 0 ||
                cgpaNumber > 10
            ) {

                return res.status(400).json({
                    status: "error",
                    message:
                        "CGPA must be between 0 and 10"
                });
            }
        }

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

        const studentId =
            await generateStudentId();

        const passwordHash =
            crypto
                .createHash("sha256")
                .update(password)
                .digest("hex");

        const skillsValue =
            Array.isArray(skills)
                ? JSON.stringify(skills)
                : skills || null;

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

        const [newStudentRows] =
            await pool.query(
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

            message:
                "Student registered successfully",

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

// =====================================================
// GET ALL STUDENTS
// =====================================================

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

// =====================================================
// GET STUDENT BY ID
// =====================================================

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

// =====================================================
// DELETE STUDENT
// =====================================================

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

// =====================================================
// UPDATE STUDENT
// =====================================================

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

        const [existingRows] =
            await pool.query(
                "SELECT id, studentId FROM students WHERE id = ?",
                [id]
            );

        if (existingRows.length === 0) {

            return res.status(404).json({
                status: "error",
                message: "Student not found"
            });
        }

        const finalStudentId =
            newStudentId ||
            existingRows[0].studentId;

        const skillsValue =
            Array.isArray(skills)
                ? JSON.stringify(skills)
                : skills || null;

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

        const [updatedRows] =
            await pool.query(
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

// =====================================================
// COMPANY REGISTRATION
// =====================================================

app.post("/api/auth/company-register", async (req, res) => {

    try {

        const {
            companyName,
            email,
            username,
            password,
            phone,
            website,
            industry,
            location,
            description
        } = req.body;

        if (
            !companyName ||
            !email ||
            !username ||
            !password
        ) {

            return res.status(400).json({
                status: "error",
                message:
                    "Company name, email, username and password are required"
            });
        }

        if (password.length < 6) {

            return res.status(400).json({
                status: "error",
                message:
                    "Password must be at least 6 characters"
            });
        }

        const [existingCompanies] =
            await pool.query(
                `SELECT id, companyName, email, username
                 FROM companies
                 WHERE username = ? OR email = ?`,
                [username, email]
            );

        if (existingCompanies.length > 0) {

            const existing =
                existingCompanies[0];

            if (existing.email === email) {

                return res.status(409).json({
                    status: "error",
                    message:
                        "Company email already exists"
                });
            }

            if (existing.username === username) {

                return res.status(409).json({
                    status: "error",
                    message:
                        "Company username already exists"
                });
            }
        }

        const passwordHash =
            crypto
                .createHash("sha256")
                .update(password)
                .digest("hex");

        const [result] =
            await pool.query(
                `INSERT INTO companies
                (
                    companyName,
                    email,
                    username,
                    passwordHash,
                    phone,
                    website,
                    industry,
                    location,
                    description
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyName,
                    email,
                    username,
                    passwordHash,
                    phone || null,
                    website || null,
                    industry || null,
                    location || null,
                    description || null
                ]
            );

        return res.status(201).json({

            status: "success",

            message:
                "Company registration successful",

            user: {
                id: result.insertId,
                companyName,
                email,
                username,
                role: "company"
            }

        });

    } catch (error) {

        console.error(
            "Company registration error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message:
                "Company registration failed",
            error: error.message
        });
    }
});

// =====================================================
// COMPANY LOGIN
// =====================================================

app.post("/api/auth/company-login", async (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;

        if (!username || !password) {

            return res.status(400).json({
                status: "error",
                message:
                    "Username and password are required"
            });
        }

        const [companies] =
            await pool.query(
                `SELECT *
                 FROM companies
                 WHERE username = ?
                 LIMIT 1`,
                [username]
            );

        if (companies.length === 0) {

            return res.status(401).json({
                status: "error",
                message:
                    "Invalid username or password"
            });
        }

        const company =
            companies[0];

        const passwordHash =
            crypto
                .createHash("sha256")
                .update(password)
                .digest("hex");

        if (company.passwordHash !== passwordHash) {

            return res.status(401).json({
                status: "error",
                message:
                    "Invalid username or password"
            });
        }

        delete company.passwordHash;

        return res.json({

            status: "success",

            message:
                "Company login successful",

            user: {
                id: company.id,
                companyName: company.companyName,
                email: company.email,
                username: company.username,
                role: "company"
            }

        });

    } catch (error) {

        console.error(
            "Company login error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message:
                "Company login failed"
        });
    }
});

// =====================================================
// GET ALL COMPANIES API
// =====================================================

app.get("/api/companies", async (req, res) => {
    try {

        const [companies] = await pool.query(
            `SELECT
                id,
                companyName,
                email,
                username,
                phone,
                website,
                industry,
                location,
                description,
                createdAt,
                updatedAt
             FROM companies
             ORDER BY id DESC`
        );

        return res.json({
            status: "success",
            companies: companies
        });

    } catch (error) {

        console.error(
            "Get companies error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message: "Failed to load companies",
            error: error.message
        });
    }
});
// =====================================================
// STUDENT / ADMIN LOGIN
// =====================================================

app.post("/api/auth/login", async (req, res) => {

    try {

        const {
            username,
            password,
            role
        } = req.body;

        if (!username || !password || !role) {

            return res.status(400).json({
                status: "error",
                message:
                    "Username, password and role are required"
            });
        }

        const passwordHash =
            crypto
                .createHash("sha256")
                .update(password)
                .digest("hex");

        // -------------------------------------------------
        // STUDENT
        // -------------------------------------------------

        if (role === "student") {

            const [students] =
                await pool.query(
                    `SELECT *
                     FROM students
                     WHERE username = ?
                     LIMIT 1`,
                    [username]
                );

            if (students.length === 0) {

                return res.status(401).json({
                    status: "error",
                    message:
                        "Invalid username or password"
                });
            }

            const student =
                students[0];

            if (student.passwordHash !== passwordHash) {

                return res.status(401).json({
                    status: "error",
                    message:
                        "Invalid username or password"
                });
            }

            delete student.passwordHash;

            return res.json({

                status: "success",

                message:
                    "Student login successful",

                user: {
                    id: student.id,
                    studentId: student.studentId,
                    fullName: student.fullName,
                    email: student.email,
                    username: student.username,
                    role: "student"
                },

                student

            });
        }

        // -------------------------------------------------
        // ADMIN
        // -------------------------------------------------

        if (role === "admin") {

            const [admins] =
                await pool.query(
                    `SELECT *
                     FROM admins
                     WHERE username = ?
                     LIMIT 1`,
                    [username]
                );

            if (admins.length === 0) {

                return res.status(401).json({
                    status: "error",
                    message:
                        "Invalid username or password"
                });
            }

            const admin =
                admins[0];

            if (admin.passwordHash !== passwordHash) {

                return res.status(401).json({
                    status: "error",
                    message:
                        "Invalid username or password"
                });
            }

            delete admin.passwordHash;

            return res.json({

                status: "success",

                message:
                    "Admin login successful",

                user: {
                    id: admin.id,
                    fullName: admin.fullName,
                    email: admin.email,
                    username: admin.username,
                    role: "admin"
                }

            });
        }

        return res.status(400).json({
            status: "error",
            message: "Invalid role"
        });

    } catch (error) {

        console.error(
            "Login error:",
            error.message
        );

        res.status(500).json({
            status: "error",
            message: "Login failed",
            error: error.message
        });
    }
});

// =====================================================
// COMPANY PROFILE - GET
// =====================================================

app.get("/api/companies/:id", async (req, res) => {

    try {

        const companyId =
            req.params.id;

        const [companies] =
            await pool.query(
                `SELECT
                    id,
                    companyName,
                    email,
                    username,
                    phone,
                    website,
                    industry,
                    location,
                    description,
                    createdAt,
                    updatedAt
                 FROM companies
                 WHERE id = ?
                 LIMIT 1`,
                [companyId]
            );

        if (companies.length === 0) {

            return res.status(404).json({
                status: "error",
                message: "Company not found"
            });
        }

        return res.json({

            status: "success",

            company: companies[0]

        });

    } catch (error) {

        console.error(
            "Get company profile error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message:
                "Failed to load company profile",
            error: error.message
        });
    }
});

// =====================================================
// COMPANY PROFILE - UPDATE
// =====================================================

app.put("/api/companies/:id", async (req, res) => {

    try {

        const companyId =
            req.params.id;

        const {
            companyName,
            email,
            username,
            phone,
            website,
            industry,
            location,
            description
        } = req.body;

        const [existing] =
            await pool.query(
                `SELECT id
                 FROM companies
                 WHERE id = ?
                 LIMIT 1`,
                [companyId]
            );

        if (existing.length === 0) {

            return res.status(404).json({
                status: "error",
                message: "Company not found"
            });
        }

        // Check duplicate email / username
        const [duplicates] =
            await pool.query(
                `SELECT id, email, username
                 FROM companies
                 WHERE (email = ? OR username = ?)
                 AND id != ?
                 LIMIT 1`,
                [
                    email,
                    username,
                    companyId
                ]
            );

        if (duplicates.length > 0) {

            if (duplicates[0].email === email) {

                return res.status(409).json({
                    status: "error",
                    message:
                        "Email already exists"
                });
            }

            if (duplicates[0].username === username) {

                return res.status(409).json({
                    status: "error",
                    message:
                        "Username already exists"
                });
            }
        }

        await pool.query(
            `UPDATE companies SET
                companyName = ?,
                email = ?,
                username = ?,
                phone = ?,
                website = ?,
                industry = ?,
                location = ?,
                description = ?
             WHERE id = ?`,
            [
                companyName,
                email,
                username,
                phone || null,
                website || null,
                industry || null,
                location || null,
                description || null,
                companyId
            ]
        );

        const [updated] =
            await pool.query(
                `SELECT
                    id,
                    companyName,
                    email,
                    username,
                    phone,
                    website,
                    industry,
                    location,
                    description,
                    createdAt,
                    updatedAt
                 FROM companies
                 WHERE id = ?`,
                [companyId]
            );

        return res.json({

            status: "success",

            message:
                "Company profile updated successfully",

            company: updated[0]

        });

    } catch (error) {

        console.error(
            "Update company profile error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message:
                "Failed to update company profile",
            error: error.message
        });
    }
});

// =====================================================
// PLACEMENT DRIVE - CREATE
// =====================================================

app.post("/api/placement-drives", async (req, res) => {

    try {

        const {
            companyId,
            jobTitle,
            jobDescription,
            eligibility,
            skills,
            location,
            jobType,
            packageOffered,
            driveDate,
            applicationDeadline,
            status
        } = req.body;

        if (!companyId || !jobTitle) {

            return res.status(400).json({
                status: "error",
                message:
                    "Company ID and job title are required"
            });
        }

        // Check company
        const [companies] =
            await pool.query(
                `SELECT id, companyName
                 FROM companies
                 WHERE id = ?
                 LIMIT 1`,
                [companyId]
            );

        if (companies.length === 0) {

            return res.status(404).json({
                status: "error",
                message: "Company not found"
            });
        }

        const [result] =
            await pool.query(
                `INSERT INTO placement_drives
                (
                    companyId,
                    jobTitle,
                    jobDescription,
                    eligibility,
                    skills,
                    location,
                    jobType,
                    packageOffered,
                    driveDate,
                    applicationDeadline,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyId,
                    jobTitle,
                    jobDescription || null,
                    eligibility || null,
                    skills || null,
                    location || null,
                    jobType || null,
                    packageOffered || null,
                    driveDate || null,
                    applicationDeadline || null,
                    status || "Open"
                ]
            );

        const [driveRows] =
            await pool.query(
                `SELECT
                    pd.*,
                    c.companyName
                 FROM placement_drives pd
                 INNER JOIN companies c
                    ON c.id = pd.companyId
                 WHERE pd.id = ?`,
                [result.insertId]
            );

        return res.status(201).json({

            status: "success",

            message:
                "Placement drive created successfully",

            drive: driveRows[0]

        });

    } catch (error) {

        console.error(
            "Create placement drive error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message:
                "Failed to create placement drive",
            error: error.message
        });
    }
});

// =====================================================
// GET ALL PLACEMENT DRIVES
// =====================================================

app.get("/api/placement-drives", async (req, res) => {

    try {

        const [rows] =
            await pool.query(
                `SELECT
                    pd.*,
                    c.companyName,
                    c.email AS companyEmail
                 FROM placement_drives pd
                 INNER JOIN companies c
                    ON c.id = pd.companyId
                 ORDER BY pd.id DESC`
            );

        return res.json(rows);

    } catch (error) {

        console.error(
            "Get placement drives error:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message:
                "Failed to load placement drives",
            error: error.message
        });
    }
});

// =====================================================
// GET PLACEMENT DRIVES BY COMPANY
// =====================================================

app.get(
    "/api/placement-drives/company/:companyId",
    async (req, res) => {

        try {

            const companyId =
                req.params.companyId;

            const [rows] =
                await pool.query(
                    `SELECT
                        pd.*,
                        c.companyName,
                        c.email AS companyEmail
                     FROM placement_drives pd
                     INNER JOIN companies c
                        ON c.id = pd.companyId
                     WHERE pd.companyId = ?
                     ORDER BY pd.id DESC`,
                    [companyId]
                );

            return res.json(rows);

        } catch (error) {

            console.error(
                "Get company placement drives error:",
                error.message
            );

            return res.status(500).json({
                status: "error",
                message:
                    "Failed to load company placement drives",
                error: error.message
            });
        }
    }
);

// =====================================================
// GET SINGLE PLACEMENT DRIVE
// =====================================================

app.get(
    "/api/placement-drives/:id",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `SELECT
                        pd.*,
                        c.companyName,
                        c.email AS companyEmail
                     FROM placement_drives pd
                     INNER JOIN companies c
                        ON c.id = pd.companyId
                     WHERE pd.id = ?
                     LIMIT 1`,
                    [req.params.id]
                );

            if (rows.length === 0) {

                return res.status(404).json({
                    status: "error",
                    message:
                        "Placement drive not found"
                });
            }

            return res.json({

                status: "success",

                drive: rows[0]

            });

        } catch (error) {

            console.error(
                "Get placement drive error:",
                error.message
            );

            return res.status(500).json({
                status: "error",
                message:
                    "Failed to load placement drive",
                error: error.message
            });
        }
    }
);

// =====================================================
// UPDATE PLACEMENT DRIVE
// =====================================================

app.put(
    "/api/placement-drives/:id",
    async (req, res) => {

        try {

            const driveId =
                req.params.id;

            const {
                companyId,
                jobTitle,
                jobDescription,
                eligibility,
                skills,
                location,
                jobType,
                packageOffered,
                driveDate,
                applicationDeadline,
                status
            } = req.body;

            const [existing] =
                await pool.query(
                    `SELECT *
                     FROM placement_drives
                     WHERE id = ?
                     LIMIT 1`,
                    [driveId]
                );

            if (existing.length === 0) {

                return res.status(404).json({
                    status: "error",
                    message:
                        "Placement drive not found"
                });
            }

            const finalCompanyId =
                companyId ||
                existing[0].companyId;

            await pool.query(
                `UPDATE placement_drives SET
                    companyId = ?,
                    jobTitle = ?,
                    jobDescription = ?,
                    eligibility = ?,
                    skills = ?,
                    location = ?,
                    jobType = ?,
                    packageOffered = ?,
                    driveDate = ?,
                    applicationDeadline = ?,
                    status = ?
                 WHERE id = ?`,
                [
                    finalCompanyId,
                    jobTitle || existing[0].jobTitle,
                    jobDescription ?? existing[0].jobDescription,
                    eligibility ?? existing[0].eligibility,
                    skills ?? existing[0].skills,
                    location ?? existing[0].location,
                    jobType ?? existing[0].jobType,
                    packageOffered ?? existing[0].packageOffered,
                    driveDate ?? existing[0].driveDate,
                    applicationDeadline ?? existing[0].applicationDeadline,
                    status || existing[0].status,
                    driveId
                ]
            );

            const [updated] =
                await pool.query(
                    `SELECT
                        pd.*,
                        c.companyName
                     FROM placement_drives pd
                     INNER JOIN companies c
                        ON c.id = pd.companyId
                     WHERE pd.id = ?`,
                    [driveId]
                );

            return res.json({

                status: "success",

                message:
                    "Placement drive updated successfully",

                drive: updated[0]

            });

        } catch (error) {

            console.error(
                "Update placement drive error:",
                error.message
            );

            return res.status(500).json({
                status: "error",
                message:
                    "Failed to update placement drive",
                error: error.message
            });
        }
    }
);

// =====================================================
// DELETE PLACEMENT DRIVE
// =====================================================

app.delete(
    "/api/placement-drives/:id",
    async (req, res) => {

        try {

            const [result] =
                await pool.query(
                    `DELETE FROM placement_drives
                     WHERE id = ?`,
                    [req.params.id]
                );

            if (result.affectedRows === 0) {

                return res.status(404).json({
                    status: "error",
                    message:
                        "Placement drive not found"
                });
            }

            return res.json({

                status: "success",

                message:
                    "Placement drive deleted successfully"

            });

        } catch (error) {

            console.error(
                "Delete placement drive error:",
                error.message
            );

            return res.status(500).json({
                status: "error",
                message:
                    "Failed to delete placement drive",
                error: error.message
            });
        }
    }
);

// =====================================================
// NOTIFICATION APIs
// =====================================================

// -----------------------------------------------------
// CREATE NOTIFICATION
// -----------------------------------------------------

app.post("/api/notifications/send", async (req, res) => {

    try {

        const {
            studentId,
            title,
            message,
            sendEmail = false,
            sendMobile = false
        } = req.body;

        if (!studentId) {

            return res.status(400).json({
                status: "error",
                message: "Student ID is required"
            });
        }

        if (!title || !title.trim()) {

            return res.status(400).json({
                status: "error",
                message:
                    "Notification title is required"
            });
        }

        if (!message || !message.trim()) {

            return res.status(400).json({
                status: "error",
                message:
                    "Notification message is required"
            });
        }

        if (!sendEmail && !sendMobile) {

            return res.status(400).json({
                status: "error",
                message:
                    "Select Email or Mobile notification"
            });
        }

        const [students] =
            await pool.query(
                `SELECT
                    id,
                    studentId,
                    fullName,
                    email,
                    mobile
                 FROM students
                 WHERE studentId = ?
                 LIMIT 1`,
                [studentId]
            );

        if (students.length === 0) {

            return res.status(404).json({
                status: "error",
                message: "Student not found"
            });
        }

        const student =
            students[0];

        if (sendEmail && !student.email) {

            return res.status(400).json({
                status: "error",
                message:
                    "Student email address is not available"
            });
        }

        if (sendMobile && !student.mobile) {

            return res.status(400).json({
                status: "error",
                message:
                    "Student mobile number is not available"
            });
        }

        const emailStatus =
            sendEmail
                ? "pending"
                : "not_required";

        const mobileStatus =
            sendMobile
                ? "pending"
                : "not_required";

        const [result] =
            await pool.query(
                `INSERT INTO notifications
                (
                    studentId,
                    studentName,
                    email,
                    mobile,
                    title,
                    message,
                    sendEmail,
                    sendMobile,
                    emailStatus,
                    mobileStatus,
                    overallStatus
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    student.studentId,
                    student.fullName,
                    student.email || null,
                    student.mobile || null,
                    title.trim(),
                    message.trim(),
                    Boolean(sendEmail),
                    Boolean(sendMobile),
                    emailStatus,
                    mobileStatus,
                    "pending"
                ]
            );

        return res.status(201).json({

            status: "success",

            message:
                "Notification created successfully",

            notification: {

                id: result.insertId,

                studentId:
                    student.studentId,

                studentName:
                    student.fullName,

                email:
                    student.email,

                mobile:
                    student.mobile,

                title:
                    title.trim(),

                message:
                    message.trim(),

                sendEmail:
                    Boolean(sendEmail),

                sendMobile:
                    Boolean(sendMobile),

                emailStatus,

                mobileStatus,

                overallStatus:
                    "pending"

            }

        });

    } catch (error) {

        console.error(
            "Send notification error:",
            error.message
        );

        return res.status(500).json({

            status: "error",

            message:
                "Failed to create notification",

            error:
                error.message

        });
    }
});

// -----------------------------------------------------
// GET ALL NOTIFICATIONS
// -----------------------------------------------------

app.get("/api/notifications", async (req, res) => {

    try {

        const [rows] =
            await pool.query(
                `SELECT
                    id,
                    studentId,
                    studentName,
                    email,
                    mobile,
                    title,
                    message,
                    sendEmail,
                    sendMobile,
                    emailStatus,
                    mobileStatus,
                    overallStatus,
                    createdAt
                 FROM notifications
                 ORDER BY createdAt DESC`
            );

        return res.json(rows);

    } catch (error) {

        console.error(
            "Get notifications error:",
            error.message
        );

        return res.status(500).json({

            status: "error",

            message:
                "Failed to load notifications",

            error:
                error.message

        });
    }
});

// -----------------------------------------------------
// GET STUDENT NOTIFICATIONS
// -----------------------------------------------------

app.get(
    "/api/notifications/student/:studentId",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `SELECT
                        id,
                        studentId,
                        studentName,
                        email,
                        mobile,
                        title,
                        message,
                        sendEmail,
                        sendMobile,
                        emailStatus,
                        mobileStatus,
                        overallStatus,
                        createdAt
                     FROM notifications
                     WHERE studentId = ?
                     ORDER BY createdAt DESC`,
                    [req.params.studentId]
                );

            return res.json(rows);

        } catch (error) {

            console.error(
                "Get student notifications error:",
                error.message
            );

            return res.status(500).json({

                status: "error",

                message:
                    "Failed to load student notifications",

                error:
                    error.message

            });
        }
    }
);

// -----------------------------------------------------
// GET SINGLE NOTIFICATION
// -----------------------------------------------------

app.get(
    "/api/notifications/:id",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `SELECT
                        id,
                        studentId,
                        studentName,
                        email,
                        mobile,
                        title,
                        message,
                        sendEmail,
                        sendMobile,
                        emailStatus,
                        mobileStatus,
                        overallStatus,
                        createdAt
                     FROM notifications
                     WHERE id = ?
                     LIMIT 1`,
                    [req.params.id]
                );

            if (rows.length === 0) {

                return res.status(404).json({

                    status: "error",

                    message:
                        "Notification not found"

                });
            }

            return res.json(rows[0]);

        } catch (error) {

            console.error(
                "Get notification error:",
                error.message
            );

            return res.status(500).json({

                status: "error",

                message:
                    "Failed to load notification",

                error:
                    error.message

            });
        }
    }
);

// -----------------------------------------------------
// DELETE NOTIFICATION
// -----------------------------------------------------

app.delete(
    "/api/notifications/:id",
    async (req, res) => {

        try {

            const [result] =
                await pool.query(
                    `DELETE FROM notifications
                     WHERE id = ?`,
                    [req.params.id]
                );

            if (result.affectedRows === 0) {

                return res.status(404).json({

                    status: "error",

                    message:
                        "Notification not found"

                });
            }

            return res.json({

                status: "success",

                message:
                    "Notification deleted successfully"

            });

        } catch (error) {

            console.error(
                "Delete notification error:",
                error.message
            );

            return res.status(500).json({

                status: "error",

                message:
                    "Failed to delete notification",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {

    console.log(
        `🚀 Backend server running on http://localhost:${PORT}`
    );

    console.log(
        "✅ Company Registration/Login API ready"
    );

    console.log(
        "✅ Company Profile GET/PUT API ready"
    );

    console.log(
        "✅ Placement Drive APIs ready"
    );

    console.log(
        "✅ Notification APIs ready"
    );
});