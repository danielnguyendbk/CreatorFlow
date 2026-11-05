package com.creatorflow;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/assets")
public class AssetApi {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final MediaValidator validator;
    private final Path root;
    AssetApi(JdbcTemplate db,ObjectMapper json,MediaValidator validator,@Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String directory) throws IOException {
        this.db=db; this.json=json;this.validator=validator; this.root=Path.of(directory).toAbsolutePath().normalize(); Files.createDirectories(root);
    }
    private static final String SELECT="select id,filename,asset_type as \"assetType\",content_id as \"contentId\",scene_id as \"sceneId\",duration_sec as \"durationSec\",file_size_bytes as \"fileSizeBytes\",mime_type as \"mimeType\",metadata,created_at as \"createdAt\",updated_at as \"updatedAt\" from assets";
    private Map<String,Object> shape(Map<String,Object> row){
        var result=new LinkedHashMap<>(row);
        try { result.put("metadata",json.readValue(row.get("metadata").toString(),Map.class)); }
        catch(IOException e) { throw new IllegalStateException("Invalid asset metadata",e); }
        result.put("url","/api/assets/"+row.get("id")+"/download");result.put("thumbnailUrl",null);
        return result;
    }
    @GetMapping List<Map<String,Object>> all(){return db.queryForList(SELECT+" order by created_at desc").stream().map(this::shape).toList();}
    @GetMapping("/inbox") List<Map<String,Object>> inbox(){return db.queryForList(SELECT+" where content_id is null order by created_at desc").stream().map(this::shape).toList();}
    @GetMapping("/by-content/{contentId}") List<Map<String,Object>> byContent(@PathVariable UUID contentId){return db.queryForList(SELECT+" where content_id=? order by created_at desc",contentId).stream().map(this::shape).toList();}
    @GetMapping("/{id}") Map<String,Object> one(@PathVariable UUID id){
        var rows=db.queryForList(SELECT+" where id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asset not found");return shape(rows.getFirst());
    }
    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @Transactional Map<String,Object> upload(@RequestPart MultipartFile file,
            @RequestParam(required=false) UUID contentId,@RequestParam(required=false) UUID sceneId) throws IOException {
        if(file.isEmpty() || file.getSize()>250L*1024*1024) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid file size");
        String mime=file.getContentType();
        byte[] head;
        try(var stream=file.getInputStream()){head=stream.readNBytes(64);}
        String type=validator.classify(mime,head);
        if(sceneId!=null){
            var rows=db.queryForList("select b.content_id from scenes s join storyboards b on b.id=s.storyboard_id where s.id=?",sceneId);
            if(rows.isEmpty() || !rows.getFirst().get("content_id").equals(contentId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Scene does not belong to content");
        }
        UUID id=UUID.randomUUID(); Path path=root.resolve(id.toString()).normalize();
        if(!path.startsWith(root)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid path");
        try {
            Files.copy(file.getInputStream(),path);
            validator.validate(path,mime);
            db.update("insert into assets(id,filename,asset_type,content_id,scene_id,file_size_bytes,mime_type,storage_path,validation_status,validated_at) values (?,?,?,?,?,?,?,?,'VERIFIED',now())",
                id,Path.of(file.getOriginalFilename()==null?"upload":file.getOriginalFilename()).getFileName().toString(),type,contentId,sceneId,file.getSize(),mime,path.toString());
            if(sceneId!=null) db.update("update scenes set asset_id=?,asset_status='READY' where id=?",id,sceneId);
            return one(id);
        } catch(Exception e){Files.deleteIfExists(path);throw e;}
    }
    @PostMapping("/{id}/assign") @Transactional Map<String,Object> assign(@PathVariable UUID id,@RequestBody Map<String,UUID> body){
        UUID contentId=body.get("contentId"),sceneId=body.get("sceneId");
        if(contentId==null || sceneId==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Content and scene required");
        var rows=db.queryForList("select b.content_id from scenes s join storyboards b on b.id=s.storyboard_id where s.id=?",sceneId);
        if(rows.isEmpty() || !rows.getFirst().get("content_id").equals(contentId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Scene does not belong to content");
        var assets=db.queryForList("select storage_path,mime_type,validation_status from assets where id=? for update",id);
        if(assets.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asset not found");
        var asset=assets.getFirst();
        Path path=Path.of((String)asset.get("storage_path")).toAbsolutePath().normalize();
        if(!path.startsWith(root)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"MEDIA_PATH_INVALID");
        if(!"VERIFIED".equals(asset.get("validation_status"))){
            validator.validate(path,(String)asset.get("mime_type"));
            db.update("update assets set validation_status='VERIFIED',validated_at=now() where id=?",id);
        }
        db.update("update assets set content_id=?,scene_id=?,updated_at=now() where id=?",contentId,sceneId,id);
        db.update("update scenes set asset_id=?,asset_status='READY' where id=?",id,sceneId);
        return one(id);
    }
    @GetMapping("/{id}/download") ResponseEntity<Resource> download(@PathVariable UUID id) throws IOException {
        var rows=db.queryForList("select storage_path,mime_type,filename from assets where id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asset not found");
        var row=rows.getFirst();Path path=Path.of((String)row.get("storage_path")).toAbsolutePath().normalize();
        if(!path.startsWith(root) || !Files.isRegularFile(path)) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asset file missing");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String)row.get("mime_type")))
            .header(HttpHeaders.CONTENT_DISPOSITION,"inline; filename=\""+((String)row.get("filename")).replace("\"", "")+"\"")
            .body(new UrlResource(path.toUri()));
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional void delete(@PathVariable UUID id) throws IOException {
        var rows=db.queryForList("select storage_path from assets where id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asset not found");
        db.update("update scenes set asset_id=null,asset_status='WAITING_FOR_ASSET' where asset_id=?",id);
        db.update("delete from assets where id=?",id);
        Path path=Path.of((String)rows.getFirst().get("storage_path")).toAbsolutePath().normalize();
        if(path.startsWith(root)) Files.deleteIfExists(path);
    }
}
