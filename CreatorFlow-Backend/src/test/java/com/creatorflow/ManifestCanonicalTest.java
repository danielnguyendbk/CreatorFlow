package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ManifestCanonicalTest {
    final ContentManifests manifests=new ContentManifests(null,new ObjectMapper(),null);
    @Test void objectKeyOrderDoesNotChangeFingerprintButArrayOrderAndContentDo() {
        var first=new LinkedHashMap<String,Object>();first.put("title","Video Việt Nam");first.put("media",Map.of("sizeBytes",100,"sha256","abc"));first.put("hashtags",List.of("#one","#two"));
        var second=new LinkedHashMap<String,Object>();second.put("hashtags",List.of("#one","#two"));second.put("media",Map.of("sha256","abc","sizeBytes",100L));second.put("title","Video Việt Nam");
        assertEquals(AgentIdentity.hash(manifests.canonical(first)),AgentIdentity.hash(manifests.canonical(second)));
        second.put("hashtags",List.of("#two","#one"));assertNotEquals(AgentIdentity.hash(manifests.canonical(first)),AgentIdentity.hash(manifests.canonical(second)));
    }
}
