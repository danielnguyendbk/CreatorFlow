package com.creatorflow;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="creatorflow.api-token=fixture-test-token")
class ApiSecurityIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry properties){
        properties.add("spring.datasource.url",()->System.getenv("CREATORFLOW_TEST_DB_URL"));
        properties.add("spring.datasource.username",()->System.getenv("CREATORFLOW_TEST_DB_USER"));
        properties.add("spring.datasource.password",()->System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
    }
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate db;

    @Test void corruptMediaReturnsStructured422WithoutCreatingAsset(){
        int before=db.queryForObject("select count(*) from assets",Integer.class);
        HttpHeaders fileHeaders=new HttpHeaders();fileHeaders.setContentType(MediaType.IMAGE_PNG);
        byte[] bytes=new byte[]{(byte)0x89,'P','N','G',13,10,26,10,0,0,0,0};
        var file=new ByteArrayResource(bytes){@Override public String getFilename(){return "corrupt.png";}};
        var body=new LinkedMultiValueMap<String,Object>();
        body.add("file",new HttpEntity<>(file,fileHeaders));
        HttpHeaders headers=new HttpHeaders();headers.setBearerAuth("fixture-test-token");headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        var response=http.exchange("/api/assets",HttpMethod.POST,new HttpEntity<>(body,headers),String.class);
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY,response.getStatusCode());
        org.junit.jupiter.api.Assertions.assertTrue(response.getBody().contains("MEDIA_INVALID"));
        assertEquals(before,db.queryForObject("select count(*) from assets",Integer.class));
    }

    @Test void readAndWriteRequireTokenWhileReadinessIsPublic(){
        assertEquals(HttpStatus.UNAUTHORIZED,http.getForEntity("/api/v2/publication-review/jobs/00000000-0000-0000-0000-000000000001",String.class).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,http.postForEntity("/api/v2/publication-review/manifests/00000000-0000-0000-0000-000000000001/decision",MapBody.of("{}"),String.class).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,http.getForEntity("/api/ideas",String.class).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,http.postForEntity("/api/ideas",MapBody.of("{}"),String.class).getStatusCode());
        HttpHeaders wrong=new HttpHeaders();wrong.setBearerAuth("wrong-token");
        assertEquals(HttpStatus.UNAUTHORIZED,http.exchange("/api/ideas",HttpMethod.GET,new HttpEntity<>(wrong),String.class).getStatusCode());
        HttpHeaders valid=new HttpHeaders();valid.setBearerAuth("fixture-test-token");valid.setContentType(MediaType.APPLICATION_JSON);
        assertEquals(HttpStatus.BAD_REQUEST,http.exchange("/api/ideas",HttpMethod.POST,new HttpEntity<>("{\"title\":\"\"}",valid),String.class).getStatusCode());
        assertEquals(HttpStatus.OK,http.getForEntity("/actuator/health/readiness",String.class).getStatusCode());
    }

    private static final class MapBody {
        static HttpEntity<String> of(String body){HttpHeaders headers=new HttpHeaders();headers.setContentType(MediaType.APPLICATION_JSON);return new HttpEntity<>(body,headers);}
    }
}
