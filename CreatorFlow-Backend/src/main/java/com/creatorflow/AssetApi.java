package com.creatorflow;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
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
    private final Path root;
    AssetApi(JdbcTemplate db,ObjectMapper json,@Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String directory) throws IOException {
        this.db=db; this.json=json; this.root=Path.of(directory).toAbsolutePath().normalize(); Files.createDirectories(root);
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
        String type;
        if(mime!=null && mime.startsWith("video/")) type="VIDEO";
        else if(mime!=null && mime.startsWith("image/")) type="IMAGE";
        else if(mime!=null && mime.startsWith("audio/")) type="AUDIO";
        else if(List.of("text/vtt","application/x-subrip","text/plain").contains(mime)) type="SUBTITLE";
        else throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"Unsupported MIME type");
        byte[] head;
        try(var stream=file.getInputStream()){head=stream.readNBytes(64);}
        if(!validSignature(type,head)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"File content does not match supported media");
        if(sceneId!=null){
            var rows=db.queryForList("select b.content_id from scenes s join storyboards b on b.id=s.storyboard_id where s.id=?",sceneId);
            if(rows.isEmpty() || !rows.getFirst().get("content_id").equals(contentId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Scene does not belong to content");
        }
        UUID id=UUID.randomUUID(); Path path=root.resolve(id.toString()).normalize();
        if(!path.startsWith(root)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid path");
        try {
            Files.copy(file.getInputStream(),path);
            db.update("insert into assets(id,filename,asset_type,content_id,scene_id,file_size_bytes,mime_type,storage_path) values (?,?,?,?,?,?,?,?)",
                id,Path.of(file.getOriginalFilename()==null?"upload":file.getOriginalFilename()).getFileName().toString(),type,contentId,sceneId,file.getSize(),mime,path.toString());
            if(sceneId!=null) db.update("update scenes set asset_id=?,asset_status='READY' where id=?",id,sceneId);
            return one(id);
        } catch(Exception e){Files.deleteIfExists(path);throw e;}
    }
    private boolean validSignature(String type,byte[] b){
        String text=new String(b,StandardCharsets.US_ASCII);
        return switch(type){
            case "IMAGE" -> (b.length>=8 && b[0]==(byte)0x89 && text.substring(1,4).equals("PNG"))
                || (b.length>=3 && b[0]==(byte)0xff && b[1]==(byte)0xd8 && b[2]==(byte)0xff)
                || text.startsWith("GIF8");
            case "VIDEO" -> (b.length>=12 && text.substring(4,8).equals("ftyp"))
                || (b.length>=4 && b[0]==0x1a && b[1]==0x45 && b[2]==(byte)0xdf && b[3]==(byte)0xa3);
            case "AUDIO" -> text.startsWith("RIFF") && text.length()>=12 && text.substring(8,12).equals("WAVE")
                || text.startsWith("ID3") || (b.length>=2 && b[0]==(byte)0xff && (b[1] & 0xe0)==0xe0);
            case "SUBTITLE" -> text.startsWith("WEBVTT") || text.stripLeading().matches("(?s)^\\d+\\s*\\R.*");
            default -> false;
        };
    }
    @PostMapping("/{id}/assign") @Transactional Map<String,Object> assign(@PathVariable UUID id,@RequestBody Map<String,UUID> body){
        UUID contentId=body.get("contentId"),sceneId=body.get("sceneId");
        if(contentId==null || sceneId==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Content and scene required");
        var rows=db.queryForList("select b.content_id from scenes s join storyboards b on b.id=s.storyboard_id where s.id=?",sceneId);
        if(rows.isEmpty() || !rows.getFirst().get("content_id").equals(contentId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Scene does not belong to content");
        if(db.update("update assets set content_id=?,scene_id=?,updated_at=now() where id=?",contentId,sceneId,id)==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asset not found");
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
    @DeleteMapping("/{id}") @Transactional void delete(@PathVariable UUID id) throws IOException {
        var rows=db.queryForList("select storage_path from assets where id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asset not found");
        db.update("update scenes set asset_id=null,asset_status='WAITING_FOR_ASSET' where asset_id=?",id);
        db.update("delete from assets where id=?",id);
        Path path=Path.of((String)rows.getFirst().get("storage_path")).toAbsolutePath().normalize();
        if(path.startsWith(root)) Files.deleteIfExists(path);
    }
}
