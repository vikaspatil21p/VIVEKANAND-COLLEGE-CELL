package com.vivekanand.placement;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@SpringBootApplication
public class CollegePlacementApplication {

    public static void main(String[] args) {
        SpringApplication.run(CollegePlacementApplication.class, args);
    }

    @Bean
    public WebMvcConfigurer webMvcConfigurer() {
        return new WebMvcConfigurer() {

            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        .allowedOrigins("*")
                        .allowedMethods("*")
                        .allowedHeaders("*");
            }

            @Override
            public void addResourceHandlers(ResourceHandlerRegistry registry) {
                registry.addResourceHandler("/uploads/**")
                        .addResourceLocations("file:uploads/");
            }
        };
    }
}

@RestController
@RequestMapping("/api")
class PlacementController {

    private final JdbcTemplate db;

    private static final String UPLOAD_DIR = "uploads/";

    PlacementController(JdbcTemplate db) {
        this.db = db;
    }

    // =========================================================
    // HEALTH
    // =========================================================

    @GetMapping("/health")
    public Map<String, Object> health() {

        Map<String, Object> response = new HashMap<>();

        try {
            Integer result =
                    db.queryForObject("SELECT 1", Integer.class);

            response.put("status", "ok");
            response.put(
                    "message",
                    "VIVEKANAND COLLEGE PLACEMENT CELL backend is running"
            );
            response.put(
                    "database",
                    result != null ? "connected" : "error"
            );

        } catch (Exception e) {

            response.put("status", "error");
            response.put("message", e.getMessage());
            response.put("database", "disconnected");
        }

        return response;
    }

    // =========================================================
    // PASSWORD HASHING
    // =========================================================

    private String hashPassword(String password) {

        try {

            MessageDigest md =
                    MessageDigest.getInstance("SHA-256");

            byte[] hash =
                    md.digest(password.getBytes());

            StringBuilder hex =
                    new StringBuilder();

            for (byte b : hash) {
                hex.append(
                        String.format("%02x", b)
                );
            }

            return hex.toString();

        } catch (NoSuchAlgorithmException e) {

            throw new RuntimeException(
                    "Password hashing error"
            );
        }
    }

    // =========================================================
    // STUDENT ID GENERATOR
    // =========================================================

    private String nextStudentId() {

        Integer maxId =
                db.queryForObject(
                        "SELECT COALESCE(MAX(id), 0) FROM students",
                        Integer.class
                );

        int next =
                (maxId == null ? 1 : maxId + 1);

        return String.format(
                "STU%03d",
                next
        );
    }

    // =========================================================
    // ADMIN ID GENERATOR
    // =========================================================

    private String nextAdminId() {

        Integer maxId =
                db.queryForObject(
                        "SELECT COALESCE(MAX(id), 0) FROM admins",
                        Integer.class
                );

        int next =
                (maxId == null ? 1 : maxId + 1);

        return String.format(
                "ADM%03d",
                next
        );
    }

    // =========================================================
    // STUDENT REGISTRATION
    // =========================================================

