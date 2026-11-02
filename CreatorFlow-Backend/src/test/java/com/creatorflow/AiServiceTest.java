package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AiServiceTest {
    @Test void noProviderCallWithoutExplicitOptIn() {
        var service=new AiService(new JdbcTemplate(),new ObjectMapper(),"dummy","gemini-2.5-flash","","openrouter/free",false);
        var error=assertThrows(ResponseStatusException.class,()->service.generateJson("IDEA",null,"test"));
        assertEquals(503,error.getStatusCode().value());
    }
    @Test void noProviderCallWithoutCredentials() {
        var service=new AiService(new JdbcTemplate(),new ObjectMapper(),"","gemini-2.5-flash","","openrouter/free",true);
        var error=assertThrows(ResponseStatusException.class,()->service.generateJson("IDEA",null,"test"));
        assertEquals(503,error.getStatusCode().value());
    }
}
