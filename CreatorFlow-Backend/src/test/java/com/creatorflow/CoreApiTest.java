package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CoreApiTest {
    @Test
    void generationWithoutCredentialsFailsBeforeWritingOrCallingProvider() {
        JdbcTemplate db = new JdbcTemplate();
        CoreApi api = new CoreApi(db, new ObjectMapper(), null,
            new AiService(db,new ObjectMapper(),"","gemini-2.5-flash","","openrouter/free",false));
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> api.generate(new CoreApi.GenerateIdeas("Java", "en", 2, 60, "explainer")));
        assertEquals(503, error.getStatusCode().value());
    }
    @Test
    void configuredKeyStillRequiresExplicitProviderOptIn() {
        JdbcTemplate db=new JdbcTemplate();
        CoreApi api = new CoreApi(db, new ObjectMapper(), null,
            new AiService(db,new ObjectMapper(),"dummy-key","gemini-2.5-flash","","openrouter/free",false));
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> api.generate(new CoreApi.GenerateIdeas("Java", "en", 2, 60, "explainer")));
        assertEquals(503, error.getStatusCode().value());
    }
}