    @PostMapping("/auth/student-register")
    public Map<String, Object> studentRegister(
            @RequestBody Map<String, Object> body) {

        try {

            String fullName = value(body, "fullName");
            String email = value(body, "email");
            String username = value(body, "username");
            String password = value(body, "password");
            String mobile = value(body, "mobile");
            String course = value(body, "course");
            String department = value(body, "department");

            if (fullName.isBlank()
                    || email.isBlank()
                    || username.isBlank()
                    || password.isBlank()
                    || mobile.isBlank()
                    || course.isBlank()
                    || department.isBlank()) {

                return error(
                        "All student registration fields are required"
                );
            }

            if (!mobile.matches("\\d{10,15}")) {

                return error(
                        "Mobile number must contain 10 to 15 digits"
                );
            }

            if (password.length() < 6) {

                return error(
                        "Password must contain at least 6 characters"
                );
            }

            Integer emailCount =
                    db.queryForObject(
                            "SELECT COUNT(*) FROM students WHERE email = ?",
                            Integer.class,
                            email
                    );

            if (emailCount != null && emailCount > 0) {
                return error("Email already registered");
            }

            Integer usernameCount =
                    db.queryForObject(
                            "SELECT COUNT(*) FROM students WHERE username = ?",
                            Integer.class,
                            username
                    );

            if (usernameCount != null && usernameCount > 0) {
                return error("Username already registered");
            }

            Integer mobileCount =
                    db.queryForObject(
                            "SELECT COUNT(*) FROM students WHERE mobile = ?",
                            Integer.class,
                            mobile
                    );

            if (mobileCount != null && mobileCount > 0) {
                return error("Mobile number already registered");
            }

            String studentId = nextStudentId();

            String passwordHash =
                    hashPassword(password);

            // Save generated student_id into database.
            db.update(
                    """
                    INSERT INTO students
                    (
                        student_id,
                        fullName,
                        email,
                        username,
                        passwordHash,
                        mobile,
                        course,
                        department
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    studentId,
                    fullName,
                    email,
                    username,
                    passwordHash,
                    mobile,
                    course,
                    department
            );

            Integer id =
                    db.queryForObject(
                            "SELECT id FROM students WHERE username = ?",
                            Integer.class,
                            username
                    );

            Map<String, Object> student =
                    new HashMap<>();

            student.put("id", id);
            student.put("student_id", studentId);
            student.put("studentId", studentId);
            student.put("fullName", fullName);
            student.put("email", email);
            student.put("username", username);
            student.put("mobile", mobile);
            student.put("course", course);
            student.put("department", department);

            Map<String, Object> response =
                    new HashMap<>();

            response.put("status", "success");
            response.put(
                    "message",
                    "Student registered successfully"
            );
            response.put("student", student);

            return response;

        } catch (Exception e) {

            return error(
                    "Student registration failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // STUDENT LOGIN
    // =========================================================

    @PostMapping("/auth/student-login")
    public Map<String, Object> studentLogin(
            @RequestBody Map<String, Object> body) {

        String username =
                value(body, "username");

        String password =
                value(body, "password");

        if (username.isBlank()
                || password.isBlank()) {

            return error(
                    "Username and password are required"
            );
        }

        List<Map<String, Object>> rows =
                db.queryForList(
                        """
                        SELECT
                            id,
                            student_id,
                            fullName,
                            email,
                            username,
                            mobile,
                            course,
                            department
                        FROM students
                        WHERE username = ?
                        AND passwordHash = ?
                        """,
                        username,
                        hashPassword(password)
                );

        if (rows.isEmpty()) {

            return error(
                    "Invalid student username or password"
            );
        }

        Map<String, Object> student =
                rows.get(0);

        Integer studentDbId =
                ((Number) student.get("id")).intValue();

        Object storedStudentId =
                student.get("student_id");

        String studentId;

        if (storedStudentId != null
                && !String.valueOf(storedStudentId).isBlank()) {

            studentId =
                    String.valueOf(storedStudentId);

        } else {

            // Fix old records which do not have student_id.
            studentId =
                    String.format(
                            "STU%03d",
                            studentDbId
                    );

            db.update(
                    "UPDATE students SET student_id = ? WHERE id = ?",
                    studentId,
                    studentDbId
            );
        }

        student.put("id", studentDbId);
        student.put("student_id", studentId);
        student.put("studentId", studentId);

        Map<String, Object> response =
                new HashMap<>();

        response.put("status", "success");
        response.put(
                "message",
                "Student login successful"
        );
        response.put("role", "student");
        response.put("user", student);

        return response;
    }

    // =========================================================
    // COMMON LOGIN
    // =========================================================

    @PostMapping("/auth/login")
    public Map<String, Object> login(
            @RequestBody Map<String, Object> body) {

        String username = value(body, "username");
        String password = value(body, "password");
        String role = value(body, "role");

        if (username.isBlank()
                || password.isBlank()
                || role.isBlank()) {

            return error(
                    "Username, password and role are required"
            );
        }

        if ("student".equalsIgnoreCase(role)) {
            return studentLogin(body);
        }

        if ("admin".equalsIgnoreCase(role)) {
            return adminLogin(body);
        }

        if ("company".equalsIgnoreCase(role)) {
            return companyLogin(body);
        }

        return error("Invalid role");
    }

    // =========================================================
    // GET ALL STUDENTS
    // =========================================================

    @GetMapping("/students")
    public List<Map<String, Object>> getStudents() {

        return db.queryForList(
                """
                SELECT
                    id,
                    student_id,
                    fullName,
                    email,
                    username,
                    mobile,
                    course,
                    department,
                    gender,
                    dob,
                    address,
                    city,
                    state,
                    academicYear,
                    admissionYear,
                    graduationYear,
                    tenthPercentage,
                    twelfthPercentage,
                    cgpa,
                    skills,
                    resumeUrl,
                    profilePhoto,
                    placedCompany,
                    packageOffered,
                    createdAt,
                    updatedAt
                FROM students
                ORDER BY id DESC
                """
        );
    }

    // =========================================================
    // GET SINGLE STUDENT
    // =========================================================

    @GetMapping("/students/{id}")
    public Map<String, Object> getStudent(
            @PathVariable int id) {

        List<Map<String, Object>> rows =
                db.queryForList(
                        """
                        SELECT
                            id,
                            student_id,
                            fullName,
                            email,
                            username,
                            mobile,
                            course,
                            department,
                            gender,
                            dob,
                            address,
                            city,
                            state,
                            academicYear,
                            admissionYear,
                            graduationYear,
                            tenthPercentage,
                            twelfthPercentage,
                            cgpa,
                            skills,
                            resumeUrl,
                            profilePhoto,
                            placedCompany,
                            packageOffered,
                            createdAt,
                            updatedAt
                        FROM students
                        WHERE id = ?
                        """,
                        id
                );

        if (rows.isEmpty()) {
            return error("Student not found");
        }

        Map<String, Object> student =
                rows.get(0);

        Object studentId =
                student.get("student_id");

        if (studentId == null
                || String.valueOf(studentId).isBlank()) {

            studentId =
                    String.format(
                            "STU%03d",
                            id
                    );
        }

        student.put("student_id", studentId);
        student.put("studentId", studentId);

        return student;
    }

    // =========================================================
    // DELETE STUDENT
    // =========================================================

    @DeleteMapping("/students/{id}")
    public Map<String, Object> deleteStudent(
            @PathVariable int id) {

        try {

            int affected =
                    db.update(
                            "DELETE FROM students WHERE id = ?",
                            id
                    );

            if (affected == 0) {
                return error("Student not found");
            }

            return success(
                    "Student deleted successfully"
            );

        } catch (Exception e) {

            return error(
                    "Student deletion failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // UPDATE STUDENT
    // =========================================================

    @PutMapping("/students/{id}")
    public Map<String, Object> updateStudent(
            @PathVariable int id,
            @RequestBody Map<String, Object> body) {

        String fullName = value(body, "fullName");
        String email = value(body, "email");
        String mobile = value(body, "mobile");
        String course = value(body, "course");
        String department = value(body, "department");

        if (fullName.isBlank()
                || email.isBlank()
                || mobile.isBlank()
                || course.isBlank()
                || department.isBlank()) {

            return error(
                    "All required student fields are required"
            );
        }

        try {

            int affected =
                    db.update(
                            """
                            UPDATE students
                            SET fullName = ?,
                                email = ?,
                                mobile = ?,
                                course = ?,
                                department = ?
                            WHERE id = ?
                            """,
                            fullName,
                            email,
                            mobile,
                            course,
                            department,
                            id
                    );

            if (affected == 0) {
                return error("Student not found");
            }

            return success(
                    "Student updated successfully"
            );

        } catch (Exception e) {

            return error(
                    "Student update failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // STUDENT PROFILE SAVE
    // =========================================================

    @PostMapping(
            value = "/students/{id}/profile",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public Map<String, Object> saveStudentProfile(
            @PathVariable int id,

            @RequestParam(required = false)
            String gender,

            @RequestParam(required = false)
            String dob,

            @RequestParam(required = false)
            String address,

            @RequestParam(required = false)
            String city,

            @RequestParam(required = false)
            String state,

            @RequestParam(required = false)
            String academicyear,

            @RequestParam(required = false)
            String graduationyear,

            @RequestParam(required = false)
            String admissionyear,

            @RequestParam(required = false)
            String tenthpercentage,

            @RequestParam(required = false)
            String twelthpercentage,

            @RequestParam(required = false)
            String skills,

            @RequestParam(required = false)
            String cgpa,

            @RequestParam(required = false)
            MultipartFile resume,

            @RequestParam(required = false)
            MultipartFile profilePhoto
    ) {

        try {

            Integer studentCount =
                    db.queryForObject(
                            "SELECT COUNT(*) FROM students WHERE id = ?",
                            Integer.class,
                            id
                    );

            if (studentCount == null
                    || studentCount == 0) {

                return error("Student not found");
            }

            String resumeUrl =
                    saveFile(resume, "resumes");

            String profilePhotoUrl =
                    saveFile(
                            profilePhoto,
                            "profile-photos"
                    );

            String oldResume = null;
            String oldPhoto = null;

            List<Map<String, Object>> oldProfile =
                    db.queryForList(
                            """
                            SELECT
                                resumeUrl,
                                profilePhoto
                            FROM student_profiles
                            WHERE student_id = ?
                            """,
                            id
                    );

            if (!oldProfile.isEmpty()) {

                oldResume =
                        (String) oldProfile
                                .get(0)
                                .get("resumeUrl");

                oldPhoto =
                        (String) oldProfile
                                .get(0)
                                .get("profilePhoto");
            }

            if (resumeUrl == null
                    || resumeUrl.isBlank()) {

                resumeUrl = oldResume;
            }

            if (profilePhotoUrl == null
                    || profilePhotoUrl.isBlank()) {

                profilePhotoUrl = oldPhoto;
            }

            if (resumeUrl == null) {
                resumeUrl = "";
            }

            if (profilePhotoUrl == null) {
                profilePhotoUrl = "";
            }

            Date profileDob =
                    (dob == null || dob.isBlank())
                            ? null
                            : Date.valueOf(dob);

            Double tenth =
                    (tenthpercentage == null
                            || tenthpercentage.isBlank())
                            ? null
                            : Double.parseDouble(
                                    tenthpercentage
                            );

            Double twelfth =
                    (twelthpercentage == null
                            || twelthpercentage.isBlank())
                            ? null
                            : Double.parseDouble(
                                    twelthpercentage
                            );

            Double studentCgpa =
                    (cgpa == null
                            || cgpa.isBlank())
                            ? null
                            : Double.parseDouble(cgpa);

            boolean exists =
                    !oldProfile.isEmpty();

            if (exists) {

                db.update(
                        """
                        UPDATE student_profiles
                        SET gender = ?,
                            dob = ?,
                            address = ?,
                            city = ?,
                            state = ?,
                            academicyear = ?,
                            graduationyear = ?,
                            admissionyear = ?,
                            tenthpercentage = ?,
                            twelthpercentage = ?,
                            skills = ?,
                            resumeUrl = ?,
                            profilePhoto = ?,
                            cgpa = ?
                        WHERE student_id = ?
                        """,
                        gender,
                        profileDob,
                        address,
                        city,
                        state,
                        academicyear,
                        graduationyear,
                        admissionyear,
                        tenth,
                        twelfth,
                        skills,
                        resumeUrl,
                        profilePhotoUrl,
                        studentCgpa,
                        id
                );

            } else {

                db.update(
                        """
                        INSERT INTO student_profiles
                        (
                            student_id,
                            gender,
                            dob,
                            address,
                            city,
                            state,
                            academicyear,
                            graduationyear,
                            admissionyear,
                            tenthpercentage,
                            twelthpercentage,
                            skills,
                            resumeUrl,
                            profilePhoto,
                            cgpa
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        id,
                        gender,
                        profileDob,
                        address,
                        city,
                        state,
                        academicyear,
                        graduationyear,
                        admissionyear,
                        tenth,
                        twelfth,
                        skills,
                        resumeUrl,
                        profilePhotoUrl,
                        studentCgpa
                );
            }

            // Also keep student table profile columns synchronized.
            db.update(
                    """
                    UPDATE students
                    SET gender = ?,
                        dob = ?,
                        address = ?,
                        city = ?,
                        state = ?,
                        academicYear = ?,
                        admissionYear = ?,
                        graduationYear = ?,
                        tenthPercentage = ?,
                        twelfthPercentage = ?,
                        cgpa = ?,
                        skills = ?,
                        resumeUrl = ?,
                        profilePhoto = ?
                    WHERE id = ?
                    """,
                    gender,
                    profileDob,
                    address,
                    city,
                    state,
                    academicyear,
                    admissionyear,
                    graduationyear,
                    tenth,
                    twelfth,
                    studentCgpa,
                    skills,
                    resumeUrl,
                    profilePhotoUrl,
                    id
            );

            return success(
                    "Student profile saved successfully"
            );

        } catch (Exception e) {

            return error(
                    "Profile save failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // GET STUDENT PROFILE
    // =========================================================

    @GetMapping("/students/{id}/profile")
    public Map<String, Object> getStudentProfile(
            @PathVariable int id) {

        List<Map<String, Object>> rows =
                db.queryForList(
                        """
                        SELECT
                            s.id,
                            s.student_id,
                            s.fullName,
                            s.email,
                            s.username,
                            s.mobile,
                            s.course,
                            s.department,
                            s.gender,
                            s.dob,
                            s.address,
                            s.city,
                            s.state,
                            s.academicYear,
                            s.graduationYear,
                            s.admissionYear,
                            s.tenthPercentage,
                            s.twelfthPercentage,
                            s.skills,
                            s.resumeUrl,
                            s.profilePhoto,
                            s.cgpa,
                            s.placedCompany,
                            s.packageOffered,

                            p.gender AS profileGender,
                            p.dob AS profileDob,
                            p.address AS profileAddress,
                            p.city AS profileCity,
                            p.state AS profileState,
                            p.academicyear AS profileAcademicYear,
                            p.graduationyear AS profileGraduationYear,
                            p.admissionyear AS profileAdmissionYear,
                            p.tenthpercentage AS profileTenthPercentage,
                            p.twelthpercentage AS profileTwelfthPercentage,
                            p.skills AS profileSkills,
                            p.resumeUrl AS profileResumeUrl,
                            p.profilePhoto AS profilePhotoUrl,
                            p.cgpa AS profileCgpa

                        FROM students s

                        LEFT JOIN student_profiles p
                            ON s.id = p.student_id

                        WHERE s.id = ?
                        """,
                        id
                );

        if (rows.isEmpty()) {
            return error("Student not found");
        }

        Map<String, Object> profile =
                rows.get(0);

        Object studentId =
                profile.get("student_id");

        if (studentId == null
                || String.valueOf(studentId).isBlank()) {

            studentId =
                    String.format(
                            "STU%03d",
                            id
                    );
        }

        profile.put("student_id", studentId);
        profile.put("studentId", studentId);

        if (profile.get("profileGender") != null)
            profile.put("gender",
                    profile.get("profileGender"));

        if (profile.get("profileDob") != null)
            profile.put("dob",
                    profile.get("profileDob"));

        if (profile.get("profileAddress") != null)
            profile.put("address",
                    profile.get("profileAddress"));

        if (profile.get("profileCity") != null)
            profile.put("city",
                    profile.get("profileCity"));

        if (profile.get("profileState") != null)
            profile.put("state",
                    profile.get("profileState"));

        if (profile.get("profileAcademicYear") != null)
            profile.put(
                    "academicYear",
                    profile.get("profileAcademicYear")
            );

        if (profile.get("profileGraduationYear") != null)
            profile.put(
                    "graduationYear",
                    profile.get("profileGraduationYear")
            );

        if (profile.get("profileAdmissionYear") != null)
            profile.put(
                    "admissionYear",
                    profile.get("profileAdmissionYear")
            );

        if (profile.get("profileTenthPercentage") != null)
            profile.put(
                    "tenthPercentage",
                    profile.get("profileTenthPercentage")
            );

        if (profile.get("profileTwelfthPercentage") != null)
            profile.put(
                    "twelfthPercentage",
                    profile.get("profileTwelfthPercentage")
            );

        if (profile.get("profileSkills") != null)
            profile.put(
                    "skills",
                    profile.get("profileSkills")
            );

        if (profile.get("profileResumeUrl") != null)
            profile.put(
                    "resumeUrl",
                    profile.get("profileResumeUrl")
            );

        if (profile.get("profilePhotoUrl") != null)
            profile.put(
                    "profilePhoto",
                    profile.get("profilePhotoUrl")
            );

        if (profile.get("profileCgpa") != null)
            profile.put(
                    "cgpa",
                    profile.get("profileCgpa")
            );

        return profile;
    }

    // =========================================================
    // FILE UPLOAD
    // =========================================================

    private String saveFile(
            MultipartFile file,
            String folder) throws IOException {

        if (file == null || file.isEmpty()) {
            return null;
        }

        Path directory =
                Paths.get(
                        UPLOAD_DIR,
                        folder
                );

        Files.createDirectories(directory);

        String originalName =
                file.getOriginalFilename();

        String extension = "";

        if (originalName != null
                && originalName.contains(".")) {

            extension =
                    originalName.substring(
                            originalName.lastIndexOf(".")
                    );
        }

        String fileName =
                UUID.randomUUID()
                        + extension;

        Path target =
                directory.resolve(fileName);

        Files.write(
                target,
                file.getBytes()
        );

        return "/uploads/"
                + folder
                + "/"
                + fileName;
    }

    // =========================================================
    // ADMIN REGISTRATION
    // =========================================================

    @PostMapping("/auth/admin-register")
    public Map<String, Object> adminRegister(
            @RequestBody Map<String, Object> body) {

        try {

            String fullName = value(body, "fullName");
            String email = value(body, "email");
            String username = value(body, "username");
            String password = value(body, "password");

            if (fullName.isBlank()
                    || email.isBlank()
                    || username.isBlank()
                    || password.isBlank()) {

                return error(
                        "All admin registration fields are required"
                );
            }

            if (password.length() < 6) {

                return error(
                        "Password must contain at least 6 characters"
                );
            }

            Integer count =
                    db.queryForObject(
                            """
                            SELECT COUNT(*)
                            FROM admins
                            WHERE email = ?
                               OR username = ?
                            """,
                            Integer.class,
                            email,
                            username
                    );

            if (count != null && count > 0) {

                return error(
                        "Admin email or username already exists"
                );
            }

            String adminId =
                    nextAdminId();

            db.update(
                    """
                    INSERT INTO admins
                    (
                        admin_id,
                        fullName,
                        email,
                        username,
                        passwordHash
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    adminId,
                    fullName,
                    email,
                    username,
                    hashPassword(password)
            );

            Map<String, Object> admin =
                    new HashMap<>();

            admin.put("admin_id", adminId);
            admin.put("adminId", adminId);
            admin.put("fullName", fullName);
            admin.put("email", email);
            admin.put("username", username);

            Map<String, Object> response =
                    success(
                            "Admin registered successfully"
                    );

            response.put("admin", admin);

            return response;

        } catch (Exception e) {

            return error(
                    "Admin registration failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // ADMIN LOGIN
    // =========================================================

    @PostMapping("/auth/admin-login")
    public Map<String, Object> adminLogin(
            @RequestBody Map<String, Object> body) {

        String username =
                value(body, "username");

        String password =
                value(body, "password");

        if (username.isBlank()
                || password.isBlank()) {

            return error(
                    "Username and password are required"
            );
        }

        List<Map<String, Object>> rows =
                db.queryForList(
                        """
                        SELECT
                            id,
                            admin_id,
                            fullName,
                            email,
                            username
                        FROM admins
                        WHERE username = ?
                        AND passwordHash = ?
                        """,
                        username,
                        hashPassword(password)
                );

        if (rows.isEmpty()) {

            return error(
                    "Invalid admin username or password"
            );
        }

        Map<String, Object> admin =
                rows.get(0);

        Integer adminDbId =
                ((Number) admin.get("id")).intValue();

        Object storedAdminId =
                admin.get("admin_id");

        String adminId;

        if (storedAdminId != null
                && !String.valueOf(storedAdminId).isBlank()) {

            adminId =
                    String.valueOf(storedAdminId);

        } else {

            adminId =
                    String.format(
                            "ADM%03d",
                            adminDbId
                    );

            db.update(
                    "UPDATE admins SET admin_id = ? WHERE id = ?",
                    adminId,
                    adminDbId
            );
        }

        admin.put("id", adminDbId);
        admin.put("admin_id", adminId);
        admin.put("adminId", adminId);

        Map<String, Object> response =
                new HashMap<>();

        response.put("status", "success");
        response.put(
                "message",
                "Admin login successful"
        );
        response.put("role", "admin");
        response.put("user", admin);

        return response;
    }

    // =========================================================
    // COMPANY REGISTRATION
    // =========================================================

    @PostMapping("/auth/company-register")
    public Map<String, Object> companyRegister(
            @RequestBody Map<String, Object> body) {

        try {

            String companyName = value(body, "companyName");
            String email = value(body, "email");
            String phone = value(body, "phone");
            String website = value(body, "website");
            String type = value(body, "type");
            String location = value(body, "location");

            if (companyName.isBlank()
                    || email.isBlank()
                    || phone.isBlank()
                    || website.isBlank()
                    || type.isBlank()
                    || location.isBlank()) {

                return error(
                        "All company registration fields are required"
                );
            }

            Integer count =
                    db.queryForObject(
                            """
                            SELECT COUNT(*)
                            FROM companies
                            WHERE email = ?
                               OR companyName = ?
                            """,
                            Integer.class,
                            email,
                            companyName
                    );

            if (count != null && count > 0) {
                return error("Company already exists");
            }

            db.update(
                    """
                    INSERT INTO companies
                    (
                        companyName,
                        email,
                        phone,
                        website,
                        type,
                        location
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    companyName,
                    email,
                    phone,
                    website,
                    type,
                    location
            );

            Integer companyId =
                    db.queryForObject(
                            "SELECT company_id FROM companies WHERE email = ?",
                            Integer.class,
                            email
                    );

            Map<String, Object> company = new HashMap<>();
            company.put("company_id", companyId);
            company.put("companyId", companyId);
            company.put("companyName", companyName);
            company.put("email", email);
            company.put("phone", phone);
            company.put("website", website);
            company.put("type", type);
            company.put("location", location);
            company.put("username", "");
            company.put("description", "");

            Map<String, Object> response =
                    success("Company registered successfully");

            response.put("company", company);
            return response;

        } catch (Exception e) {

            return error(
                    "Company registration failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // HR REGISTRATION
    // =========================================================

    @PostMapping("/auth/hr-register")
    public Map<String, Object> hrRegister(
            @RequestBody Map<String, Object> body) {

        try {

            String companyIdText = value(body, "company_id");
            String fullName = value(body, "fullName");
            String email = value(body, "email");
            String username = value(body, "username");
            String password = value(body, "password");

            if (companyIdText.isBlank()
                    || fullName.isBlank()
                    || email.isBlank()
                    || username.isBlank()
                    || password.isBlank()) {

                return error(
                        "Company ID, full name, email, username and password are required"
                );
            }

            Integer companyId;

            try {
                companyId = Integer.parseInt(companyIdText);
            } catch (NumberFormatException e) {
                return error("Invalid company ID");
            }

            if (password.length() < 6) {
                return error(
                        "Password must contain at least 6 characters"
                );
            }

            Integer companyCount =
                    db.queryForObject(
                            "SELECT COUNT(*) FROM companies WHERE company_id = ?",
                            Integer.class,
                            companyId
                    );

            if (companyCount == null || companyCount == 0) {
                return error("Company not found");
            }

            Integer accountCount =
                    db.queryForObject(
                            """
                            SELECT COUNT(*)
                            FROM hr
                            WHERE email = ?
                               OR username = ?
                            """,
                            Integer.class,
                            email,
                            username
                    );

            if (accountCount != null && accountCount > 0) {
                return error("HR email or username already exists");
            }

            db.update(
                    """
                    INSERT INTO hr
                    (
                        company_id,
                        fullName,
                        email,
                        username,
                        passwordHash
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    companyId,
                    fullName,
                    email,
                    username,
                    hashPassword(password)
            );

            Integer hrId =
                    db.queryForObject(
                            "SELECT hr_id FROM hr WHERE username = ?",
                            Integer.class,
                            username
                    );

            Map<String, Object> hr = new HashMap<>();
            hr.put("hr_id", hrId);
            hr.put("hrId", hrId);
            hr.put("company_id", companyId);
            hr.put("companyId", companyId);
            hr.put("fullName", fullName);
            hr.put("email", email);
            hr.put("username", username);

            Map<String, Object> response =
                    success("HR registered successfully");

            response.put("hr", hr);
            return response;

        } catch (Exception e) {

            return error(
                    "HR registration failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // HR LOGIN
    // =========================================================

    @PostMapping("/auth/hr-login")
    public Map<String, Object> hrLogin(
            @RequestBody Map<String, Object> body) {

        String username = value(body, "username");
        String password = value(body, "password");

        if (username.isBlank() || password.isBlank()) {
            return error(
                    "Username and password are required"
            );
        }

        try {

            List<Map<String, Object>> rows =
                    db.queryForList(
                            """
                            SELECT
                                h.hr_id,
                                h.company_id,
                                h.fullName,
                                h.email,
                                h.username,
                                c.companyName,
                                c.email AS companyEmail,
                                c.phone AS companyPhone,
                                c.website AS companyWebsite,
                                c.type AS companyType,
                                c.location AS companyLocation
                            FROM hr h
                            INNER JOIN companies c
                                ON h.company_id = c.company_id
                            WHERE h.username = ?
                              AND h.passwordHash = ?
                            """,
                            username,
                            hashPassword(password)
                    );

            if (rows.isEmpty()) {
                return error(
                        "Invalid HR username or password"
                );
            }

            Map<String, Object> hr = rows.get(0);

            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("message", "HR login successful");
            response.put("role", "hr");
            response.put("user", hr);

            return response;

        } catch (Exception e) {

            return error(
                    "HR login failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // COMPANY LOGIN / HR COMPATIBILITY LOGIN
    // =========================================================
    //
    // The current frontend calls /auth/company-login.
    // Keep this endpoint so the existing login page continues
    // to work. It authenticates an HR account from the hr table.

    @PostMapping("/auth/company-login")
    public Map<String, Object> companyLogin(
            @RequestBody Map<String, Object> body) {

        String username = value(body, "username");
        String password = value(body, "password");

        if (username.isBlank() || password.isBlank()) {
            return error(
                    "Username and password are required"
            );
        }

        try {

            List<Map<String, Object>> rows =
                    db.queryForList(
                            """
                            SELECT
                                h.hr_id,
                                h.company_id,
                                h.fullName AS hrName,
                                h.email AS hrEmail,
                                h.username,
                                c.company_id,
                                c.companyName,
                                c.email,
                                c.phone,
                                c.website,
                                c.type,
                                c.location
                            FROM hr h
                            INNER JOIN companies c
                                ON h.company_id = c.company_id
                            WHERE h.username = ?
                              AND h.passwordHash = ?
                            """,
                            username,
                            hashPassword(password)
                    );

            if (rows.isEmpty()) {
                return error(
                        "Invalid HR username or password"
                );
            }

            Map<String, Object> companyUser = rows.get(0);

            companyUser.put("id", companyUser.get("company_id"));
            companyUser.put("companyId", companyUser.get("company_id"));

            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("message", "Company HR login successful");

            // Keep "company" for compatibility with the current frontend.
            response.put("role", "company");
            response.put("user", companyUser);

            return response;

        } catch (Exception e) {

            return error(
                    "Company login failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // GET ALL HR ACCOUNTS
    // =========================================================

    @GetMapping("/hr")
    public List<Map<String, Object>> getHrAccounts() {

        return db.queryForList(
                """
                SELECT
                    h.hr_id,
                    h.company_id,
                    c.companyName,
                    h.fullName,
                    h.email,
                    h.username
                FROM hr h
                INNER JOIN companies c
                    ON h.company_id = c.company_id
                ORDER BY h.hr_id DESC
                """
        );
    }

    // =========================================================
    // GET HR ACCOUNTS FOR A COMPANY
    // =========================================================

    @GetMapping("/companies/{companyId}/hr")
    public List<Map<String, Object>> getCompanyHr(
            @PathVariable int companyId) {

        return db.queryForList(
                """
                SELECT
                    h.hr_id,
                    h.company_id,
                    c.companyName,
                    h.fullName,
                    h.email,
                    h.username
                FROM hr h
                INNER JOIN companies c
                    ON h.company_id = c.company_id
                WHERE h.company_id = ?
                ORDER BY h.hr_id DESC
                """,
                companyId
        );
    }

    // =========================================================
    // GET COMPANIES
    // =========================================================

    @GetMapping("/companies")
    public List<Map<String, Object>> getCompanies() {

        return db.queryForList(
                """
                SELECT
                    company_id,
                    companyName,
                    email,
                    phone,
                    website,
                    type,
                    location
                FROM companies
                ORDER BY company_id DESC
                """
        );
    }

    // =========================================================
    // GET SINGLE COMPANY
    // =========================================================

    @GetMapping("/companies/{companyId}")
    public Map<String, Object> getCompany(
            @PathVariable int companyId) {

        try {
            List<Map<String, Object>> rows =
                    db.queryForList(
                            """
                            SELECT
                                company_id,
                                companyName,
                                email,
                                phone,
                                website,
                                type,
                                location,
                                username,
                                description
                            FROM companies
                            WHERE company_id = ?
                            """,
                            companyId
                    );

            if (rows.isEmpty()) {
                return error("Company not found");
            }

            Map<String, Object> company = rows.get(0);
            company.put("id", company.get("company_id"));
            company.put("companyId", company.get("company_id"));

            Map<String, Object> response = success("Company fetched successfully");
            response.put("company", company);
            return response;

        } catch (Exception e) {
            return error("Unable to fetch company: " + e.getMessage());
        }
    }

    // =========================================================
    // UPDATE COMPANY
    // =========================================================

    @PutMapping("/companies/{companyId}")
    public Map<String, Object> updateCompany(
            @PathVariable int companyId,
            @RequestBody Map<String, Object> body) {

        try {
            String companyName = value(body, "companyName");
            String email = value(body, "email");
            String phone = value(body, "phone");
            String website = value(body, "website");
            String type = value(body, "type");
            String industry = value(body, "industry");
            String location = value(body, "location");
            String username = value(body, "username");
            String description = value(body, "description");

            if (type.isBlank() && !industry.isBlank()) {
                type = industry;
            }

            if (companyName.isBlank() || email.isBlank() || phone.isBlank()
                    || website.isBlank() || type.isBlank() || location.isBlank()) {
                return error("Company name, email, phone, website, industry and location are required");
            }

            Integer existing = db.queryForObject(
                    "SELECT COUNT(*) FROM companies WHERE company_id = ?",
                    Integer.class, companyId);

            if (existing == null || existing == 0) {
                return error("Company not found");
            }

            Integer duplicate = db.queryForObject(
                    """
                    SELECT COUNT(*) FROM companies
                    WHERE (email = ? OR companyName = ?)
                      AND company_id <> ?
                    """,
                    Integer.class, email, companyName, companyId);

            if (duplicate != null && duplicate > 0) {
                return error("Another company already uses this email or company name");
            }

            db.update(
                    """
                    UPDATE companies
                    SET companyName = ?,
                        email = ?,
                        phone = ?,
                        website = ?,
                        type = ?,
                        location = ?,
                        username = ?,
                        description = ?
                    WHERE company_id = ?
                    """,
                    companyName, email, phone, website, type, location,
                    username, description, companyId);

            Map<String, Object> company = db.queryForMap(
                    """
                    SELECT company_id, companyName, email, phone, website, type, location,
                           username, description
                    FROM companies
                    WHERE company_id = ?
                    """,
                    companyId);

            company.put("id", company.get("company_id"));
            company.put("companyId", company.get("company_id"));

            Map<String, Object> response = success("Company profile updated successfully");
            response.put("company", company);
            return response;

        } catch (Exception e) {
            return error("Company profile update failed: " + e.getMessage());
        }
    }

    // =========================================================
    // GET PLACEMENT DRIVES
    // =========================================================

    @GetMapping("/placement-drives")
    public List<Map<String, Object>> getPlacementDrives() {

        return db.queryForList(
                """
                SELECT
                    d.drive_id,
                    d.company_id,
                    c.companyName,
                    d.jobTitle,
                    d.eligibility,
                    d.jobType,
                    d.drive_Date,
                    d.package_offered
                FROM placement_drives d
                INNER JOIN companies c
                    ON d.company_id = c.company_id
                ORDER BY d.drive_id DESC
                """
        );
    }

    // =========================================================
    // CREATE PLACEMENT DRIVE
    // =========================================================

    @PostMapping("/placement-drives")
    public Map<String, Object> createPlacementDrive(
            @RequestBody Map<String, Object> body) {

        try {

            Integer companyId =
                    Integer.parseInt(
                            value(body, "company_id")
                    );

            String jobTitle =
                    value(body, "jobTitle");

            String eligibility =
                    value(body, "eligibility");

            String jobType =
                    value(body, "jobType");

            String driveDate =
                    value(body, "drive_Date");

            String packageOffered =
                    value(body, "package_offered");

            db.update(
                    """
                    INSERT INTO placement_drives
                    (
                        company_id,
                        jobTitle,
                        eligibility,
                        jobType,
                        drive_Date,
                        package_offered
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    companyId,
                    jobTitle,
                    eligibility,
                    jobType,
                    Date.valueOf(driveDate),
                    Double.parseDouble(packageOffered)
            );

            return success(
                    "Placement drive created successfully"
            );

        } catch (Exception e) {

            return error(
                    "Placement drive creation failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // APPLY FOR PLACEMENT DRIVE
    // =========================================================

    @PostMapping("/applications")
    public Map<String, Object> applyForDrive(
            @RequestBody Map<String, Object> body) {

        try {

            Integer studentId =
                    Integer.parseInt(
                            value(body, "student_id")
                    );

            Integer driveId =
                    Integer.parseInt(
                            value(body, "drive_id")
                    );

            Integer count =
                    db.queryForObject(
                            """
                            SELECT COUNT(*)
                            FROM job_applications
                            WHERE student_id = ?
                              AND drive_id = ?
                            """,
                            Integer.class,
                            studentId,
                            driveId
                    );

            if (count != null && count > 0) {

                return error(
                        "Student has already applied for this drive"
                );
            }

            db.update(
                    """
                    INSERT INTO job_applications
                    (
                        student_id,
                        drive_id
                    )
                    VALUES (?, ?)
                    """,
                    studentId,
                    driveId
            );

            return success(
                    "Application submitted successfully"
            );

        } catch (Exception e) {

            return error(
                    "Application failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // GET APPLICATIONS
    // =========================================================

    @GetMapping("/applications")
    public List<Map<String, Object>> getApplications() {

        return db.queryForList(
                """
                SELECT
                    a.application_id,
                    a.student_id,
                    s.student_id AS studentId,
                    s.fullName AS studentName,
                    s.email AS studentEmail,
                    a.drive_id,
                    d.jobTitle,
                    c.companyName
                FROM job_applications a
                INNER JOIN students s
                    ON a.student_id = s.id
                INNER JOIN placement_drives d
                    ON a.drive_id = d.drive_id
                INNER JOIN companies c
                    ON d.company_id = c.company_id
                ORDER BY a.application_id DESC
                """
        );
    }

    // =========================================================
    // GET STUDENT APPLICATIONS
    // =========================================================

    @GetMapping("/students/{id}/applications")
    public List<Map<String, Object>> getStudentApplications(
            @PathVariable int id) {

        return db.queryForList(
                """
                SELECT
                    a.application_id,
                    a.student_id,
                    s.student_id AS studentId,
                    a.drive_id,
                    d.jobTitle,
                    d.eligibility,
                    d.jobType,
                    d.drive_Date,
                    d.package_offered,
                    c.companyName
                FROM job_applications a
                INNER JOIN students s
                    ON a.student_id = s.id
                INNER JOIN placement_drives d
                    ON a.drive_id = d.drive_id
                INNER JOIN companies c
                    ON d.company_id = c.company_id
                WHERE a.student_id = ?
                ORDER BY a.application_id DESC
                """,
                id
        );
    }

    // =========================================================
    // CREATE PLACEMENT ROUND
    // =========================================================

    @PostMapping("/placement-rounds")
    public Map<String, Object> createPlacementRound(
            @RequestBody Map<String, Object> body) {

        try {

            String roundName =
                    value(body, "round_name");

            Integer applicationId =
                    Integer.parseInt(
                            value(body, "application_id")
                    );

            Integer driveId =
                    Integer.parseInt(
                            value(body, "drive_id")
                    );

            db.update(
                    """
                    INSERT INTO placement_rounds
                    (
                        round_name,
                        application_id,
                        drive_id
                    )
                    VALUES (?, ?, ?)
                    """,
                    roundName,
                    applicationId,
                    driveId
            );

            return success(
                    "Placement round created successfully"
            );

        } catch (Exception e) {

            return error(
                    "Placement round creation failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // GET PLACEMENT ROUNDS
    // =========================================================

    @GetMapping("/placement-rounds")
    public List<Map<String, Object>> getPlacementRounds() {

        return db.queryForList(
                """
                SELECT
                    r.round_id,
                    r.round_name,
                    r.application_id,
                    r.drive_id
                FROM placement_rounds r
                ORDER BY r.round_id DESC
                """
        );
    }

    // =========================================================
    // CREATE RESULT
    // =========================================================

    @PostMapping("/results")
    public Map<String, Object> createResult(
            @RequestBody Map<String, Object> body) {

        try {

            Integer studentId =
                    Integer.parseInt(
                            value(body, "student_id")
                    );

            Integer driveId =
                    Integer.parseInt(
                            value(body, "drive_id")
                    );

            Integer roundId =
                    Integer.parseInt(
                            value(body, "round_id")
                    );

            Integer marks =
                    Integer.parseInt(
                            value(body, "marks")
                    );

            db.update(
                    """
                    INSERT INTO results
                    (
                        student_id,
                        drive_id,
                        round_id,
                        marks
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    studentId,
                    driveId,
                    roundId,
                    marks
            );

            return success(
                    "Result saved successfully"
            );

        } catch (Exception e) {

            return error(
                    "Result save failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // GET RESULTS
    // =========================================================

    @GetMapping("/results")
    public List<Map<String, Object>> getResults() {

        return db.queryForList(
                """
                SELECT
                    r.student_id,
                    s.student_id AS studentId,
                    s.fullName AS studentName,
                    r.drive_id,
                    d.jobTitle,
                    r.round_id,
                    pr.round_name,
                    r.marks
                FROM results r
                INNER JOIN students s
                    ON r.student_id = s.id
                INNER JOIN placement_drives d
                    ON r.drive_id = d.drive_id
                INNER JOIN placement_rounds pr
                    ON r.round_id = pr.round_id
                ORDER BY r.student_id
                """
        );
    }

    // =========================================================
    // CREATE SELECTION
    // =========================================================

    @PostMapping("/selections")
    public Map<String, Object> createSelection(
            @RequestBody Map<String, Object> body) {

        try {

            Integer applicationId =
                    Integer.parseInt(
                            value(body, "application_id")
                    );

            Integer studentId =
                    Integer.parseInt(
                            value(body, "student_id")
                    );

            Integer companyId =
                    Integer.parseInt(
                            value(body, "company_id")
                    );

            Integer driveId =
                    Integer.parseInt(
                            value(body, "drive_id")
                    );

            db.update(
                    """
                    INSERT INTO selections
                    (
                        application_id,
                        student_id,
                        company_id,
                        drive_id
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    applicationId,
                    studentId,
                    companyId,
                    driveId
            );

            return success(
                    "Student selected successfully"
            );

        } catch (Exception e) {

            return error(
                    "Selection failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // GET SELECTIONS
    // =========================================================

    @GetMapping("/selections")
    public List<Map<String, Object>> getSelections() {

        return db.queryForList(
                """
                SELECT
                    s.application_id,
                    s.student_id,
                    st.student_id AS studentId,
                    st.fullName AS studentName,
                    s.company_id,
                    c.companyName,
                    s.drive_id,
                    d.jobTitle
                FROM selections s
                INNER JOIN students st
                    ON s.student_id = st.id
                INNER JOIN companies c
                    ON s.company_id = c.company_id
                INNER JOIN placement_drives d
                    ON s.drive_id = d.drive_id
                ORDER BY s.application_id DESC
                """
        );
    }

    // =========================================================
    // CREATE OFFER LETTER
    // =========================================================

    @PostMapping("/offer-letters")
    public Map<String, Object> createOfferLetter(
            @RequestBody Map<String, Object> body) {

        try {

            Integer studentId =
                    Integer.parseInt(
                            value(body, "student_id")
                    );

            Integer driveId =
                    Integer.parseInt(
                            value(body, "drive_id")
                    );

            String offerDate =
                    value(body, "Offer_date");

            db.update(
                    """
                    INSERT INTO offer_letters
                    (
                        student_id,
                        drive_id,
                        Offer_date
                    )
                    VALUES (?, ?, ?)
                    """,
                    studentId,
                    driveId,
                    Date.valueOf(offerDate)
            );

            return success(
                    "Offer letter record created successfully"
            );

        } catch (Exception e) {

            return error(
                    "Offer letter creation failed: "
                            + e.getMessage()
            );
        }
    }

    // =========================================================
    // GET OFFER LETTERS
    // =========================================================

    @GetMapping("/offer-letters")
    public List<Map<String, Object>> getOfferLetters() {

        return db.queryForList(
                """
                SELECT
                    o.student_id,
                    s.student_id AS studentId,
                    s.fullName AS studentName,
                    o.drive_id,
                    d.jobTitle,
                    c.companyName,
                    o.Offer_date
                FROM offer_letters o
                INNER JOIN students s
                    ON o.student_id = s.id
                INNER JOIN placement_drives d
                    ON o.drive_id = d.drive_id
                INNER JOIN companies c
                    ON d.company_id = c.company_id
                ORDER BY o.Offer_date DESC
                """
        );
    }

    // =========================================================
    // NOTIFICATIONS
    // =========================================================

    @GetMapping("/notifications")
    public List<Map<String, Object>> getNotifications() {

        try {

            return db.queryForList(
                    """
                    SELECT *
                    FROM notifications
                    ORDER BY id DESC
                    """
            );

        } catch (Exception e) {

            return List.of();
        }
    }

    // =========================================================
    // HELPER: VALUE
    // =========================================================

    private String value(
            Map<String, Object> body,
            String key) {

        Object value =
                body.get(key);

        return value == null
                ? ""
                : String.valueOf(value).trim();
    }

    // =========================================================
    // HELPER: SUCCESS
    // =========================================================

    private Map<String, Object> success(
            String message) {

        Map<String, Object> response =
                new HashMap<>();

        response.put(
                "status",
                "success"
        );

        response.put(
                "message",
                message
        );

        return response;
    }

    // =========================================================
    // HELPER: ERROR
    // =========================================================

    private Map<String, Object> error(
            String message) {

        Map<String, Object> response =
                new HashMap<>();

        response.put(
                "status",
                "error"
        );

        response.put(
                "message",
                message
        );

        return response;
    }
}