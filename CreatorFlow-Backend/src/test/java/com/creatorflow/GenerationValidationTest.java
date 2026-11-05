package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

import static org.junit.jupiter.api.Assertions.*;

class GenerationValidationTest {
    @Test void storyboardRequiresStrictSceneTypesAndConsistentDuration(){
        var api=new GenerationApi(null,null,null,new ObjectMapper(),new DataSourceTransactionManager());
        UUID id=UUID.randomUUID();
        String scene="{\"durationSec\":15,\"narration\":\"Narration\",\"visualType\":\"IMAGE\",\"prompt\":\"Visual prompt\"}";
        assertEquals(15,api.parse(id,"Title","{\"scenes\":["+scene+"]}").scenes().getFirst().durationSec());
        for(String raw:new String[]{
            "{\"scenes\":[]}",
            "{\"scenes\":[{\"durationSec\":\"15\",\"narration\":\"Narration\",\"visualType\":\"IMAGE\",\"prompt\":\"Visual prompt\"}]}",
            "{\"scenes\":[{\"durationSec\":15,\"narration\":\"\",\"visualType\":\"IMAGE\",\"prompt\":\"Visual prompt\"}]}",
            "{\"scenes\":[{\"durationSec\":15,\"narration\":\"Narration\",\"visualType\":\"UNKNOWN\",\"prompt\":\"Visual prompt\"}]}",
            "{\"totalDurationSec\":30,\"scenes\":["+scene+"]}",
            "{\"scenes\":[{\"durationSec\":5,\"narration\":\"Narration\",\"visualType\":\"IMAGE\",\"prompt\":\"Visual prompt\"}]}"
        }) assertThrows(IllegalArgumentException.class,()->api.parse(id,"Title",raw));
    }
}
