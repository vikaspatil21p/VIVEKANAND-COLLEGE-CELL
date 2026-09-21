package com.vivekanand.placement;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PlacementController.class)
class PlacementControllerApplicationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JdbcTemplate jdbcTemplate;

    @Test
    void applicationsEndpointReturnsApplicationRows() throws Exception {
        when(jdbcTemplate.queryForList(
                anyString(),
                (Object[]) any()))
                .thenReturn(List.of(Map.of(
                        "id", 1,
                        "studentId", "STU001",
                        "fullName", "Asha Patil",
                        "department", "Computer Science",
                        "companyName", "Infosys",
                        "jobTitle", "Software Engineer",
                        "jobType", "Full Time",
                        "applicationStatus", "Applied",
                        "appliedAt", "2025-07-12"
                )));

        mockMvc.perform(get("/api/applications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.applications[0].companyName").value("Infosys"))
                .andExpect(jsonPath("$.applications[0].jobTitle").value("Software Engineer"));
    }

    @Test
    void genericLoginEndpointAuthenticatesStudentAndReturnsId() throws Exception {
        when(jdbcTemplate.queryForList(
                org.mockito.ArgumentMatchers.contains("FROM students"),
                (Object[]) any()))
                .thenReturn(List.of(Map.of(
                        "student_id", 7,
                        "fullName", "Asha Patil",
                        "email", "asha@example.com",
                        "username", "asha",
                        "mobile", "9876543210",
                        "course", "BCA",
                        "department", "Computer Science"
                )));

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"asha\",\"password\":\"secret\",\"role\":\"student\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.role").value("student"))
                .andExpect(jsonPath("$.user.id").value(7))
                .andExpect(jsonPath("$.user.studentId").value("STU007"));
    }
}